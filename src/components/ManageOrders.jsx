import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, RefreshCw, Loader } from 'lucide-react'
import supabase from '../lib/supabaseClient'

const ManageOrders = () => {
  const [foodItems, setFoodItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingItems, setUpdatingItems] = useState(new Set())
  const [readyCounts, setReadyCounts] = useState({})
  const [errors, setErrors] = useState({})
  const [toastMessage, setToastMessage] = useState(null)

  // Normalize item names to improve matching between orders and food items
  const normalizeName = (value) => {
    if (!value || typeof value !== 'string') return ''
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ') // remove punctuation/symbols
      .trim()
      .replace(/\s+/g, ' ') // collapse whitespace
  }

  // Fetch food items with pending order counts
  const fetchFoodItemsWithCounts = async () => {
    try {
      setLoading(true)
      
      // Fetch food items with pending_deliver_count column
      const { data: foodItemsData, error: foodItemsError } = await supabase
        .from('food_items')
        .select('id, name, price, available_quantity, pending_deliver_count, ready_to_deliver_count')

      if (foodItemsError) {
        console.error('Food items error:', foodItemsError)
        throw foodItemsError
      }

      // Use pending_deliver_count directly from the database
      const itemsWithCounts = (foodItemsData || []).map(item => ({
        ...item,
        pendingCount: item.pending_deliver_count || 0,
        readyCount: item.ready_to_deliver_count || 0
      }))

      // Sort by pending count (highest first) to show top priority items first
      itemsWithCounts.sort((a, b) => {
        // Primary sort: highest pending count first
        if (b.pendingCount !== a.pendingCount) {
          return b.pendingCount - a.pendingCount
        }
        // Secondary sort: alphabetically by name
        return a.name.localeCompare(b.name)
      })

      console.log('🍽️ Food items with counts (sorted by priority):', itemsWithCounts.map(item => ({
        name: item.name,
        pendingCount: item.pendingCount
      })))

      setFoodItems(itemsWithCounts)
      
      // Initialize ready counts
      const initialReadyCounts = {}
      itemsWithCounts.forEach(item => {
        initialReadyCounts[item.id] = ''
      })
      setReadyCounts(initialReadyCounts)
      
    } catch (error) {
      console.error('Error fetching food items:', error)
      showToastMessage('Error loading food items', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle input change for ready count
  const handleReadyCountChange = (itemId, value) => {
    const item = foodItems.find(f => f.id === itemId)
    const numValue = parseInt(value) || 0
    
    // Clear previous error
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[itemId]
      return newErrors
    })

    // Validate input
    if (value !== '' && (numValue < 0 || numValue > item.pendingCount)) {
      setErrors(prev => ({
        ...prev,
        [itemId]: `Must be between 0 and ${item.pendingCount}`
      }))
    }

    setReadyCounts(prev => ({
      ...prev,
      [itemId]: value
    }))
  }

  // Mark orders as ready
  const markOrdersReady = async (itemId) => {
    const item = foodItems.find(f => f.id === itemId)
    const readyCount = parseInt(readyCounts[itemId]) || 0

    if (readyCount <= 0 || readyCount > item.pendingCount) {
      setErrors(prev => ({
        ...prev,
        [itemId]: `Must be between 1 and ${item.pendingCount}`
      }))
      return
    }

    try {
      setUpdatingItems(prev => new Set([...prev, itemId]))

      // Single RPC handles allocation + status + counts atomically in DB
      const { data: result, error: rpcError } = await supabase
        .rpc('allocate_ready_items', {
          p_food_item_id: itemId,
          p_add_count: readyCount
        })

      if (rpcError) {
        console.error('❌ RPC allocate_ready_items error:', rpcError)
        throw rpcError
      }

      // Result can include fulfilled, skipped, remaining
      showToastMessage(`✅ Marked ${result?.fulfilled || 0} orders ready • ${result?.remaining || 0} remaining`, 'success')

      // Clear the input for this item
      setReadyCounts(prev => ({ ...prev, [itemId]: '' }))

      // Refresh counts from DB (pending and ready)
      await fetchFoodItemsWithCounts()

    } catch (error) {
      console.error('❌ FATAL ERROR in markOrdersReady:', error)
      console.error('❌ Error stack:', error.stack)
      showToastMessage(`Error: ${error.message || 'Failed to update orders'}`, 'error')
    } finally {
      setUpdatingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }
  }

  // Show toast message
  const showToastMessage = (message, type = 'success') => {
    setToastMessage({ message, type })
    setTimeout(() => setToastMessage(null), 3000)
  }

  useEffect(() => {
    fetchFoodItemsWithCounts()
  }, [])

  if (loading) {
    return (
      <div className="home-dashboard">
        <div className="card">
          <div className="card-title">Manage Orders</div>
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 animate-spin text-primary-500" />
            <span className="ml-3 text-muted">Loading food items...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="home-dashboard">
      {/* Header */}
      <div className="card">
        <div className="card-title">Manage Orders</div>
        <div className="flex items-center justify-between">
          <div className="muted">Mark orders as ready for each food item</div>
          <button
            onClick={fetchFoodItemsWithCounts}
            disabled={loading}
            className="btn btn-primary"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Food Items Grid */}
      <div className="food-items-grid">
        {foodItems.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="card compact-card"
          >
            {/* Header */}
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 className="food-item-name">{item.name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {item.readyCount > 0 && (
                  <span className="pending-badge" style={{ backgroundColor: '#22c55e' }}>
                    {item.readyCount} ready
                  </span>
                )}
                <span className="pending-badge">
                  {item.pendingCount} pending
                </span>
              </div>
            </div>

            {/* Input and Button */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Orders Ready
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max={item.pendingCount}
                    value={readyCounts[item.id] || ''}
                    onChange={(e) => handleReadyCountChange(item.id, e.target.value)}
                    placeholder="0"
                    className="flex-1 input"
                    disabled={item.pendingCount === 0 || updatingItems.has(item.id)}
                  />
                  <button
                    onClick={() => markOrdersReady(item.id)}
                    disabled={item.pendingCount === 0 || updatingItems.has(item.id) || !readyCounts[item.id] || errors[item.id]}
                    className="btn btn-success"
                  >
                    {updatingItems.has(item.id) ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              <AnimatePresence>
                {errors[item.id] && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center text-sm text-red-500"
                  >
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors[item.id]}
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        ))}
      </div>

      {/* Toast Message */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
              toastMessage.type === 'success' 
                ? 'bg-green-500 text-white' 
                : 'bg-red-500 text-white'
            }`}
          >
            <div className="flex items-center">
              {toastMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5 mr-2" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-2" />
              )}
              {toastMessage.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ManageOrders
