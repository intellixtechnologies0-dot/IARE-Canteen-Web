import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import supabase from '../lib/supabaseClient'

// App user ID - used to identify orders placed from external apps vs website counter
// Orders with this user_id are from external APPS, all others are from the WEBSITE/COUNTER
const APP_USER_ID = 'dd856fdc-905b-4de3-a7e3-771ad81df52c'

const NotificationContext = createContext()

export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}

export const NotificationProvider = ({ children }) => {
  const [isEnabled, setIsEnabled] = useState(true)
  const [lastOrderCount, setLastOrderCount] = useState(0)
  const [isInitialized, setIsInitialized] = useState(true) // No audio initialization needed
  const [lastNotificationTime, setLastNotificationTime] = useState(0)
  const [popupNotification, setPopupNotification] = useState(null)
  const intervalRef = useRef(null)
  const subscriptionRef = useRef(null)
  const notificationCooldownRef = useRef(3000) // 3 second cooldown between notifications
  const popupTimeoutRef = useRef(null)
  const lastNotificationOrderRef = useRef(null) // Track last notified order to prevent duplicates
  const suppressedOrderIdsRef = useRef(new Set()) // Orders to suppress notifications for (local-only)

  // Audio initialization removed - no sounds in the website

  // Show popup notification
  const showPopupNotification = useCallback((orderData) => {
    // Clear any existing popup
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current)
    }

    const isCancellation = orderData.isCancellation || orderData.order_type === 'cancelled'
    const isAvailabilityChange = orderData.isAvailabilityChange
    const isError = orderData.isError
    
    let popup = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      orderData
    }
    
    // Suppress popup for cancellations per requirement
    if (isCancellation) {
      return
    }
    
    // Suppress popup for regular new orders - they now appear directly in the orders panel
    if (!isError && !isAvailabilityChange) {
      console.log('🔇 Popup suppressed for new order - order appears directly in orders panel')
      return
    }
    
    if (isError) {
      popup.type = 'error'
      popup.title = 'Error!'
      popup.message = orderData.item_name || 'An error occurred'
    } else if (isAvailabilityChange) {
      popup.type = 'availability_change'
      popup.title = 'Item Availability Updated!'
      popup.message = orderData.item_name || 'Item availability has been changed'
    }

    setPopupNotification(popup)

    // Auto-hide after 5 seconds
    popupTimeoutRef.current = setTimeout(() => {
      setPopupNotification(null)
    }, 5000)
  }, [])

  // Show order notification (popup only, no sound)
  const showOrderNotification = useCallback(async (orderData) => {
    console.log('🔔 showOrderNotification called with:', orderData)
    console.log('🔔 Current state:', {
      isEnabled,
      isInitialized,
      timeSinceLastNotification: Date.now() - lastNotificationTime,
      cooldown: notificationCooldownRef.current
    })

    if (!isEnabled) {
      console.log('🔇 Notifications disabled')
      return
    }

    const now = Date.now()
    const timeSinceLastNotification = now - lastNotificationTime

    // Suppression: skip notifications for locally placed orders (current session)
    const idCandidates = [orderData?.id, orderData?.order_id, orderData?.token_no, orderData?.order_token].filter(Boolean)
    for (const cand of idCandidates) {
      if (suppressedOrderIdsRef.current.has(cand)) {
        console.log('🔇 Notification suppressed for local order:', cand)
        // one-shot suppression
        suppressedOrderIdsRef.current.delete(cand)
        return
      }
    }

    // Check for duplicate notifications (same order ID)
    const orderId = orderData.id || orderData.order_id || orderData.token_no
    if (lastNotificationOrderRef.current === orderId) {
      console.log('🔇 Notification skipped (duplicate order ID):', orderId)
      return
    }

    if (timeSinceLastNotification < notificationCooldownRef.current) {
      console.log('🔇 Notification skipped (cooldown active):', timeSinceLastNotification, 'ms <', notificationCooldownRef.current, 'ms')
      return
    }

    console.log('🔔 Showing order notification...', orderData)
    setLastNotificationTime(now)
    lastNotificationOrderRef.current = orderId
    
    // Show popup notification
    console.log('📱 Showing popup notification...')
    showPopupNotification(orderData)
    
    // Sound notifications removed - website is now silent
  }, [lastNotificationTime, showPopupNotification, isEnabled, isInitialized])

  // Close popup notification
  const closePopupNotification = useCallback(() => {
    setPopupNotification(null)
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current)
    }
  }, [])

  // Check for new orders periodically (backup method)
  useEffect(() => {
    if (!isEnabled || !isInitialized) return

    const checkForNewOrders = async () => {
      try {
        // Get current order count (excluding app orders)
        const { data: orders, error } = await supabase
          .from('orders')
          .select('id, status, user_id')
          .in('status', ['pending', 'PENDING']) // Support both cases
          .neq('user_id', APP_USER_ID) // Exclude app orders
          .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute

        if (error) {
          console.warn('⚠️ Failed to check for new orders:', error)
          return
        }

        const currentOrderCount = orders?.length || 0

        // If we have more orders than before, show notification
        if (currentOrderCount > lastOrderCount && lastOrderCount > 0) {
          console.log('🔔 New order detected via polling!')
          // Get the latest order for popup details
          try {
            const { data: latestOrder } = await supabase
              .from('orders')
              .select('*')
              .in('status', ['pending', 'PENDING'])
              .neq('user_id', APP_USER_ID)
              .order('created_at', { ascending: false })
              .limit(1)
              .single()
            
            if (latestOrder) {
              await showOrderNotification(latestOrder)
            } else {
              await showOrderNotification({ item_name: 'New Order', order_token: 'N/A' })
            }
          } catch (error) {
            console.warn('⚠️ Failed to get latest order details:', error)
            await showOrderNotification({ item_name: 'New Order', order_token: 'N/A' })
          }
        }

        setLastOrderCount(currentOrderCount)
      } catch (error) {
        console.warn('⚠️ Error checking for new orders:', error)
      }
    }

    // Check every 5 seconds (less frequent to avoid conflicts with real-time)
    intervalRef.current = setInterval(checkForNewOrders, 5000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isEnabled, isInitialized, lastOrderCount, showOrderNotification])

  // Real-time subscription to orders table (primary method)
  useEffect(() => {
    if (!isEnabled || !isInitialized) return

    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe()
    }

    subscriptionRef.current = supabase
      .channel('orders-notifications')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'orders' 
        }, 
        async (payload) => {
          console.log('🔔 NotificationContext: New order inserted via real-time:', payload.new)
          console.log('🔍 Order details:', {
            status: payload.new.status,
            user_id: payload.new.user_id,
            item_name: payload.new.item_name,
            created_at: payload.new.created_at,
            id: payload.new.id
          })
          
          // Show notification for PENDING orders that are not placed from app
          const isPending = payload.new.status === 'pending' || payload.new.status === 'PENDING'
          const isNotAppOrder = payload.new.user_id !== APP_USER_ID
          
          console.log('🔍 Filter check:', {
            isPending,
            isNotAppOrder,
            willNotify: isPending && isNotAppOrder,
            statusValue: payload.new.status,
            userIdValue: payload.new.user_id
          })
          
          if (isPending && isNotAppOrder) {
            console.log('✅ NotificationContext: Showing notification for counter order!')
            try {
              await showOrderNotification(payload.new)
              console.log('✅ NotificationContext: Notification triggered successfully')
            } catch (error) {
              console.error('❌ NotificationContext: Error showing notification:', error)
            }
          } else {
            console.log('❌ NotificationContext: Notification filtered out:', {
              reason: !isPending ? 'Not pending status' : 'App order',
              status: payload.new.status,
              user_id: payload.new.user_id
            })
          }
        }
      )
      .subscribe()

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
        subscriptionRef.current = null
      }
    }
  }, [isEnabled, isInitialized, showOrderNotification])

  // Listen for custom events from Orders Panel as backup notification method
  useEffect(() => {
    if (!isEnabled || !isInitialized) return

    const handleOrderInserted = async (event) => {
      console.log('🔔 NotificationContext: Received orderInserted event from Orders Panel:', event.detail)
      console.log('🔍 Event details:', {
        orderData: event.detail,
        isEnabled,
        isInitialized
      })
      
      try {
        const orderData = event.detail
        console.log('✅ NotificationContext: Triggering notification from Orders Panel event!')
        await showOrderNotification(orderData)
        console.log('✅ NotificationContext: Orders Panel notification triggered successfully')
      } catch (error) {
        console.warn('⚠️ NotificationContext: Error handling orderInserted event:', error)
      }
    }

    // Listen for the custom event from Orders Panel
    window.addEventListener('orderInserted', handleOrderInserted)

    return () => {
      window.removeEventListener('orderInserted', handleOrderInserted)
    }
  }, [isEnabled, isInitialized, showOrderNotification])

  const toggleNotifications = () => {
    setIsEnabled(!isEnabled)
  }

  const playTestSound = async () => {
    // Sound removed - no action needed
    console.log('🔇 Sound notifications are disabled in this version')
  }

  const value = {
    isEnabled,
    toggleNotifications,
    playTestSound,
    isInitialized,
    popupNotification,
    closePopupNotification,
    showOrderNotification,
    suppressNotificationForOrder: (orderId) => {
      if (!orderId) return
      try {
        suppressedOrderIdsRef.current.add(orderId)
        // Optional: auto-clear after a minute to avoid leaks
        setTimeout(() => suppressedOrderIdsRef.current.delete(orderId), 60000)
      } catch (_) {}
    }
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}
