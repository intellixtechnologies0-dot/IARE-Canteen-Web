import './App.css'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import supabase from './lib/supabaseClient'

// Normalize status for UI comparisons (handles lowercase/uppercase from DB)
const normStatus = (s) => String(s || '').toUpperCase()

export default function App() {
  return <DashboardShell />
}

function DashboardShell() {
  const location = useLocation()
  const [connectionStatus, setConnectionStatus] = useState('checking')
  const titles = {
    '/': 'Dashboard',
    '/place-order': 'Place Order',
    '/orders': 'Orders',
    '/inventory': 'Inventory Management',
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

  const updateOrderStatus = async (orderId, nextStatus) => {
    // Persist status via RPC, then update local UI
    try {
      // send lowercase status to the DB RPC (DB stores statuses lowercase)
      const { data, error } = await supabase.rpc('update_order_status', {
        p_order_id: orderId,
        p_new_status: String(nextStatus).toLowerCase(),
      })

      if (error) throw error

      // Update local state based on previous behavior
      const current = orders.find((o) => o.id === orderId)
      if (!current) return
      const prevStatus = current.status
      const now = new Date().toLocaleString()

      // Handle READY and DELIVERED as separate transitions
      if (nextStatus === 'READY') {
        // update order status in-place (remain in live orders until delivered)
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'READY' } : o)))
        setRecent((prev) => {
          const pruned = prev.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING'))
          return [{ orderId, itemName: current.item_name, from: prevStatus, to: 'READY', ts: Date.now() }, ...pruned]
        })
        setActivity((a) => [
          { orderId, itemName: current.item_name, from: prevStatus, to: 'READY', at: now, ts: Date.now(), prevLoc: 'live', nextLoc: 'live' },
          ...a.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING')),
        ])
        return
      }

      if (nextStatus === 'DELIVERED') {
        // move to delivered list and remove from live orders
        setOrders((prev) => prev.filter((o) => o.id !== orderId))
        setDelivered((d) => [{ ...current, status: 'DELIVERED', deliveredAt: Date.now() }, ...d])
        setRecent((prev) => {
          const pruned = prev.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING'))
          return [{ orderId, itemName: current.item_name, from: prevStatus, to: 'DELIVERED', ts: Date.now() }, ...pruned]
        })
        setActivity((a) => [
          { orderId, itemName: current.item_name, from: prevStatus, to: 'DELIVERED', at: now, ts: Date.now(), prevLoc: 'live', nextLoc: 'delivered' },
          ...a.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING')),
        ])
        return
      }

      // default: update status in-place
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)))
      setRecent((prev) => [{ orderId, itemName: current.item_name, from: prevStatus, to: nextStatus, ts: Date.now() }, ...prev])
      setActivity((a) => [
        { orderId, itemName: current.item_name, from: prevStatus, to: nextStatus, at: now, ts: Date.now(), prevLoc: 'live', nextLoc: 'live' },
        ...a,
      ])

    } catch (err) {
      console.error('Failed to update order status:', err)
      // Fallback: optimistic local update (optional). Keep it conservative: alert the user.
      alert('Failed to update order status: ' + (err.message || err))
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
          setConnectionStatus('not-configured')
          return
        }

        setConnectionStatus('connecting')
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error
        setOrders(data || [])
        setConnectionStatus('connected')
        console.log('Successfully fetched orders:', data?.length || 0, 'orders')
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        // when realtime arrives, stop polling and apply change
        if (!gotRealtime) {
          gotRealtime = true
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }
        setOrders((prev) => [payload.new, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (!gotRealtime) {
          gotRealtime = true
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }
        setOrders((prev) => prev.map(o => o.id === payload.new.id ? payload.new : o))
      })
      .subscribe()

    return () => {
      if (intervalId) clearInterval(intervalId)
      try { channel.unsubscribe() } catch (e) { /* ignore */ }
    }
  }, [])

  const revertActivity = (entry) => {
    if (!entry) return
    const { orderId, from, to, prevLoc, nextLoc } = entry
    if (prevLoc === 'live' && nextLoc === 'delivered') {
      // move back from delivered to live with previous status
      const found = delivered.find((o) => o.id === orderId)
      if (!found) return
      setDelivered((d) => d.filter((o) => o.id !== orderId))
      setOrders((prev) => [{ ...found, status: from }, ...prev])
    } else if (prevLoc === 'live' && nextLoc === 'live') {
      // just status change revert
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: from } : o)))
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
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/ai">AI Predictions</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ margin: 0 }}>{title}</h1>
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
          {location.pathname !== '/orders' && (
            <input className="search" placeholder="Search" />
          )}
        </header>
        <Routes>
          <Route path="/" element={<HomePage recent={recent} orders={orders} onUpdateStatus={updateOrderStatus} />} />
          <Route path="/place-order" element={<PlaceOrderPage />} />
          <Route path="/orders" element={<OrdersPage orders={orders} deliveredOrders={delivered} activity={activity} onUpdateStatus={updateOrderStatus} onRevert={revertActivity} view={ordersView} pictureMode={ordersPictureMode} />} />
          <Route path="/inventory" element={<InventoryPage />} />
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

function HomePage({ orders, recent = [], onUpdateStatus }) {
  const latestOrders = [...orders]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 2)
  const deliveredGlobal = window.__IARE_DELIVERED__ || []
  const totalCount = orders.length + deliveredGlobal.length
  const pendingCount = orders.filter((o) => normStatus(o.status) !== 'READY').length
  const completedCount = deliveredGlobal.length

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
            <button className="btn">Refresh Orders</button>
            <button className="btn">View All Orders</button>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Orders (Preview - latest 2)">
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Item Name</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {latestOrders.map((o) => (
                <tr key={o.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666' }}>#{o.id}</span></td>
                  <td><strong>{o.item_name || 'Order Item'}</strong></td>
                  <td>₹{o.total}</td>
                  <td>
                    {normStatus(o.status) === 'PENDING' && <span className="badge pending">PENDING</span>}
                    {normStatus(o.status) === 'PREPARING' && <span className="badge preparing">PREPARING</span>}
                    {normStatus(o.status) === 'READY' && <span className="badge ready">READY</span>}
                    {normStatus(o.status) === 'DELIVERED' && <span className="badge ready">DELIVERED</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      <OrdersTable orders={latestOrders} onUpdateStatus={onUpdateStatus} />
    </div>
  )
}

function PlaceOrderPage() {
  const [placingOrderId, setPlacingOrderId] = useState(null)

  const menuItems = [
    {
      id: 'samosa',
      name: 'Samosa',
      price: 40,
      image: 'https://as2.ftcdn.net/v2/jpg/15/85/73/65/1000_F_1585736532_NFMq8z0vAjbker6w9vuzoF8FmsxVRGPI.jpg',
      description: 'Crispy potato and pea samosa'
    },
    {
      id: 'veg-biryani',
      name: 'Veg Biryani',
      price: 180,
      image: 'https://as1.ftcdn.net/v2/jpg/04/59/27/88/1000_F_459278894_92eSlejnR7NSwJRCbVyy9ZZibSmjbF8q.jpg',
      description: 'Aromatic vegetable biryani with spices'
    },
    {
      id: 'chicken-biryani',
      name: 'Chicken Biryani',
      price: 200,
      image: 'https://as1.ftcdn.net/v2/jpg/04/59/27/88/1000_F_459278894_92eSlejnR7NSwJRCbVyy9ZZibSmjbF8q.jpg',
      description: 'Tender chicken biryani with basmati rice'
    },
    {
      id: 'masala-dosa',
      name: 'Masala Dosa',
      price: 80,
      image: 'https://as2.ftcdn.net/v2/jpg/14/45/94/59/1000_F_1445945944_eBUM7ot1AWezNkqknKsRImNvLvFbmr7z.jpg',
      description: 'Crispy dosa with potato filling'
    }
  ]

  const handlePlaceOrder = async (item) => {
    if (placingOrderId) return // Prevent multiple orders while one is processing
    
    setPlacingOrderId(item.id)
    try {
      const { data, error } = await supabase.rpc('create_order', {
        p_item_name: item.name,
        p_total: item.price,
        p_status: 'PENDING',
        p_order_placer: 'admin'
      })

      if (error) throw error

      alert(`Order placed successfully! Order ID: #${data}`)
      
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
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: 20,
          padding: '16px 0'
        }}>
          {menuItems.map((item) => (
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
    </div>
  )
}

function OrdersTable({ withTitle = true, orders = [], onUpdateStatus = () => {} }) {
  return (
    <Card title={withTitle ? 'Orders' : undefined}>
      <table className="table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Item Name</th>
            <th>Total</th>
            <th>Status</th>
            <th>Placed By</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666' }}>#{o.id}</span></td>
              <td><strong>{o.item_name || 'Order Item'}</strong></td>
              <td>₹{o.total}</td>
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
                    👨‍💼 Staff
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
                    👨‍🎓 Student
                  </span>
                )}
              </td>
              <td className="actions">
                {normStatus(o.status) === 'PENDING' && (
                  <button className="btn" onClick={() => onUpdateStatus(o.id, 'PREPARING')}>Mark Preparing</button>
                )}
                {normStatus(o.status) === 'PREPARING' && (
                  <button className="btn" onClick={() => onUpdateStatus(o.id, 'READY')}>Mark Ready</button>
                )}
                {normStatus(o.status) === 'READY' && (
                  <button className="btn" onClick={() => onUpdateStatus(o.id, 'DELIVERED')}>Mark Delivered</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function OrdersPage({ orders, deliveredOrders = [], activity = [], onUpdateStatus, onRevert, view = 'live', pictureMode = false }) {
  const isLive = view === 'live'
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {view === 'activity' ? (
        <Card title={undefined}>
          <table className="table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>From → To</th>
                <th>At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activity.slice(0, 20).map((e, idx) => (
                <tr key={idx}>
                  <td><strong>{e.itemName || 'Order Item'}</strong></td>
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
                    <div style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666', fontSize: '0.9em', marginBottom: 4 }}>#{o.id}</div>
                    <div style={{ fontWeight: 600, fontSize: '1.1em' }}>{o.item_name || 'Order Item'}</div>
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
                          👨‍💼 Staff
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
                          👨‍🎓 Student
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
                      {normStatus(o.status) === 'PENDING' && (
                        <button className="btn" onClick={() => onUpdateStatus(o.id, 'PREPARING')}>Mark Preparing</button>
                      )}
                      {normStatus(o.status) === 'PREPARING' && (
                        <>
                          <button className="btn" onClick={() => onUpdateStatus(o.id, 'READY')}>Mark Ready</button>
                          <button className="btn" onClick={() => onUpdateStatus(o.id, 'DELIVERED')}>Mark Delivered</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ) : (
          <OrdersTable withTitle={false} orders={orders} onUpdateStatus={onUpdateStatus} />
        )
      ) : (
        <Card title={undefined}>
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Item Name</th>
                <th>Total</th>
                <th>Status</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {deliveredOrders.map((o) => (
                <tr key={o.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666' }}>#{o.id}</span></td>
                  <td><strong>{o.item_name || 'Order Item'}</strong></td>
                  <td>₹{o.total}</td>
                  <td><span className="badge ready">READY</span></td>
                  <td>{o.deliveredAt}</td>
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
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ id: '', name: '' })
  const [filter, setFilter] = useState('all') // all | in | out

  const addItem = () => {
    if (!form.id || !form.name) return
    setItems((prev) => [...prev, { id: form.id, name: form.name, inStock: true }])
    setForm({ id: '', name: '' })
  }

  const toggleStock = (id, inStock) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, inStock } : it)))
  }

  const deleteItem = (id) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="grid-3">
        <Card title="Total Items">
          <div className="stat-value">{items.length}</div>
          <div className="stat-label">All items</div>
        </Card>
        <Card title="In Stock">
          <div className="stat-value">{items.filter(i => i.inStock).length}</div>
          <div className="stat-label">Available</div>
        </Card>
        <Card title="Out of Stock">
          <div className="stat-value">{items.filter(i => !i.inStock).length}</div>
          <div className="stat-label">Unavailable</div>
        </Card>
      </div>

      <Card title="Filters">
        <div className="actions">
          <button className={`btn ${filter==='all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`btn ${filter==='in' ? 'active' : ''}`} onClick={() => setFilter('in')}>In Stock</button>
          <button className={`btn ${filter==='out' ? 'active' : ''}`} onClick={() => setFilter('out')}>Out of Stock</button>
        </div>
      </Card>

      <Card title="Add Item">
        <div className="form">
          <div className="field">
            <label className="label">Item ID</label>
            <input className="input" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
          </div>
          <div className="field" style={{ minWidth: 240 }}>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <button className="btn" onClick={addItem}>Add</button>
        </div>
      </Card>

      <Card title="Items">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter((i) => filter==='all' || (filter==='in' ? i.inStock : !i.inStock))
              .map((it) => (
              <tr key={it.id}>
                <td>{it.id}</td>
                <td>{it.name}</td>
                <td>
                  {it.inStock ? (
                    <span className="badge ready">IN STOCK</span>
                  ) : (
                    <span className="badge pending">OUT OF STOCK</span>
                  )}
                </td>
                <td className="actions">
                  {it.inStock ? (
                    <button className="btn" onClick={() => toggleStock(it.id, false)}>Mark Out of Stock</button>
                  ) : (
                    <button className="btn" onClick={() => toggleStock(it.id, true)}>Mark In Stock</button>
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
  // Build rows dynamically from delivered orders only
  const dataDelivered = (window.__IARE_DELIVERED__ || [])
  const rows = dataDelivered.map(o => ({
    id: o.id,
    item: o.items,
    qty: 1,
    total: o.total,
    status: o.status,
    receivedTs: o.createdAt || o.receivedAt || o.deliveredAt,
    deliveredTs: o.deliveredAt,
  }))

  const fmt = (ts) => new Date(ts).toISOString().slice(0,10)
  const filtered = rows.filter(r => {
    const d = fmt(r.deliveredTs)
    return d >= from && d <= to
  })
  const displayRows = [...filtered].sort((a,b) => b.deliveredTs - a.deliveredTs).slice(0, 5)
  const totals = filtered.reduce((acc, r) => {
    acc.orders += 1
    acc.revenue += r.total
    acc.items += r.qty
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, { orders: 0, revenue: 0, items: 0, PENDING: 0, PREPARING: 0, READY: 0 })

  const exportCsv = () => {
    const header = ['Order ID', 'Item', 'Total', 'Received At', 'Delivered At']
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"'
    const isoNoMs = (ts) => new Date(ts)
      .toISOString()
      .replace(/\.\d{3}Z$/, '') // remove milliseconds and trailing Z
    const lines = filtered.map(r => [
      esc(r.id),
      esc(r.item),
      esc(r.total),
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
    const isoNoMs = (ts) => new Date(ts).toISOString().replace(/\.\d{3}Z$/, '')
    const rowsHtml = filtered.map(r => `
      <tr>
        <td>${esc(r.id)}</td>
        <td>${esc(r.item)}</td>
        <td>${esc(r.total)}</td>
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
          <div className="stat-label">Orders</div>
        </Card>
        <Card title="Revenue">
          <div className="stat-value">₹{totals.revenue}</div>
          <div className="stat-label">Total</div>
        </Card>
        <Card title="Items">
          <div className="stat-value">{totals.items}</div>
          <div className="stat-label">Sold</div>
        </Card>
      </div>

      <Card title="Orders (latest 5 delivered)">
        <table className="table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Item</th>
              <th>Total</th>
              <th>Received</th>
              <th>Delivered</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.item}</td>
                <td>₹{r.total}</td>
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
      const { data, error } = await supabase.from('orders').select('*')
      if (error) {
        setError(error)
      } else {
        setResult(data)
        // also expose globally for quick inspection
        window.__IARE_ORDERS__ = data || []
      }
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

