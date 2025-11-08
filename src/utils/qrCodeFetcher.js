import supabase from '../lib/supabaseClient'

/**
 * Utility functions for fetching encrypted QR codes from Supabase orders table
 */

/**
 * Fetch encrypted QR codes from orders table with optional filters
 * @param {Object} filters - Optional filters to apply
 * @param {string} filters.status - Filter by order status (e.g., 'PENDING', 'PREPARING', 'READY', 'DELIVERED')
 * @param {string} filters.user_id - Filter by user ID
 * @param {string} filters.order_type - Filter by order type (e.g., 'dine-in', 'takeaway')
 * @param {string} filters.date_from - Filter orders from this date (ISO string)
 * @param {string} filters.date_to - Filter orders to this date (ISO string)
 * @param {number} filters.limit - Limit number of results
 * @returns {Promise<Object>} Result object with success, data, count, and error properties
 */
export const fetchEncryptedQRCodes = async (filters = {}) => {
  try {
    
    let query = supabase
      .from('orders')
      .select('id, qr_code, order_token, item_name, status, created_at, total_amount, user_id, order_type')
      .not('qr_code', 'is', null) // Only get orders that have QR codes
      .order('created_at', { ascending: false })

    // Apply filters if provided
    if (filters.status) {
      query = query.eq('status', filters.status)
    }
    
    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id)
    }
    
    if (filters.order_type) {
      query = query.eq('order_type', filters.order_type)
    }
    
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from)
    }
    
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to)
    }
    
    if (filters.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ Error fetching encrypted QR codes:', error)
      throw error
    }

    
    
    // Return the data with QR codes (these are already encrypted as stored in the database)
    return {
      success: true,
      data: data || [],
      count: data?.length || 0
    }
  } catch (error) {
    console.error('❌ Failed to fetch encrypted QR codes:', error)
    return {
      success: false,
      error: error.message,
      data: [],
      count: 0
    }
  }
}

/**
 * Fetch a specific encrypted QR code by order ID
 * @param {string} orderId - The order ID to fetch
 * @returns {Promise<Object>} Result object with success, data, and error properties
 */
export const fetchEncryptedQRCodeById = async (orderId) => {
  try {
    
    const { data, error } = await supabase
      .from('orders')
      .select('id, qr_code, order_token, item_name, status, created_at, total_amount, user_id, order_type')
      .eq('id', orderId)
      .single()

    if (error) {
      console.error('❌ Error fetching encrypted QR code by ID:', error)
      throw error
    }

    if (!data) {
      return {
        success: false,
        error: 'Order not found',
        data: null
      }
    }

    
    
    return {
      success: true,
      data: data
    }
  } catch (error) {
    console.error('❌ Failed to fetch encrypted QR code by ID:', error)
    return {
      success: false,
      error: error.message,
      data: null
    }
  }
}

/**
 * Fetch encrypted QR code by QR code value
 * @param {string} qrCodeValue - The QR code value to search for
 * @returns {Promise<Object>} Result object with success, data, and error properties
 */
export const fetchEncryptedQRCodeByValue = async (qrCodeValue) => {
  try {
    
    const { data, error } = await supabase
      .from('orders')
      .select('id, qr_code, order_token, item_name, status, created_at, total_amount, user_id, order_type')
      .eq('qr_code', qrCodeValue)
      .single()

    if (error) {
      console.error('❌ Error fetching encrypted QR code by value:', error)
      throw error
    }

    if (!data) {
      return {
        success: false,
        error: 'Order not found',
        data: null
      }
    }

    
    
    return {
      success: true,
      data: data
    }
  } catch (error) {
    console.error('❌ Failed to fetch encrypted QR code by value:', error)
    return {
      success: false,
      error: error.message,
      data: null
    }
  }
}

/**
 * Fetch recent encrypted QR codes (last N days)
 * @param {number} days - Number of days to look back (default: 7)
 * @param {number} limit - Maximum number of results (default: 10)
 * @returns {Promise<Object>} Result object with success, data, count, and error properties
 */
export const fetchRecentEncryptedQRCodes = async (days = 7, limit = 10) => {
  const dateFrom = new Date()
  dateFrom.setDate(dateFrom.getDate() - days)
  
  return await fetchEncryptedQRCodes({
    date_from: dateFrom.toISOString(),
    limit: limit
  })
}

/**
 * Fetch encrypted QR codes by status
 * @param {string} status - Order status to filter by
 * @param {number} limit - Maximum number of results (default: 50)
 * @returns {Promise<Object>} Result object with success, data, count, and error properties
 */
export const fetchEncryptedQRCodesByStatus = async (status, limit = 50) => {
  return await fetchEncryptedQRCodes({
    status: status,
    limit: limit
  })
}

/**
 * Get QR code statistics
 * @returns {Promise<Object>} Statistics about QR codes in the system
 */
export const getQRCodeStatistics = async () => {
  try {
    
    const { data, error } = await supabase
      .from('orders')
      .select('status, qr_code')
      .not('qr_code', 'is', null)

    if (error) {
      console.error('❌ Error fetching QR code statistics:', error)
      throw error
    }

    const stats = {
      total: data?.length || 0,
      byStatus: {},
      hasQRCode: 0,
      withoutQRCode: 0
    }

    // Count by status
    data?.forEach(order => {
      const status = order.status || 'UNKNOWN'
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1
      if (order.qr_code) {
        stats.hasQRCode++
      }
    })

    
    
    return {
      success: true,
      data: stats
    }
  } catch (error) {
    console.error('❌ Failed to fetch QR code statistics:', error)
    return {
      success: false,
      error: error.message,
      data: null
    }
  }
}
