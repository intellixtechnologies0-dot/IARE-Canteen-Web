import './App.css'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import React, { useEffect, useState, useRef } from 'react'
import supabase from './lib/supabaseClient'
import { BrowserQRCodeReader } from '@zxing/browser'

// Normalize status for UI comparisons (handles lowercase/uppercase from DB)
const normStatus = (s) => String(s || '').toUpperCase()

export default function App() {
  return (
    <ErrorBoundary>
      <DashboardShell />
    </ErrorBoundary>
  )
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error in App:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Application error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'crimson' }}>{String(this.state.error)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

function DashboardShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [connectionStatus, setConnectionStatus] = useState('checking')
  const titles = {
    '/': 'Dashboard',
    '/place-order': 'Place Order',
    '/orders': 'Orders',
    '/inventory': 'Inventory Management',
  
    '/scan': 'Scan QR',
    '/reports': 'Reports',
    '/ai': 'AI Predictions',
    '/settings': 'Settings',
  }
  const title = titles[location.pathname] || 'Dashboard'
  // Orders panel view controls
  const [ordersView, setOrdersView] = useState('live')
  const [ordersPictureMode, setOrdersPictureMode] = useState(false)
  const [recent, setRecent] = useState([])

  // Simple in-memory orders state shared between Home and Orders panels
  const [orders, setOrders] = useState([])
  const [delivered, setDelivered] = useState([])
  const [activity, setActivity] = useState([]) // {orderId, items, from, to, at, prevLoc, nextLoc}
  const [updatingIds, setUpdatingIds] = useState({}) // { [orderId]: true }

  const updateOrderStatus = async (orderId, nextStatus) => {
    // Snapshot current orders to avoid stale closures and allow rollback
    const prevOrdersSnapshot = [...orders]
    // Optimistic UI update to give immediate feedback
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)))
    // Mark as updating to prevent action flicker
    setUpdatingIds((prev) => ({ ...prev, [orderId]: true }))

    try {
      // Persist status via RPC
      const { data, error } = await supabase.rpc('update_order_status_flexible', {
        p_order_id: orderId,
        p_new_status: String(nextStatus).toLowerCase(),
      })
      if (error) throw error

      // Locate the order from the snapshot (fallback to latest state)
      const found = prevOrdersSnapshot.find((o) => o.id === orderId) || orders.find((o) => o.id === orderId)
      if (!found) return
      const prevStatus = found.status
      const now = new Date().toLocaleString()

      // Handle transitions
      if (nextStatus === 'READY') {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'READY' } : o)))
        setRecent((prev) => {
          const pruned = prev.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING'))
          return [{ orderId, itemName: found.item_name, from: prevStatus, to: 'READY', ts: Date.now() }, ...pruned]
        })
        setActivity((a) => [
          { orderId, itemName: found.item_name, from: prevStatus, to: 'READY', at: now, ts: Date.now(), prevLoc: 'live', nextLoc: 'live' },
          ...a.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING')),
        ])
        return
      }

      if (nextStatus === 'DELIVERED') {
        // Move the order out of the live list into the past list
        setOrders((prev) => prev.filter((o) => o.id !== orderId))
        setDelivered((d) => [{ ...found, status: 'DELIVERED', deliveredAt: Date.now() }, ...d])
        setRecent((prev) => {
          const pruned = prev.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING'))
          return [{ orderId, itemName: found.item_name, from: prevStatus, to: 'DELIVERED', ts: Date.now() }, ...pruned]
        })
        setActivity((a) => [
          { orderId, itemName: found.item_name, from: prevStatus, to: 'DELIVERED', at: now, ts: Date.now(), prevLoc: 'live', nextLoc: 'delivered' },
          ...a.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING')),
        ])
        return
      }

      // default: update status in-place
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)))
      setRecent((prev) => [{ orderId, itemName: found.item_name, from: prevStatus, to: nextStatus, ts: Date.now() }, ...prev])
      setActivity((a) => [
        { orderId, itemName: found.item_name, from: prevStatus, to: nextStatus, at: now, ts: Date.now(), prevLoc: 'live', nextLoc: 'live' },
        ...a,
      ])

    } catch (err) {
      console.error('Failed to update order status:', err)
      // Rollback optimistic update
      try { setOrders(prevOrdersSnapshot) } catch (e) { /* ignore */ }
      alert('Failed to update order status: ' + (err.message || err))
    } finally {
      // Clear updating flag
      setUpdatingIds((prev) => {
        const next = { ...prev }
        delete next[orderId]
        return next
      })
    }
  }

  // subscribe to realtime orders on mount (with a 1s polling fallback until realtime confirms)
  useEffect(() => {
    // fetch initial orders from Supabase if configured
    const fetchOrders = async () => {
      try {
        // Check if Supabase is configured
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
        
        if (!supabaseUrl || !supabaseKey || supabaseUrl === 'your_supabase_project_url_here') {
          console.warn('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file')
          console.log('Supabase URL:', supabaseUrl)
          console.log('Supabase Key exists:', !!supabaseKey)
          setConnectionStatus('not-configured')
          return
        }

        setConnectionStatus('connecting')
        // Fetch in pages to avoid PostgREST default row limits
        const pageSize = 1000
        let from = 0
        let all = []
        while (true) {
          const to = from + pageSize - 1
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
            .range(from, to)
        if (error) throw error
          const batch = data || []
          console.log('Fetched batch:', batch.length, 'orders')
          all = all.concat(batch)
          if (batch.length < pageSize) break
          from += pageSize
        }
        // order_token is now directly available in the orders table
        // Merge item prices from order_items (fallback to food_items)
        try {
          const itemIds = Array.from(new Set((all || []).map(o => o.item_id || o.itemId || o.item).filter(Boolean)))
          if (itemIds.length > 0) {
            let priceMap = Object.create(null)
            // Try order_items first
            try {
              const { data: rows, error: e1 } = await supabase
                .from('order_items')
                .select('*')
                .in('id', itemIds)
              if (e1) throw e1
              for (const r of rows || []) {
                const key = r.id || r.item_id || r.code || r.slug
                const val = r.price ?? r.cost ?? r.rate ?? r.amount
                if (key && typeof val === 'number') priceMap[key] = val
              }
              // If we didn't find all keys, try matching on item_id too
              const missing = itemIds.filter(id => priceMap[id] == null)
              if (missing.length > 0) {
                const { data: rows2 } = await supabase
                  .from('order_items')
                  .select('*')
                  .in('item_id', missing)
                for (const r of rows2 || []) {
                  const key = r.item_id || r.id || r.code || r.slug
                  const val = r.price ?? r.cost ?? r.rate ?? r.amount
                  if (key && typeof val === 'number') priceMap[key] = val
                }
              }
            } catch (_) {
              // Fallback to food_items
              const { data: rows, error: e2 } = await supabase
                .from('food_items')
                .select('*')
                .in('id', itemIds)
              if (!e2) {
                for (const r of rows || []) {
                  const key = r.id || r.item_id || r.code || r.slug
                  const val = r.price ?? r.cost ?? r.rate ?? r.amount
                  if (key && typeof val === 'number') priceMap[key] = val
                }
              }
            }
            // Apply resolved prices if total_amount is missing/null
            all = all.map(o => {
              const key = o.item_id || o.itemId || o.item
              const resolved = priceMap[key]
              return resolved != null && (o.total_amount == null || Number.isNaN(o.total_amount)) ? { ...o, total_amount: resolved } : o
            })
          }
        } catch (e) {
          console.warn('Price merge skipped:', e?.message || e)
        }
        // Split into live and past
        const live = (all || []).filter((o) => normStatus(o.status) !== 'DELIVERED')
        const past = (all || []).filter((o) => normStatus(o.status) === 'DELIVERED')
        console.log('Total orders fetched:', all.length)
        console.log('Live orders:', live.length)
        console.log('Past orders:', past.length)
        console.log('Sample order:', all[0])
        setOrders(live)
        setDelivered(past)
        setConnectionStatus('connected')
      } catch (err) {
        console.error('Supabase orders fetch failed:', err)
        setConnectionStatus('error')
        // Show more detailed error info
        if (err.message?.includes('JWT')) {
          console.error('Authentication error - check your Supabase anon key')
        } else if (err.message?.includes('relation "orders" does not exist')) {
          console.error('Orders table does not exist - run the SQL script in Supabase')
        }
      }
    }

    fetchOrders()

    // start polling every second as a fallback until realtime delivers first event
    let intervalId = setInterval(fetchOrders, 1000)
    let gotRealtime = false

    const channel = supabase.channel('public:orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        // when realtime arrives, stop polling and apply change
        if (!gotRealtime) {
          gotRealtime = true
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }
        let enriched = payload.new
        // order_token is now directly available in the orders table
        // Enrich price if missing using order_items/food_items
        try {
          if (enriched && (enriched.total == null || Number.isNaN(enriched.total))) {
            const key = enriched.item_id || enriched.itemId || enriched.item
            if (key) {
              let price = null
              try {
                const { data: rows, error } = await supabase
                  .from('order_items')
                  .select('*')
                  .or(`id.eq.${key},item_id.eq.${key}`)
                if (!error) {
                  const r = (rows || [])[0]
                  price = r ? (r.price ?? r.cost ?? r.rate ?? r.amount ?? null) : null
                }
              } catch (_) {}
              if (price == null) {
                try {
                  const { data: rows2, error: e2 } = await supabase
                    .from('food_items')
                    .select('*')
                    .or(`id.eq.${key},item_id.eq.${key}`)
                  if (!e2) {
                    const r2 = (rows2 || [])[0]
                    price = r2 ? (r2.price ?? r2.cost ?? r2.rate ?? r2.amount ?? null) : null
                  }
                } catch (_) {}
              }
              if (typeof price === 'number') {
                enriched = { ...enriched, total_amount: price }
              }
            }
          }
        } catch (_) {}
        setOrders((prev) => [enriched, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, async (payload) => {
        if (!gotRealtime) {
          gotRealtime = true
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }
        let enriched = payload.new
        try {
          // Preserve existing token if known
          setOrders((prev) => {
            const found = prev.find(o => o.id === payload.new.id)
            const tokenExisting = found && (found.order_token || found.token_no)
            let next = { ...payload.new }
            if (tokenExisting) {
              next.token_no = tokenExisting
              next.order_token = tokenExisting
            }
            // If delivered, remove from live; otherwise, update in place
            if (normStatus(next.status) === 'DELIVERED') {
              return prev.filter(o => o.id !== next.id)
            }
            return prev.map(o => (o.id === next.id ? next : o))
          })
          // If delivered, add to past list
          if (normStatus(payload.new.status) === 'DELIVERED') {
            setDelivered((d) => [{ ...enriched, deliveredAt: Date.now() }, ...d.filter((o) => o.id !== enriched.id)])
          }
          return
        } catch (e) {
          // Fallback: simple replace
          if (normStatus(enriched.status) === 'DELIVERED') {
            setOrders((prev) => prev.filter(o => o.id !== enriched.id))
            setDelivered((d) => [{ ...enriched, deliveredAt: Date.now() }, ...d.filter((o) => o.id !== enriched.id)])
          } else {
            setOrders((prev) => prev.map(o => (o.id === enriched.id ? enriched : o)))
          }
        }
      })
      .subscribe()

    return () => {
      if (intervalId) clearInterval(intervalId)
      try { channel.unsubscribe() } catch (e) { /* ignore */ }
    }
  }, [])

  const revertActivity = async (entry) => {
    if (!entry) return
    const { orderId, from, to, prevLoc, nextLoc } = entry
    if (prevLoc === 'live' && nextLoc === 'delivered') {
      // move back from delivered to live with previous status
      const found = delivered.find((o) => o.id === orderId)
      if (!found) return
      setDelivered((d) => d.filter((o) => o.id !== orderId))
      setOrders((prev) => [{ ...found, status: from }, ...prev])
      // record revert in recent updates for Home panel
      setRecent((prev) => [{ orderId, itemName: found.item_name, from: to, to: from, ts: Date.now() }, ...prev])
      // persist to backend so realtime reflects across clients
      try {
        await supabase.rpc('update_order_status_flexible', {
          p_order_id: orderId,
          p_new_status: String(from).toLowerCase(),
        })
      } catch (e) { /* ignore; local state already reflects revert */ }
    } else if (prevLoc === 'live' && nextLoc === 'live') {
      // just status change revert
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: from } : o)))
      // try to find the order name from current state to log the revert
      try {
        const current = orders.find((o) => o.id === orderId)
        const itemName = current?.item_name || 'Order Item'
        setRecent((prev) => [{ orderId, itemName, from: to, to: from, ts: Date.now() }, ...prev])
      } catch (_) { /* ignore */ }
      try {
        await supabase.rpc('update_order_status_flexible', {
          p_order_id: orderId,
          p_new_status: String(from).toLowerCase(),
        })
      } catch (e) { /* ignore */ }
    }
    // Remove the reverted entry from activity to avoid confusion
    setActivity((a) => a.filter((e) => e !== entry))
  }

  // Auto-prune recent updates older than 25 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setRecent((prev) => prev.filter((e) => Date.now() - e.ts < 25000))
      setActivity((prev) => prev.filter((e) => (e.ts ? Date.now() - e.ts < 25000 : true)))
    }, 1000)
    return () => clearInterval(id)
  }, [])
  // Expose current data for the Reports page to access
  useEffect(() => {
    window.__IARE_ORDERS__ = orders
    window.__IARE_DELIVERED__ = delivered
  }, [orders, delivered])

  return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="brand">IARE Canteen</h2>
        <nav className="nav">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/place-order">Place Order</NavLink>
          <NavLink to="/orders">Orders</NavLink>
          <NavLink to="/inventory">Inventory Management</NavLink>
  
          <NavLink to="/scan">Scan QR</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/ai">AI Predictions</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ margin: 0 }}>{title}</h1>
            {location.pathname === '/inventory' && (
              <button
                className="btn"
                onClick={() => navigate('/manage-quantity')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: 'var(--muted-bg)',
                  fontSize: 12,
                  lineHeight: 1.2
                }}
              >
                Manage Quantity
              </button>
            )}
            {/* connection status indicator removed per request */}
          </div>
          {location.pathname === '/orders' && (
            <div className="actions" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setOrdersView('activity')} disabled={ordersView === 'activity'}>⏱ Recent</button>
              <button className="btn" onClick={() => setOrdersView('live')} disabled={ordersView === 'live'}>🔴 Live</button>
              <button className="btn" onClick={() => setOrdersView('past')} disabled={ordersView === 'past'}>📜 Past</button>
              {ordersView === 'live' && (
                <button className="btn" onClick={() => setOrdersPictureMode((v) => !v)}>
                  {ordersPictureMode ? '📃 List Mode' : '🖼 Picture Mode'}
                </button>
              )}
            </div>
          )}
          {location.pathname !== '/orders' && location.pathname !== '/place-order' && (
            <input className="search" placeholder="Search" />
          )}
        </header>
        <Routes>
          <Route path="/" element={<HomePage recent={recent} orders={orders} onUpdateStatus={updateOrderStatus} updatingIds={updatingIds} />} />
          <Route path="/place-order" element={<PlaceOrderPage />} />
          <Route path="/orders" element={<OrdersPage orders={orders} deliveredOrders={delivered} activity={activity} onUpdateStatus={updateOrderStatus} onRevert={revertActivity} view={ordersView} pictureMode={ordersPictureMode} updatingIds={updatingIds} />} />
          <Route path="/inventory" element={<InventoryPage />} />
  
          <Route path="/scan" element={<QRScanPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/ai" element={<AIPredictionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          
        </Routes>
      </main>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <section className="card">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  )
}

function HomePage({ orders, recent = [], onUpdateStatus, updatingIds = {} }) {
  const navigate = useNavigate()
  const latestOrders = [...orders]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 2)
  const deliveredGlobal = window.__IARE_DELIVERED__ || []
  const totalCount = orders.length + deliveredGlobal.length
  const pendingCount = orders.filter((o) => normStatus(o.status) !== 'READY').length
  const completedCount = deliveredGlobal.length
  const [shortage, setShortage] = useState([])

  // Fetch out-of-stock items from Supabase food_items for Shortage table
  useEffect(() => {
    const fetchShortage = async () => {
      try {
        const pageSize = 1000
        let from = 0
        let all = []
        while (true) {
          const to = from + pageSize - 1
          const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .range(from, to)
          if (error) throw error
          const batch = data || []
          all = all.concat(batch)
          if (batch.length < pageSize) break
          from += pageSize
        }
        const mapped = all.map((r) => {
          const name = r.name ?? r.item_name ?? r.title ?? r.label ?? 'Item'
          const inStock = (
            (typeof r.available_quantity === 'number' ? r.available_quantity > 0 : undefined) ??
            r.in_stock ?? r.available ?? r.is_available ?? (typeof r.stock === 'number' ? r.stock > 0 : undefined) ??
            (typeof r.status === 'string' ? String(r.status).toLowerCase() === 'in' : undefined) ?? true
          )
          return { name, inStock: !!inStock }
        })
        setShortage(mapped.filter(i => !i.inStock))
      } catch (e) {
        setShortage([])
      }
    }
    fetchShortage()
  }, [])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="grid-2">
        <Card title="Orders Today">
          <div className="stats">
            <div>
              <div className="stat-value">{totalCount}</div>
              <div className="stat-label">Total</div>
            </div>
            <div>
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div>
              <div className="stat-value">{completedCount}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>
        </Card>
        <Card title="Quick Actions">
          <div className="actions">
            <button className="btn" onClick={() => navigate('/orders')}>View All Orders</button>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Shortage">
          {shortage.length === 0 ? (
            <div className="muted">No shortages.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                </tr>
              </thead>
              <tbody>
                {shortage.slice(0, 5).map((it, idx) => (
                  <tr key={idx}>
                    <td><strong>{it.name}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Recent Updates (<=25s)">
          <table className="table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>From → To</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e, i) => (
                <tr key={i}>
                  <td><strong>{e.itemName || 'Order Item'}</strong></td>
                  <td>{e.from} → {e.to}</td>
                  <td>{Math.max(0, 25 - Math.floor((Date.now() - e.ts)/1000))}s left</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <OrdersTable orders={latestOrders} onUpdateStatus={onUpdateStatus} updatingIds={updatingIds} />
    </div>
  )
}

function PlaceOrderPage() {
  const [placingOrderId, setPlacingOrderId] = useState(null)
  const [lastToken, setLastToken] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [counterTokens, setCounterTokens] = useState([])
  const [loadingCounter, setLoadingCounter] = useState(false)
  const [search, setSearch] = useState('')

  // Load items from Supabase `food_items` table (replaces testing items)
  useEffect(() => {
    const fetchFoodItems = async () => {
      try {
        const pageSize = 1000
        let from = 0
        let all = []
        while (true) {
          const to = from + pageSize - 1
          const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .range(from, to)
          if (error) throw error
          const batch = data || []
          all = all.concat(batch)
          if (batch.length < pageSize) break
          from += pageSize
        }
        const mapped = all.map((r) => ({
          id: r.id ?? r.item_id ?? r.slug ?? String(Math.random()).slice(2),
          name: r.name ?? r.item_name ?? 'Item',
          price: r.price ?? r.cost ?? 0,
          image: r.image_url ?? r.image ?? r.photo ?? 'https://via.placeholder.com/300?text=Food',
          description: r.description ?? ''
        }))
        // If no items loaded from database, use fallback items
        if (mapped.length === 0) {
          console.log('No food items found in database, using fallback items')
          const fallbackItems = [
            {
              id: 'fallback_1',
              name: 'Veg Biryani',
              price: 180,
              image: 'https://as1.ftcdn.net/v2/jpg/04/59/27/88/1000_F_459278894_92eSlejnR7NSwJRCbVyy9ZZibSmjbF8q.jpg',
              description: 'Delicious vegetarian biryani'
            },
            {
              id: 'fallback_2',
              name: 'Masala Dosa',
              price: 80,
              image: 'https://as2.ftcdn.net/v2/jpg/14/45/94/59/1000_F_1445945944_eBUM7ot1AWezNkqknKsRImNvLvFbmr7z.jpg',
              description: 'Crispy dosa with potato filling'
            },
            {
              id: 'fallback_3',
              name: 'Samosa',
              price: 40,
              image: 'https://as2.ftcdn.net/v2/jpg/15/85/73/65/1000_F_1585736532_NFMq8z0vAjbker6w9vuzoF8FmsxVRGPI.jpg',
              description: 'Spicy potato and pea samosa'
            }
          ]
          setMenuItems(fallbackItems)
        } else {
          setMenuItems(mapped)
        }
      } catch (e) {
        console.error('Failed to load food_items:', e)
        // Use fallback items if database fails
        const fallbackItems = [
          {
            id: 'fallback_1',
            name: 'Veg Biryani',
            price: 180,
            image: 'https://as1.ftcdn.net/v2/jpg/04/59/27/88/1000_F_459278894_92eSlejnR7NSwJRCbVyy9ZZibSmjbF8q.jpg',
            description: 'Delicious vegetarian biryani'
          },
          {
            id: 'fallback_2',
            name: 'Masala Dosa',
            price: 80,
            image: 'https://as2.ftcdn.net/v2/jpg/14/45/94/59/1000_F_1445945944_eBUM7ot1AWezNkqknKsRImNvLvFbmr7z.jpg',
            description: 'Crispy dosa with potato filling'
          },
          {
            id: 'fallback_3',
            name: 'Samosa',
            price: 40,
            image: 'https://as2.ftcdn.net/v2/jpg/15/85/73/65/1000_F_1585736532_NFMq8z0vAjbker6w9vuzoF8FmsxVRGPI.jpg',
            description: 'Spicy potato and pea samosa'
          }
        ]
        setMenuItems(fallbackItems)
      }
    }
    fetchFoodItems()
  }, [])

  // Fetch token numbers for items placed by Counter (order_placer = 'admin')
  const fetchCounterTokens = async () => {
    setLoadingCounter(true)
    try {
      const pageSize = 1000
      let from = 0
      let all = []
      while (true) {
        const to = from + pageSize - 1
        const { data, error } = await supabase
          .from('orders')
          .select('id, item_name, status, order_placer, created_at, order_token')
          .eq('order_placer', 'admin')
          .order('created_at', { ascending: false })
          .range(from, to)
        if (error) throw error
        const batch = data || []
        all = all.concat(batch)
        if (batch.length < pageSize) break
        from += pageSize
      }
      // order_token is now directly available in the orders table
      setCounterTokens(all)
    } catch (e) {
      console.error('Failed to fetch Counter tokens:', e)
    } finally {
      setLoadingCounter(false)
    }
  }

  useEffect(() => {
    fetchCounterTokens()
  }, [])

  const handlePlaceOrder = async (item) => {
    if (placingOrderId) return // Prevent multiple orders while one is processing
    
    setPlacingOrderId(item.id)
    try {
      // Generate a unique UUID for the order ID
      const orderId = crypto.randomUUID()
      
      // Generate a unique 4-digit token
      const token = Math.floor(1000 + Math.random() * 9000).toString()
      
      // Insert the order directly into the orders table
      console.log('Attempting to insert order:', {
        id: orderId,
        item_name: item.name,
        total_amount: item.price,
        status: 'PENDING',
        order_placer: 'admin',
        order_token: token,
        token_no: token,
        created_at: new Date().toISOString(),
        is_available: true
      })
      
      const { data, error } = await supabase
        .from('orders')
        .insert({
          id: orderId,
          item_name: item.name,
          total_amount: item.price,
          status: 'PENDING',
          order_placer: 'admin',
          order_token: token,
          token_no: token,
          created_at: new Date().toISOString(),
          is_available: true
        })
        .select()
        .single()
      
      if (error) {
        console.error('Failed to insert order:', error)
        // Check if it's a UUID format error
        if (error.message && error.message.includes('uuid')) {
          throw new Error('Database configuration error: Please check your Supabase table structure')
        }
        throw error
      }
      
      console.log('Order created successfully:', data)
      setLastToken(token)
      alert(`Order placed successfully! Token No: #${token}`)
      
      // The order will automatically appear in the Orders panel through Supabase realtime
      // No need to manually update local state
      
    } catch (err) {
      console.error('Failed to place order:', err)
      alert('Failed to place order: ' + (err.message || err))
    } finally {
      setPlacingOrderId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="Menu - Place Order (Cash Payment)">
        <div className="form" style={{ marginBottom: 8 }}>
          <div className="field" style={{ minWidth: 320 }}>
            <input className="input" style={{ width: '320px' }} placeholder="Search menu items..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: 20,
          padding: '16px 0'
        }}>
          {(menuItems.filter(it => {
            const q = search.trim().toLowerCase()
            return q ? String(it.name || '').toLowerCase().includes(q) : true
          })).map((item) => (
            <div key={item.id} style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              overflow: 'hidden',
              backgroundColor: 'white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
            }}
            >
              <div style={{ 
                height: '200px', 
                backgroundImage: `url(${item.image})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  fontWeight: '600'
                }}>
                  ₹{item.price}
                </div>
              </div>
              <div style={{ padding: '16px' }}>
                <h3 style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '18px', 
                  fontWeight: '600',
                  color: '#1f2937'
                }}>
                  {item.name}
                </h3>
                <p style={{ 
                  margin: '0 0 16px 0', 
                  fontSize: '14px', 
                  color: '#6b7280',
                  lineHeight: '1.4'
                }}>
                  {item.description}
                </p>
                <button 
                  className="btn" 
                  onClick={() => handlePlaceOrder(item)}
                  disabled={placingOrderId === item.id}
                  style={{ 
                    width: '100%',
                    backgroundColor: '#10b981', 
                    color: 'white',
                    padding: '12px',
                    fontSize: '16px',
                    fontWeight: '600',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: placingOrderId === item.id ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s',
                    opacity: placingOrderId === item.id ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (placingOrderId !== item.id) e.target.style.backgroundColor = '#059669'
                  }}
                  onMouseLeave={(e) => {
                    if (placingOrderId !== item.id) e.target.style.backgroundColor = '#10b981'
                  }}
                >
                  {placingOrderId === item.id ? 'Placing Order...' : '💰 Place Order'}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ 
          marginTop: '20px',
          padding: '16px', 
          backgroundColor: '#f3f4f6', 
          borderRadius: '8px', 
          fontSize: '14px',
          color: '#374151',
          textAlign: 'center'
        }}>
          <strong>Instructions:</strong> Click on any menu item to place an order for cash payment. 
          Each order will be created with a unique 4-digit ID and automatically appear in the Orders panel through Supabase.
        </div>
      </Card>
      <Card title="Counter Tokens (Placed by Counter)">
        {loadingCounter ? (
          <div className="muted">Loading...</div>
        ) : counterTokens.length === 0 ? (
          <div className="muted">No Counter orders yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Item</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {counterTokens.slice(0, 10).map((o) => (
                <tr key={o.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666' }}>{(o.token_no || o.order_token) ? ('#' + (o.token_no || o.order_token)) : 'Not available'}</span></td>
                  <td>{o.item_name}</td>
                  <td>
                    {normStatus(o.status) === 'PENDING' && <span className="badge pending">PENDING</span>}
                    {normStatus(o.status) === 'PREPARING' && <span className="badge preparing">PREPARING</span>}
                    {normStatus(o.status) === 'READY' && <span className="badge ready">READY</span>}
                    {normStatus(o.status) === 'DELIVERED' && <span className="badge ready">DELIVERED</span>}
                  </td>
                  <td>{o.created_at ? new Date(o.created_at).toLocaleTimeString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {lastToken && (
        <Card title="Your Token">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666', fontSize: '1.1em' }}>#{lastToken}</div>
            <div className="muted">Please share this token at the counter.</div>
          </div>
        </Card>
      )}
    </div>
  )
}

function OrdersTable({ withTitle = true, orders = [], onUpdateStatus = () => {}, idHeader = 'Order ID', updatingIds = {} }) {
  return (
    <Card title={withTitle ? 'Orders' : undefined}>
      <table className="table">
        <thead>
          <tr>
            <th>{idHeader}</th>
            <th>Item Name</th>
            <th>Price</th>
            <th>Status</th>
            <th>Placed By</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666' }}>{(o.token_no || o.order_token) ? ('#' + (o.token_no || o.order_token)) : 'Not available'}</span></td>
              <td><strong>{o.item_name}</strong></td>
              <td>{o.total_amount != null ? `₹${o.total_amount}` : '-'}</td>
              <td>
                {normStatus(o.status) === 'PENDING' && <span className="badge pending">PENDING</span>}
                {normStatus(o.status) === 'PREPARING' && <span className="badge preparing">PREPARING</span>}
                {normStatus(o.status) === 'READY' && <span className="badge ready">READY</span>}
              </td>
              <td>
                {o.order_placer === 'admin' ? (
                  <span style={{ 
                    backgroundColor: '#3b82f6', 
                    color: 'white', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    🧑‍💻 Counter
                  </span>
                ) : (
                  <span style={{ 
                    backgroundColor: '#6b7280', 
                    color: 'white', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    🧑‍🎓 Student
                  </span>
                )}
              </td>
              <td className="actions">
                {updatingIds[o.id] ? (
                  <button className="btn" disabled><span className="spinner" style={{ marginRight: 6 }} />Updating...</button>
                ) : (
                  <>
                {normStatus(o.status) === 'PENDING' && (
                  <button className="btn" onClick={() => onUpdateStatus(o.id, 'PREPARING')}>Mark Preparing</button>
                )}
                {normStatus(o.status) === 'PREPARING' && (
                  <button className="btn" onClick={() => onUpdateStatus(o.id, 'READY')}>Mark Ready</button>
                )}
                {normStatus(o.status) === 'READY' && (
                  <button className="btn" onClick={() => onUpdateStatus(o.id, 'DELIVERED')}>Mark Delivered</button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function OrdersPage({ orders, deliveredOrders = [], activity = [], onUpdateStatus, onRevert, view = 'live', pictureMode = false, updatingIds = {} }) {
  const isLive = view === 'live'
  const tokenFor = (orderId) => {
    try {
      const found = orders.find(o => o.id === orderId) || deliveredOrders.find(o => o.id === orderId)
      const t = found && (found.token_no || found.order_token)
      return t ? ('#' + t) : 'Not available'
    } catch (_) { return 'Not available' }
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {view === 'activity' ? (
        <Card title={undefined}>
          <table className="table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Token No</th>
                <th>From → To</th>
                <th>At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activity.slice(0, 20).map((e, idx) => (
                <tr key={idx}>
                  <td><strong>{e.itemName || 'Order Item'}</strong></td>
                  <td>{tokenFor(e.orderId)}</td>
                  <td>{e.from} → {e.to}</td>
                  <td>{e.at}</td>
                  <td>
                    <button className="btn" onClick={() => onRevert(e)}>Revert</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : isLive ? (
        pictureMode ? (
          <Card title={undefined}>
            <div className="cards-grid">
              {orders.map((o) => {
                const base = (import.meta && import.meta.env && import.meta.env.VITE_BASE) || '/'
                const name = ((o.item_name || '') + '').toLowerCase()
                const src = name.includes('samosa')
                  ? 'https://as2.ftcdn.net/v2/jpg/15/85/73/65/1000_F_1585736532_NFMq8z0vAjbker6w9vuzoF8FmsxVRGPI.jpg'
                  : name.includes('biryani')
                  ? 'https://as1.ftcdn.net/v2/jpg/04/59/27/88/1000_F_459278894_92eSlejnR7NSwJRCbVyy9ZZibSmjbF8q.jpg'
                  : name.includes('dosa')
                  ? 'https://as2.ftcdn.net/v2/jpg/14/45/94/59/1000_F_1445945944_eBUM7ot1AWezNkqknKsRImNvLvFbmr7z.jpg'
                  : 'https://via.placeholder.com/300?text=Food'
                return (
                  <div key={o.id} className="order-card">
                    <div className="avatar">
                      <img
                        src={src}
                        alt={o.item_name || 'Order Item'}
                        loading="lazy"
                        onError={(e) => {
                          try {
                            e.currentTarget.onerror = null
                            e.currentTarget.src = 'https://via.placeholder.com/300?text=Food'
                          } catch (err) {}
                        }}
                      />
                    </div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666', fontSize: '0.9em', marginBottom: 4 }}>{(o.token_no || o.order_token) ? ('#' + (o.token_no || o.order_token)) : 'Not available'}</div>
                    <div style={{ fontWeight: 600, fontSize: '1.1em' }}>{o.item_name}</div>
                    <div style={{ marginBottom: 8 }}>
                      {o.order_placer === 'admin' ? (
                        <span style={{ 
                          backgroundColor: '#3b82f6', 
                          color: 'white', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          fontSize: '10px',
                          fontWeight: '500'
                        }}>
                          🧑‍💻 Counter
                        </span>
                      ) : (
                        <span style={{ 
                          backgroundColor: '#6b7280', 
                          color: 'white', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          fontSize: '10px',
                          fontWeight: '500'
                        }}>
                          🧑‍🎓 Student
                        </span>
                      )}
                    </div>
                    <div style={{ marginBottom: 12 }}>
                    {normStatus(o.status) === 'PENDING' && <span className="badge pending">PENDING</span>}
                    {normStatus(o.status) === 'PREPARING' && <span className="badge preparing">PREPARING</span>}
                    {normStatus(o.status) === 'READY' && <span className="badge ready">READY</span>}
                    {normStatus(o.status) === 'DELIVERED' && <span className="badge ready">DELIVERED</span>}
                    </div>
                    <div className="actions" style={{ justifyContent: 'center' }}>
                      {updatingIds && updatingIds[o.id] ? (
                        <button className="btn" disabled><span className="spinner" style={{ marginRight: 6 }} />Updating...</button>
                      ) : (
                        <>
                      {normStatus(o.status) === 'PENDING' && (
                        <button className="btn" onClick={() => onUpdateStatus(o.id, 'PREPARING')}>Mark Preparing</button>
                      )}
                      {normStatus(o.status) === 'PREPARING' && (
                        <>
                          <button className="btn" onClick={() => onUpdateStatus(o.id, 'READY')}>Mark Ready</button>
                          <button className="btn" onClick={() => onUpdateStatus(o.id, 'DELIVERED')}>Mark Delivered</button>
                        </>
                      )}
                      {normStatus(o.status) === 'READY' && (
                        <button className="btn" onClick={() => onUpdateStatus(o.id, 'DELIVERED')}>Mark Delivered</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ) : (
          <OrdersTable withTitle={false} idHeader="Token No" orders={orders} onUpdateStatus={onUpdateStatus} updatingIds={updatingIds} />
        )
      ) : (
        <Card title={undefined}>
          <table className="table">
            <thead>
              <tr>
                <th>Token No</th>
                <th>Item Name</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {deliveredOrders.map((o) => (
                <tr key={o.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666' }}>{(o.token_no || o.order_token) ? ('#' + (o.token_no || o.order_token)) : 'Not available'}</span></td>
                  <td><strong>{o.item_name}</strong></td>
                  <td>{o.total_amount != null ? `₹${o.total_amount}` : '-'}</td>
                  <td><span className="badge ready">DELIVERED</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {null}
    </div>
  )
}

function InventoryPage() {
  // Only the features requested: add, remove, mark out of stock / in stock
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ id: '', name: '' })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | in | out
  const [idField, setIdField] = useState('id')
  const [availabilityField, setAvailabilityField] = useState('available_quantity')
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  // Fetch all items from Supabase table `food_items`
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const pageSize = 1000
        let from = 0
        let all = []
        while (true) {
          const to = from + pageSize - 1
          const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .range(from, to)
          if (error) throw error
          const batch = data || []
          all = all.concat(batch)
          if (batch.length < pageSize) break
          from += pageSize
        }
        // Detect backend id and availability field from sample row
        const sample = all[0] || {}
        const idCandidates = ['id', 'item_id', 'slug', 'code']
        const availCandidates = ['available_quantity', 'in_stock', 'available', 'is_available', 'stock', 'status']
        const detectedIdField = idCandidates.find(k => Object.prototype.hasOwnProperty.call(sample, k)) || 'id'
        const detectedAvailField = availCandidates.find(k => Object.prototype.hasOwnProperty.call(sample, k)) || 'in_stock'
        setIdField(detectedIdField)
        setAvailabilityField(detectedAvailField)
        // Map backend rows to local shape with quantity information
        const mapped = all.map((r) => {
          const id = r[detectedIdField] ?? String(Math.random()).slice(2)
          const name = r.name ?? r.item_name ?? r.title ?? r.label ?? 'Item'
          const price = r.price ?? r.cost ?? 0
          const availableQuantity = r.available_quantity ?? r.quantity ?? r.stock ?? 0
          const inStock = (
            (typeof availableQuantity === 'number' ? availableQuantity > 0 : undefined) ??
            r.in_stock ?? r.available ?? r.is_available ?? (typeof r.stock === 'number' ? r.stock > 0 : undefined) ??
            (typeof r.status === 'string' ? String(r.status).toLowerCase() === 'in' : undefined) ?? true
          )
          return { 
            id, 
            name, 
            price,
            availableQuantity,
            inStock: !!inStock,
            originalData: r
          }
        })
        setItems(mapped)
      } catch (e) {
        console.error('Failed to fetch food_items from Supabase:', e)
      }
    }
    fetchItems()
  }, [])

  const addItem = () => {
    if (!form.name) return
    const generatedId = 'local-' + Math.random().toString(36).slice(2, 10)
    setItems((prev) => [...prev, { id: generatedId, name: form.name, inStock: true, _local: true }])
    setForm({ id: '', name: '' })
  }

  const toggleStock = async (id, inStock) => {
    // Optimistic update
    const prev = items
    setItems((p) => p.map((it) => (it.id === id ? { ...it, inStock } : it)))
    try {
      const target = items.find((it) => it.id === id)
      if (target && target._local) {
        // Local-only item: skip backend update
        return
      }
      // Build update payload based on detected availability field
      let update = {}
      if (availabilityField === 'stock') {
        update[availabilityField] = inStock ? 1 : 0
      } else if (availabilityField === 'status') {
        update[availabilityField] = inStock ? 'in' : 'out'
      } else if (availabilityField === 'available_quantity') {
        update[availabilityField] = inStock ? 1 : 0
      } else {
        update[availabilityField] = !!inStock
      }
      const { error } = await supabase
        .from('food_items')
        .update(update)
        .eq(idField, id)
      if (error) throw error
    } catch (e) {
      console.error('Failed to update stock in Supabase:', e)
      // Rollback on error
      setItems(prev)
      alert('Failed to update in backend. Please try again.')
    }
  }

  const updateQuantity = async (id, newQuantity) => {
    // Optimistic update
    const prev = items
    setItems((p) => p.map((it) => (it.id === id ? { ...it, availableQuantity: newQuantity, inStock: newQuantity > 0 } : it)))
    try {
      const target = items.find((it) => it.id === id)
      if (target && target._local) {
        // Local-only item: skip backend update
        return
      }
      const { error } = await supabase
        .from('food_items')
        .update({ available_quantity: newQuantity })
        .eq(idField, id)
      if (error) throw error
    } catch (e) {
      console.error('Failed to update quantity in Supabase:', e)
      // Rollback on error
      setItems(prev)
      alert('Failed to update quantity in backend. Please try again.')
    }
  }

  const deleteItem = (id) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  // Derived list based on current search and filter
  const displayedItems = items.filter((i) => {
    const q = search.trim().toLowerCase()
    const matchesSearch = q ? String(i.name || '').toLowerCase().includes(q) : true
    const matchesFilter = filter==='all' || (filter==='in' ? i.inStock : !i.inStock)
    return matchesSearch && matchesFilter
  })

  const allSelected = displayedItems.length > 0 && displayedItems.every(it => selectedIds.has(it.id))

  const toggleSelect = (id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleMarkAllDisplayed = () => {
    if (allSelected) {
      // Unmark all displayed
      setSelectedIds(prev => {
        const next = new Set(prev)
        displayedItems.forEach(it => next.delete(it.id))
        return next
      })
    } else {
      // Mark all displayed (merge with existing selections)
      setSelectedIds(prev => {
        const next = new Set(prev)
        displayedItems.forEach(it => next.add(it.id))
        return next
      })
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>{items.length}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Total</div>
        </div>
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#166534' }}>{items.filter(i => i.inStock).length}</div>
          <div style={{ fontSize: '12px', color: '#16a34a' }}>In Stock</div>
        </div>
        <div style={{
          backgroundColor: '#fefce8',
          border: '1px solid #fde047',
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#a16207' }}>{items.filter(i => i.inStock && i.availableQuantity <= 20 && i.availableQuantity > 5).length}</div>
          <div style={{ fontSize: '12px', color: '#ca8a04' }}>Low Stock</div>
        </div>
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#991b1b' }}>{items.filter(i => i.inStock && i.availableQuantity <= 5 && i.availableQuantity > 0).length}</div>
          <div style={{ fontSize: '12px', color: '#dc2626' }}>Very Low</div>
        </div>
        <div style={{
          backgroundColor: '#f1f5f9',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#475569' }}>{items.filter(i => !i.inStock).length}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Out of Stock</div>
        </div>
      </div>

      

      <Card title="Add Item">
        <div className="form">
          <div className="field" style={{ minWidth: 240 }}>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <button className="btn" onClick={addItem}>Add</button>
        </div>
      </Card>

      <Card title="Search Items">
        <div className="form">
          <div className="field" style={{ minWidth: 320 }}>
            <input className="input" style={{ width: '320px' }} placeholder="Search food items..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="actions" style={{ marginLeft: 'auto' }}>
            <button className={`btn ${filter==='all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button className={`btn ${filter==='in' ? 'active' : ''}`} onClick={() => setFilter('in')}>In Stock</button>
            <button className={`btn ${filter==='out' ? 'active' : ''}`} onClick={() => setFilter('out')}>Out of Stock</button>
          </div>
        </div>
      </Card>

      <Card title="Food Items Inventory & Quantity Management">
        <div className="actions" style={{ marginBottom: 8 }}>
          <button className="btn" onClick={toggleMarkAllDisplayed}>{allSelected ? 'Unmark All' : 'Mark All'}</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Item Name</th>
              <th>Price</th>
              <th>Available Quantity</th>
              <th>Stock Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedItems.map((it) => (
              <tr key={it.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(it.id)}
                    onChange={(e) => toggleSelect(it.id, e.target.checked)}
                  />
                </td>
                <td><strong>{it.name}</strong></td>
                <td>₹{it.price}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: it.availableQuantity > 20 ? '#10b981' : it.availableQuantity > 5 ? '#f59e0b' : it.availableQuantity > 0 ? '#ef4444' : '#6b7280'
                    }}>
                      {it.availableQuantity}
                    </span>
                    <input
                      type="number"
                      className="input"
                      style={{ width: 80, fontSize: '12px' }}
                      value={it.availableQuantity}
                      onChange={(e) => updateQuantity(it.id, Number(e.target.value))}
                      min="0"
                    />
                  </div>
                </td>
                <td>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    backgroundColor: it.availableQuantity > 20 ? '#dcfce7' : it.availableQuantity > 5 ? '#fef3c7' : it.availableQuantity > 0 ? '#fee2e2' : '#f3f4f6',
                    color: it.availableQuantity > 20 ? '#166534' : it.availableQuantity > 5 ? '#92400e' : it.availableQuantity > 0 ? '#991b1b' : '#6b7280'
                  }}>
                    {it.availableQuantity > 20 ? '🟢 In Stock' : it.availableQuantity > 5 ? '🟡 Low Stock' : it.availableQuantity > 0 ? '🟠 Very Low' : '🔴 Out of Stock'}
                  </span>
                </td>
                <td className="actions">
                  <button 
                    className="btn" 
                    onClick={() => updateQuantity(it.id, it.availableQuantity + 10)}
                    style={{ fontSize: '12px', padding: '4px 8px', marginRight: '4px' }}
                  >
                    +10
                  </button>
                  <button 
                    className="btn" 
                    onClick={() => updateQuantity(it.id, Math.max(0, it.availableQuantity - 10))}
                    style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#ef4444', marginRight: '4px' }}
                  >
                    -10
                  </button>
                  {it.inStock ? (
                    <button className="btn" onClick={() => toggleStock(it.id, false)}>Mark Out</button>
                  ) : (
                    <button className="btn" onClick={() => toggleStock(it.id, true)}>Mark In</button>
                  )}
                  <button className="btn" onClick={() => deleteItem(it.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
function ReportsPage() {
  const [from, setFrom] = useState(() => new Date(Date.now()-24*60*60*1000).toISOString().slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [itemsMap, setItemsMap] = useState({}) // maps food_items id/item_id -> name
  // Build rows dynamically from delivered orders only
  const [dataDelivered, setDataDelivered] = useState([])
  
  // Fetch delivered orders from backend if window variable is empty
  useEffect(() => {
    const fetchDeliveredOrders = async () => {
      try {
        if (window.__IARE_DELIVERED__ && window.__IARE_DELIVERED__.length > 0) {
          setDataDelivered(window.__IARE_DELIVERED__)
          console.log('📊 Reports: Using window.__IARE_DELIVERED__ data')
        } else {
          console.log('📊 Reports: Fetching delivered orders from Supabase...')
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'DELIVERED')
            .order('created_at', { ascending: false })
          
          if (error) throw error
          setDataDelivered(data || [])
          console.log('📊 Reports: Fetched', data?.length || 0, 'delivered orders from Supabase')
        }
      } catch (e) {
        console.error('❌ Reports: Failed to fetch delivered orders:', e)
        setDataDelivered([])
      }
    }
    
    fetchDeliveredOrders()
  }, [])
  
  // Debug: Log delivered orders data structure
  if (dataDelivered.length > 0) {
    console.log('📊 Reports: Sample delivered order data:', dataDelivered[0])
    console.log('📊 Reports: Available fields in delivered orders:', Object.keys(dataDelivered[0] || {}))
  }
  const toValidMs = (ts) => {
    const d = new Date(ts)
    return isNaN(d) ? null : d.getTime()
  }
  // Fetch food_items to resolve item names from backend
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const pageSize = 1000
        let fromIdx = 0
        let all = []
        while (true) {
          const toIdx = fromIdx + pageSize - 1
          const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .range(fromIdx, toIdx)
          if (error) throw error
          const batch = data || []
          all = all.concat(batch)
          if (batch.length < pageSize) break
          fromIdx += pageSize
        }
        const map = {}
        for (const r of all) {
          const name = r.name ?? r.item_name
          if (!name) continue
          if (r.id) map[r.id] = name
          if (r.item_id) map[r.item_id] = name
          if (r.code) map[r.code] = name
          if (r.slug) map[r.slug] = name
        }
        setItemsMap(map)
      } catch (e) {
        // ignore failures; will fallback to existing fields
      }
    }
    fetchItems()
  }, [])
  const rows = dataDelivered.map(o => {
    const receivedRaw = o.createdAt ?? o.created_at ?? o.receivedAt ?? o.received_at
    const deliveredRaw = o.deliveredAt ?? o.delivered_at ?? o.updated_at ?? o.created_at ?? o.createdAt
    // Enhanced token extraction - try multiple possible field names
    const token = o.token_no ?? o.order_token ?? o.token ?? o.token_number ?? o.id ?? null
    
    // Debug: Log token extraction for first few orders
    if (dataDelivered.indexOf(o) < 3) {
      console.log('🔍 Reports: Token extraction for order:', {
        id: o.id,
        token_no: o.token_no,
        order_token: o.order_token,
        token: o.token,
        token_number: o.token_number,
        extracted_token: token
      })
    }
    const resolvedItem = (
      o.item_name ??
      itemsMap[o.item_id] ?? itemsMap[o.itemId] ?? itemsMap[o.item] ??
      o.items ?? 'Item'
    )
    // Get the total amount from delivered order - prioritize total_amount, then price
    const totalAmount = o.total_amount || o.price || 0
    return {
      id: o.id,
      item: resolvedItem,
      qty: 1,
      total: totalAmount,
      total_amount: totalAmount, // Ensure we have this for revenue calculation
      price: totalAmount, // Fallback for price display
      status: o.status,
      receivedTs: toValidMs(receivedRaw),
      deliveredTs: toValidMs(deliveredRaw),
      token,
    }
  })

  const fmt = (ms) => {
    if (!ms) return ''
    const d = new Date(ms)
    return isNaN(d) ? '' : d.toISOString().slice(0,10)
  }
  const filtered = rows.filter(r => {
    if (!r.deliveredTs) return false
    const d = fmt(r.deliveredTs)
    return d && d >= from && d <= to
  })
  const displayRows = [...filtered].sort((a,b) => b.deliveredTs - a.deliveredTs).slice(0, 5)
  const totals = filtered.reduce((acc, r) => {
    acc.orders += 1
    // Calculate revenue from delivered items - use total_amount, total, or price
    const itemRevenue = r.total_amount || r.total || r.price || 0
    acc.revenue += Number(itemRevenue) || 0
    acc.items += 1
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, { orders: 0, revenue: 0, items: 0, PENDING: 0, PREPARING: 0, READY: 0 })

  const exportCsv = () => {
    const header = ['Order Token', 'Item', 'Total', 'Received At', 'Delivered At']
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"'
    const isoNoMs = (ms) => {
      if (!ms) return ''
      const d = new Date(ms)
      if (isNaN(d)) return ''
      return d.toISOString().replace(/\.\d{3}Z$/, '')
    }
    const lines = filtered.map(r => [
      esc(r.token ? ('#' + r.token) : ''),
      esc(r.item),
      esc(r.total_amount || r.total || r.price || 0),
      esc(isoNoMs(r.receivedTs)),
      esc(isoNoMs(r.deliveredTs))
    ].join(','))
    const summary = ["", esc('Total Revenue'), esc(totals.revenue)].join(',')
    const csv = [header.join(','), ...lines, '', summary].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const esc = (v) => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const isoNoMs = (ms) => {
      if (!ms) return ''
      const d = new Date(ms)
      if (isNaN(d)) return ''
      return d.toISOString().replace(/\.\d{3}Z$/, '')
    }
    const rowsHtml = filtered.map(r => `
      <tr>
        <td>${esc(r.token ? ('#' + r.token) : '')}</td>
        <td>${esc(r.item)}</td>
        <td>${esc(r.total_amount || r.total || r.price || 0)}</td>
        <td class="text">${esc(isoNoMs(r.receivedTs))}</td>
        <td class="text">${esc(isoNoMs(r.deliveredTs))}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
      <style>
        table{border-collapse:collapse}
        td,th{border:1px solid #ccc;padding:6px}
        .text{mso-number-format:'\\@';}
        col.id{width:120px} col.item{width:260px} col.total{width:90px}
        col.recv{width:180px} col.delv{width:180px}
      </style></head><body>
      <table>
        <colgroup>
          <col class="id"/>
          <col class="item"/>
          <col class="total"/>
          <col class="recv"/>
          <col class="delv"/>
        </colgroup>
        <thead><tr>
          <th>Order ID</th><th>Item</th><th>Total</th><th>Received At</th><th>Delivered At</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td></td><td>Total Revenue</td><td class="text">${totals.revenue}</td><td></td><td></td></tr></tfoot>
      </table></body></html>`
    const blob = new Blob(["\ufeff", html], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports_${from}_to_${to}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="grid-2">
        <Card title={undefined}>
          <div className="filters">
            <div className="field" style={{minWidth: 220}}>
              <label className="label">From</label>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field" style={{minWidth: 220}}>
              <label className="label">To</label>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn" onClick={exportCsv}>Export CSV</button>
              <button className="btn" onClick={exportExcel}>Export Excel</button>
            </div>
          </div>
        </Card>
        <Card title="Status Breakdown">
          <div className="badges">
            <span className="badge pending">PENDING: {totals.PENDING}</span>
            <span className="badge preparing">PREPARING: {totals.PREPARING}</span>
            <span className="badge ready">READY: {totals.READY}</span>
          </div>
        </Card>
      </div>

      <div className="grid-3">
        <Card title="Total Orders">
          <div className="stat-value">{totals.orders}</div>
          <div className="stat-label">Received</div>
        </Card>
        <Card title="Revenue">
          <div className="stat-value">₹{totals.revenue}</div>
          <div className="stat-label">Total</div>
        </Card>
        <Card title="Delivered Items">
          <div className="stat-value">{totals.items}</div>
        </Card>
      </div>

      <Card title="Orders (latest 5 delivered)">
        <table className="table">
          <thead>
            <tr>
              <th>Order Token</th>
              <th>Item</th>
              <th>Total</th>
              <th>Received</th>
              <th>Delivered</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.id}>
                <td>{r.token ? ('#' + r.token) : ''}</td>
                <td>{r.item}</td>
                <td>₹{r.total_amount || r.total || r.price || 0}</td>
                <td>{new Date(r.receivedTs).toLocaleString()}</td>
                <td>{new Date(r.deliveredTs).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}



function AIPredictionsPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10))
  const [covers, setCovers] = useState(200) // expected customers/orders
  const [dayType, setDayType] = useState('weekday') // weekday | weekend | holiday
  const [weather, setWeather] = useState('clear') // clear | hot | cold | rainy
  const [period, setPeriod] = useState('lunch') // breakfast | lunch | snacks | dinner
  const [historicalWeight, setHistoricalWeight] = useState(0.5) // 0..1
  const [eventBoost, setEventBoost] = useState(false)
  const [eventSize, setEventSize] = useState(100)
  const [stock, setStock] = useState({ biryani: 0, dosa: 0, samosa: 0 })

  const [summary, setSummary] = useState([])
  const [planRows, setPlanRows] = useState([])

  const generate = () => {
    const delivered = window.__IARE_DELIVERED__ || []
    const today = new Date(date).toDateString()
    const deliveredToday = delivered.filter(d => new Date(d.deliveredAt).toDateString() === today)
    const historyCount = deliveredToday.length || 10

    // Blend expected covers with history
    let predicted = Math.round(historicalWeight * historyCount + (1 - historicalWeight) * covers)

    // Multipliers
    const dayMul = dayType === 'weekend' ? 1.15 : dayType === 'holiday' ? 1.3 : 1.0
    const weatherMul = weather === 'rainy' ? 1.05 : weather === 'hot' ? 0.97 : weather === 'cold' ? 1.02 : 1.0
    let eventMul = 1.0
    if (eventBoost) eventMul += Math.min(0.5, eventSize / 500) // up to +50%

    predicted = Math.max(1, Math.round(predicted * dayMul * weatherMul * eventMul))

    // Item mix by period
    const mixes = {
      breakfast: { dosa: 0.5, samosa: 0.5 },
      lunch: { biryani: 0.6, dosa: 0.3, samosa: 0.1 },
      snacks: { samosa: 0.7, dosa: 0.3 },
      dinner: { biryani: 0.55, dosa: 0.35, samosa: 0.1 },
    }
    const mix = mixes[period]
    const totalWeight = Object.values(mix).reduce((a, b) => a + b, 0)

    const desired = Object.entries(mix).map(([key, w]) => ({
      key,
      desired: Math.round((w / totalWeight) * predicted),
      stock: stock[key] ?? 0,
    }))

    const capped = desired.map(r => ({
      item: keyToLabel(r.key),
      recommended: Math.min(r.desired, r.stock),
      available: r.stock,
      shortage: Math.max(0, r.desired - r.stock),
    }))

    setSummary([
      { label: 'Predicted Covers', value: predicted },
      { label: 'Day', value: `${dayType} • ${period}` },
      { label: 'Weather', value: weather },
      { label: 'Event Boost', value: eventBoost ? `Yes (+${Math.round(Math.min(50, (eventSize/500)*100))}%)` : 'No' },
    ])
    setPlanRows(capped)
  }

  const keyToLabel = (k) => (k === 'biryani' ? 'Veg Biryani' : k === 'dosa' ? 'Masala Dosa' : 'Samosa')

  const updateStock = (key, val) => setStock(s => ({ ...s, [key]: Math.max(0, Number(val)) }))

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="Inputs">
        <div className="form">
          <div className="field">
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e)=>setDate(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Expected Covers</label>
            <input type="number" className="input" value={covers} onChange={(e)=>setCovers(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="label">Day Type</label>
            <select className="input" value={dayType} onChange={(e)=>setDayType(e.target.value)}>
              <option value="weekday">Weekday</option>
              <option value="weekend">Weekend</option>
              <option value="holiday">Holiday</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Meal Period</label>
            <select className="input" value={period} onChange={(e)=>setPeriod(e.target.value)}>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="snacks">Snacks</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Weather</label>
            <select className="input" value={weather} onChange={(e)=>setWeather(e.target.value)}>
              <option value="clear">Clear</option>
              <option value="hot">Hot</option>
              <option value="cold">Cold</option>
              <option value="rainy">Rainy</option>
            </select>
          </div>
          <div className="field">
            <label className="label">History Weight (0–1)</label>
            <input type="number" min="0" max="1" step="0.05" className="input" value={historicalWeight} onChange={(e)=>setHistoricalWeight(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="label">Event Boost</label>
            <select className="input" value={eventBoost ? 'yes' : 'no'} onChange={(e)=>setEventBoost(e.target.value==='yes')}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Event Size (people)</label>
            <input type="number" className="input" value={eventSize} onChange={(e)=>setEventSize(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="label">Stock: Biryani</label>
            <input type="number" className="input" value={stock.biryani} onChange={(e)=>updateStock('biryani', e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Stock: Dosa</label>
            <input type="number" className="input" value={stock.dosa} onChange={(e)=>updateStock('dosa', e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Stock: Samosa</label>
            <input type="number" className="input" value={stock.samosa} onChange={(e)=>updateStock('samosa', e.target.value)} />
          </div>

          <button className="btn" onClick={generate}>Generate</button>
        </div>
      </Card>

      <Card title="Predictions & Suggestions">
        {summary.length === 0 ? (
          <div className="muted">Fill inputs and click Generate.</div>
        ) : (
          <>
            <table className="table" style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s, i) => (
                  <tr key={i}>
                    <td>{s.label}</td>
                    <td>{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Recommended Qty</th>
                  <th>Available Stock</th>
                  <th>Shortage</th>
                </tr>
              </thead>
              <tbody>
                {planRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.item}</td>
                    <td>{r.recommended}</td>
                    <td>{r.available}</td>
                    <td>{r.shortage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  )
}

function SettingsPage() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Appearance</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="muted">Light</span>
            <label className="switch">
              <input type="checkbox" checked={theme === 'dark'} onChange={(e)=> setTheme(e.target.checked ? 'dark' : 'light')} />
              <span className="slider" />
            </label>
            <span className="muted">Dark</span>
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Account</h2>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button
              className="btn"
              onClick={() => {
                try { localStorage.clear() } catch (e) {}
                const base = (import.meta && import.meta.env && import.meta.env.VITE_BASE) || '/'
                window.location.href = base
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
      <DebugPanel />
    </div>
  )
}
// removed Logs page per request

function DebugPanel() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [envInfo, setEnvInfo] = useState(null)

  const runFetch = async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const pageSize = 1000
      let from = 0
      let all = []
      while (true) {
        const to = from + pageSize - 1
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to)
        if (error) throw error
        const batch = data || []
        all = all.concat(batch)
        if (batch.length < pageSize) break
        from += pageSize
      }
      setResult(all)
      // also expose globally for quick inspection
      window.__IARE_ORDERS__ = all
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  const checkEnvVars = () => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    setEnvInfo({
      hasUrl: !!url,
      hasKey: !!key,
      urlLength: url?.length || 0,
      keyLength: key?.length || 0,
      urlPreview: url ? `${url.substring(0, 20)}...` : 'Not set',
      keyPreview: key ? `${key.substring(0, 20)}...` : 'Not set',
      isConfigured: !!(url && key && url !== 'your_supabase_project_url_here'),
      urlValue: url,
      keyValue: key
    })
  }

  const createTestOrder = async () => {
    setLoading(true)
    try {
      // Create a random food item
      const foodItems = [
        { name: 'Veg Biryani', price: 180 },
        { name: 'Masala Dosa', price: 80 },
        { name: 'Samosa', price: 40 },
        { name: 'Chicken Biryani', price: 200 },
        { name: 'Paneer Tikka', price: 120 },
        { name: 'Dal Khichdi', price: 60 },
        { name: 'Veg Fried Rice', price: 90 },
        { name: 'Chicken Curry', price: 150 }
      ]
      
      const randomItem = foodItems[Math.floor(Math.random() * foodItems.length)]
      
      const { data, error } = await supabase.rpc('create_order', {
        p_item_name: randomItem.name,
        p_total: randomItem.price,
        p_status: 'PENDING'
      })
      if (error) {
        setError(error)
      } else {
        setResult({ message: `Order created with ID: ${data} for ${randomItem.name}`, orderId: data })
        // Refresh orders after creating
        setTimeout(() => {
          runFetch()
        }, 1000)
      }
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Debug</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" onClick={runFetch} disabled={loading}>{loading ? 'Fetching...' : 'Fetch orders from Supabase'}</button>
        <button className="btn" onClick={createTestOrder} disabled={loading}>{loading ? 'Creating...' : 'Create Test Order'}</button>
        <button className="btn" onClick={checkEnvVars}>Check Env Vars</button>
        <button className="btn" onClick={() => { setResult(null); setError(null); setEnvInfo(null); }}>Clear</button>
      </div>
                   <div style={{ marginTop: 12 }}>
               {envInfo && (
                 <div style={{ marginBottom: 12, padding: 8, backgroundColor: '#f3f4f6', borderRadius: 4 }}>
                   <strong>Environment Variables:</strong><br/>
                   URL: {envInfo.hasUrl ? '✅ Set' : '❌ Missing'} ({envInfo.urlPreview})<br/>
                   Key: {envInfo.hasKey ? '✅ Set' : '❌ Missing'} ({envInfo.keyPreview})<br/>
                   Status: {envInfo.isConfigured ? '✅ Configured' : '❌ Not Configured'}
                   {!envInfo.isConfigured && (
                     <div style={{ marginTop: 8, padding: 8, backgroundColor: '#fef3c7', borderRadius: 4, fontSize: '12px' }}>
                       <strong>Setup Required:</strong><br/>
                       1. Create a <code>.env</code> file in the project root<br/>
                       2. Add your Supabase URL and anon key<br/>
                       3. Restart the development server
                     </div>
                   )}
                 </div>
               )}
        {error && <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{String(error.message || error)}</pre>}
        {result && (
          <div style={{ maxHeight: 240, overflow: 'auto' }}>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
        {!result && !error && !envInfo && <div className="muted">No result yet. Click fetch to test.</div>}
      </div>
    </div>
  )
}

function QRScanPage() {
  const videoRef = useRef(null)
  const codeReaderRef = useRef(null)
  const controlsRef = useRef(null)
  const [scanning, setScanning] = useState(false)
  const [scanText, setScanText] = useState('')
  const [error, setError] = useState(null)
  const [order, setOrder] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [lastText, setLastText] = useState('')
  const [lastScanAt, setLastScanAt] = useState(0)
  const [scanMessage, setScanMessage] = useState('')

  const stop = async () => {
    try {
      setScanning(false)
      // Stop scanner controls if present
      try {
        if (controlsRef.current && typeof controlsRef.current.stop === 'function') {
          controlsRef.current.stop()
        }
      } catch (_) {}
      controlsRef.current = null
      // Reset the reader to release camera resources
      try {
        if (codeReaderRef.current && typeof codeReaderRef.current.reset === 'function') {
          await codeReaderRef.current.reset()
        }
      } catch (_) {}
      codeReaderRef.current = null
      const el = videoRef.current
      if (el && el.srcObject) {
        const tracks = el.srcObject.getTracks()
        tracks.forEach(t => t.stop())
        el.srcObject = null
      }
    } catch (_) {}
  }

  const start = async () => {
    setError(null)
    setOrder(null)
    setScanText('')
    setScanMessage('')
    try {
      // If already running, do nothing
      if (scanning) return
      // Ensure any previous session is stopped
      await stop()
      const reader = new BrowserQRCodeReader()
      codeReaderRef.current = reader
      setScanning(true)
      await reader.decodeFromVideoDevice(null, videoRef.current, async (result, err, controls) => {
        try {
          if (controls && !controlsRef.current) controlsRef.current = controls
        } catch (_) {}
        if (result) {
          const text = String(result.getText() || '')
          console.log('Scanned text:', text)
          if (!text) return
          // Skip duplicate rapid scans of same content and concurrent processing
          if (processing) return
          const now = Date.now()
          if (lastText === text && (now - lastScanAt) < 1500) return
          setProcessing(true)
          setLastText(text)
          setLastScanAt(now)
          try {
            const found = await fetchOrderForScan(text)
            if (found) {
              setScanMessage('Successfully scanned')
            } else {
              setScanMessage('')
            }
          } finally {
            setProcessing(false)
          }
        }
        if (err && err.name === 'NotFoundException') {
          // keep scanning silently
        }
      })
    } catch (e) {
      console.error(e)
      setError(e)
      setScanning(false)
    }
  }

  const parseTokenOrId = (text) => {
    if (!text) return {}
    const cleaned = String(text).trim()
    console.log('Parsing scanned text:', cleaned)
    
    // UUID pattern for order IDs
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    
    // Check if it's an encrypted code (starts with IARE_)
    if (cleaned.startsWith('IARE_')) {
      console.log('Found encrypted code:', cleaned)
      return { encryptedCode: cleaned }
    }
    
    // Check if it's a UUID (order ID)
    const uuidMatch = cleaned.match(uuidRe)
    if (uuidMatch) {
      console.log('Found UUID order ID:', uuidMatch[0])
      return { orderId: uuidMatch[0] }
    }
    
    // Extract digits for token numbers
    const digits = cleaned.replace(/\D+/g, '')
    if (digits.length >= 3 && digits.length <= 10) {
      console.log('Found token number:', digits)
      return { token: digits }
    }
    
    // If it's a URL, try to extract from parameters
    try {
      const url = new URL(cleaned)
      const params = url.searchParams
      const cand = params.get('token') || params.get('id') || params.get('order_id') || params.get('code')
      if (cand) {
        if (cand.startsWith('IARE_')) {
          console.log('Found encrypted code in URL params:', cand)
          return { encryptedCode: cand }
        }
        if (uuidRe.test(cand)) {
          console.log('Found UUID in URL params:', cand)
          return { orderId: cand }
        }
        const urlDigits = cand.replace(/\D+/g, '')
        if (urlDigits.length >= 3 && urlDigits.length <= 10) {
          console.log('Found token in URL params:', urlDigits)
          return { token: urlDigits }
        }
      }
    } catch (_) { /* not a URL */ }
    
    console.log('No valid token, ID, or encrypted code found in:', cleaned)
    return {}
  }

  const fetchOrderForScan = async (text) => {
    setError(null)
    setOrder(null)
    const { token, orderId, encryptedCode } = parseTokenOrId(text)
    console.log('Parsed token:', token, 'orderId:', orderId, 'encryptedCode:', encryptedCode)
    
    try {
      let found = null
      
              // First, try to find by encrypted code (highest priority)
        if (encryptedCode) {
          console.log('Searching by encrypted code:', encryptedCode)
          const { data, error } = await supabase
            .from('orders')
            .select('id,item_name,encrypted_code,order_token,created_at,status,total_amount,order_placer')
            .eq('encrypted_code', encryptedCode)
            .limit(1)
            .maybeSingle()
        
        if (error) {
          console.error('Error searching by encrypted code:', error)
          throw error
        }
        
        if (data) {
          console.log('Found order by encrypted code:', data)
          found = data
        } else {
          console.log('No order found with encrypted code:', encryptedCode)
        }
      }
      
              // If not found by encrypted code, try by token number
        if (!found && token) {
          console.log('Searching by token:', token)
          const { data, error } = await supabase
            .from('orders')
            .select('id,item_name,encrypted_code,order_token,created_at,status,total_amount,order_placer')
            .eq('order_token', token)
            .limit(1)
            .maybeSingle()
        
        if (error) {
          console.error('Error searching by token:', error)
          throw error
        }
        
        if (data) {
          console.log('Found order by token:', data)
          found = data
        } else {
          console.log('No order found with token:', token)
        }
      }
      
              // If not found by token, try by order ID
        if (!found && orderId) {
          console.log('Searching by order ID:', orderId)
          const { data, error } = await supabase
            .from('orders')
            .select('id,item_name,encrypted_code,order_token,created_at,status,total_amount,order_placer')
            .eq('id', orderId)
            .limit(1)
            .maybeSingle()
        
        if (error) {
          console.error('Error searching by order ID:', error)
          throw error
        }
        
        if (data) {
          console.log('Found order by ID:', data)
          found = data
        } else {
          console.log('No order found with ID:', orderId)
        }
      }
      
      if (found) {
        console.log('Setting order:', found)
        setOrder(found)
        return found
      } else {
        const errorMsg = `No order found for scanned code. Encrypted Code: ${encryptedCode}, Token: ${token}, Order ID: ${orderId}`
        console.log(errorMsg)
        setError(new Error(errorMsg))
        return null
      }
    } catch (e) {
      console.error('Scan lookup failed:', e)
      setError(e)
      return null
    }
  }

  const updateStatus = async (next) => {
    if (!order) return
    setUpdating(true)
    try {
      const { error } = await supabase.rpc('update_order_status_flexible', {
        p_order_id: order.id,
        p_new_status: String(next).toLowerCase(),
      })
      if (error) throw error
      setOrder(o => ({ ...o, status: next }))
      alert(`Updated to ${next}`)
    } catch (e) {
      alert('Failed to update: ' + (e.message || e))
    } finally {
      setUpdating(false)
    }
  }

  useEffect(() => {
    // auto-start on mount
    start()
    return () => { stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="QR Scanner">
        <div className="actions" style={{ marginBottom: 8 }}>
          <button className="btn" onClick={scanning ? stop : start}>{scanning ? 'Stop' : 'Start'} Camera</button>
        </div>
        
        {/* Manual Input for Testing */}
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Manual Test Input</h4>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Enter barcode/QR code manually for testing..."
              style={{ 
                flex: 1, 
                padding: '8px 12px', 
                border: '1px solid #d1d5db', 
                borderRadius: '4px',
                fontSize: '14px'
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  const text = e.target.value.trim()
                  if (text) {
                    console.log('Manual input:', text)
                    fetchOrderForScan(text)
                    e.target.value = ''
                  }
                }
              }}
            />
            <button 
              className="btn"
              onClick={(e) => {
                const input = e.target.previousElementSibling
                const text = input.value.trim()
                if (text) {
                  console.log('Manual input:', text)
                  fetchOrderForScan(text)
                  input.value = ''
                }
              }}
              style={{ fontSize: '12px', padding: '8px 12px' }}
            >
              Test
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 4 }}>
            Enter an encrypted code (starts with IARE_), token number (e.g., 1234), or order ID, then press Enter or click Test
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <video ref={videoRef} style={{ width: '100%', maxHeight: 320, background: '#000', borderRadius: 8 }} muted playsInline />
            {scanMessage && <div className="muted" style={{ marginTop: 8, color: '#10b981' }}>{scanMessage}</div>}
            {error && <div className="muted" style={{ color: 'crimson', marginTop: 8 }}>{String(error.message || error)}</div>}
          </div>
          <div>
            {!order ? (
              <div className="muted">Scan a QR that contains an order token or ID.</div>
            ) : (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <div>Item Name: <strong>{order.item_name || 'Order Item'}</strong></div>
                  <div>Encrypted Code: <code style={{ fontSize: '12px', backgroundColor: '#f3f4f6', padding: '2px 4px', borderRadius: '3px' }}>{order.encrypted_code || 'Not available'}</code></div>
                  <div>Status: {normStatus(order.status)}</div>
                  <div>Price: {order.total_amount != null ? `₹${order.total_amount}` : '-'}</div>
                  <div>Token: {order.order_token ? `#${order.order_token}` : 'Not available'}</div>
                  <div>Placed By: {order.order_placer === 'admin' ? 'Counter' : 'Student'}</div>
                </div>
                <div className="actions">
                  {normStatus(order.status) === 'PENDING' && (
                    <button className="btn" disabled={updating} onClick={() => updateStatus('PREPARING')}>{updating ? 'Updating...' : 'Mark Preparing'}</button>
                  )}
                  {normStatus(order.status) === 'PREPARING' && (
                    <>
                      <button className="btn" disabled={updating} onClick={() => updateStatus('READY')}>{updating ? 'Updating...' : 'Mark Ready'}</button>
                      <button className="btn" disabled={updating} onClick={() => updateStatus('DELIVERED')}>{updating ? 'Updating...' : 'Mark Delivered'}</button>
                    </>
                  )}
                  {normStatus(order.status) === 'READY' && (
                    <button className="btn" disabled={updating} onClick={() => updateStatus('DELIVERED')}>{updating ? 'Updating...' : 'Mark Delivered'}</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          Tip: Your QR can contain encrypted codes (IARE_...), order tokens (e.g., #1234), or order UUIDs.
        </div>
      </Card>
    </div>
  )
}


