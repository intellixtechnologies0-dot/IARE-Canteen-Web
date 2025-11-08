import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CircleCheckBig, Loader } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useGlobalQR } from '../contexts/GlobalQRContext'
import { useSoundNotification } from '../hooks/useSoundNotification'

// App user ID - used to identify orders placed from external apps vs website counter
// Orders with this user_id are from external APPS, all others are from the WEBSITE/COUNTER
const APP_USER_ID = 'dd856fdc-905b-4de3-a7e3-771ad81df52c'

function normStatus(s) {
  const str = String(s || '').toLowerCase()
  if (str === 'pending') return 'PENDING'
  if (str === 'preparing') return 'PREPARING'
  if (str === 'ready') return 'READY'
  if (str === 'delivered') return 'DELIVERED'
  if (str === 'cancelled') return 'CANCELLED'
  return str.toUpperCase()
}

export default function GlobalQRModal() {
  const { scannedOrder, closeModal, queuedScans } = useGlobalQR()
  const { playNotification } = useSoundNotification()
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState('')

  const updateToDelivered = async () => {
    if (!scannedOrder) return
    
    setUpdating(true)
    setMessage('')
    
    try {
      const { error } = await supabase.rpc('update_order_status_flexible', {
        p_order_id: scannedOrder.id,
        p_new_status: 'delivered',
      })
      
      if (error) throw error
      
      // Play success sound
      try {
        await playNotification()
      } catch (e) {
        console.log('Sound failed:', e)
      }
      
      setMessage('✅ Order marked as delivered')
      
      // Close modal after short delay
      setTimeout(() => {
        closeModal()
        setMessage('')
      }, 1000)
      
    } catch (e) {
      console.error('Failed to update order:', e)
      setMessage(`❌ Failed: ${e.message || 'Unknown error'}`)
      setTimeout(() => setMessage(''), 3000)
    } finally {
      setUpdating(false)
    }
  }

  const cancelOrder = async () => {
    if (!scannedOrder) return
    if (!window.confirm('Are you sure you want to cancel this order?')) return
    
    setUpdating(true)
    setMessage('')
    
    try {
      const { error } = await supabase.rpc('update_order_status_flexible', {
        p_order_id: scannedOrder.id,
        p_new_status: 'cancelled',
      })
      
      if (error) throw error
      
      // Play success sound
      try {
        await playNotification()
      } catch (e) {
        console.log('Sound failed:', e)
      }
      
      setMessage('✅ Order cancelled')
      
      // Close modal after short delay
      setTimeout(() => {
        closeModal()
        setMessage('')
      }, 1000)
      
    } catch (e) {
      console.error('Failed to cancel order:', e)
      setMessage(`❌ Failed: ${e.message || 'Unknown error'}`)
      setTimeout(() => setMessage(''), 3000)
    } finally {
      setUpdating(false)
    }
  }

  if (!scannedOrder) return null

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeModal}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 10000,
          backdropFilter: 'blur(4px)'
        }}
      />
      
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          zIndex: 10001,
          maxWidth: '500px',
          width: '90%',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: '16px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
              📦 Order Scanned
            </h3>
            {queuedScans.length > 0 && (
              <div style={{ 
                fontSize: '12px', 
                color: '#6b7280', 
                marginTop: '4px',
                backgroundColor: '#fef3c7',
                padding: '4px 8px',
                borderRadius: '4px',
                display: 'inline-block'
              }}>
                {queuedScans.length} order{queuedScans.length > 1 ? 's' : ''} in queue
              </div>
            )}
          </div>
          <button
            onClick={closeModal}
            disabled={updating}
            style={{
              background: 'none',
              border: 'none',
              cursor: updating ? 'not-allowed' : 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              color: '#6b7280',
              opacity: updating ? 0.5 : 1
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Order Details */}
        <div style={{ 
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          {/* Token - Prominent Display */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '16px',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <span style={{ color: '#6b7280', fontSize: '14px', fontWeight: '500' }}>Token Number:</span>
            <span style={{ 
              fontSize: '32px', 
              fontWeight: '700', 
              color: '#1f2937',
              backgroundColor: '#fff',
              padding: '8px 16px',
              borderRadius: '10px',
              border: '3px solid #3b82f6',
              letterSpacing: '2px'
            }}>
              #{scannedOrder.order_token || 'N/A'}
            </span>
          </div>
          
          {/* Items */}
          <div style={{ marginBottom: '12px' }}>
            <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>Items:</span>
            <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '16px' }}>
              {scannedOrder.item_name || 'Order Items'}
            </div>
          </div>
          
          {/* Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>Total Amount:</span>
              <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '18px' }}>
                ₹{scannedOrder.total_amount != null ? scannedOrder.total_amount : '-'}
              </div>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>Current Status:</span>
              <div style={{ 
                fontWeight: '600', 
                fontSize: '16px',
                color: scannedOrder.status === 'pending' ? '#f59e0b' : 
                       scannedOrder.status === 'preparing' ? '#3b82f6' : 
                       scannedOrder.status === 'ready' ? '#10b981' : 
                       scannedOrder.status === 'delivered' ? '#6b7280' : '#dc2626'
              }}>
                {normStatus(scannedOrder.status)}
              </div>
            </div>
          </div>

          {/* Order Type & Source */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>Order Type:</span>
              <div style={{ fontWeight: '500', color: '#1f2937', fontSize: '14px' }}>
                {scannedOrder.order_type ? '🥡 Takeaway' : '🍽️ Dine In'}
              </div>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>Placed Via:</span>
              <div style={{ fontWeight: '500', color: '#1f2937', fontSize: '14px' }}>
                {scannedOrder.user_id === APP_USER_ID ? '📱 App' : '🏪 Counter'}
              </div>
            </div>
          </div>
        </div>

        {/* Success/Error Message */}
        {message && (
          <div style={{ 
            marginBottom: '16px',
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: message.includes('✅') ? '#d1fae5' : '#fee2e2',
            color: message.includes('✅') ? '#065f46' : '#991b1b',
            fontSize: '14px',
            fontWeight: '500',
            textAlign: 'center'
          }}>
            {message}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Mark as Delivered - Primary Action */}
          {scannedOrder.status !== 'delivered' && scannedOrder.status !== 'cancelled' && (
            <button
              onClick={updateToDelivered}
              disabled={updating}
              style={{
                width: '100%',
                padding: '16px 20px',
                fontSize: '16px',
                fontWeight: '600',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: updating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                opacity: updating ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!updating) e.target.style.backgroundColor = '#059669'
              }}
              onMouseLeave={(e) => {
                if (!updating) e.target.style.backgroundColor = '#10b981'
              }}
            >
              {updating ? <Loader size={18} className="spin" /> : <CircleCheckBig size={18} />}
              {updating ? 'Updating...' : 'Mark as Delivered'}
            </button>
          )}

          {scannedOrder.status === 'delivered' && (
            <div style={{
              padding: '16px',
              backgroundColor: '#d1fae5',
              color: '#065f46',
              borderRadius: '10px',
              textAlign: 'center',
              fontWeight: '600'
            }}>
              ✅ This order has already been delivered
            </div>
          )}

          {/* Secondary Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Cancel Order */}
            {scannedOrder.status !== 'delivered' && scannedOrder.status !== 'cancelled' && (
              <button
                onClick={cancelOrder}
                disabled={updating}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: '#ffffff',
                  color: '#dc2626',
                  border: '1px solid #dc2626',
                  borderRadius: '8px',
                  cursor: updating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                  opacity: updating ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!updating) e.target.style.backgroundColor = '#fef2f2'
                }}
                onMouseLeave={(e) => {
                  if (!updating) e.target.style.backgroundColor = '#ffffff'
                }}
              >
                <X size={16} />
                Cancel Order
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={closeModal}
              disabled={updating}
              style={{
                flex: 1,
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '8px',
                cursor: updating ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: updating ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!updating) e.target.style.backgroundColor = '#e5e7eb'
              }}
              onMouseLeave={(e) => {
                if (!updating) e.target.style.backgroundColor = '#f3f4f6'
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Order Code Reference (collapsed) */}
        <div style={{ 
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <details style={{ cursor: 'pointer' }}>
            <summary style={{ 
              fontSize: '12px', 
              color: '#6b7280',
              userSelect: 'none',
              cursor: 'pointer'
            }}>
              Order Code Reference
            </summary>
            <code style={{ 
              fontSize: '11px', 
              backgroundColor: '#f3f4f6', 
              padding: '6px 10px', 
              borderRadius: '4px',
              display: 'block',
              marginTop: '8px',
              wordBreak: 'break-all',
              color: '#374151',
              fontFamily: 'monospace'
            }}>
              {scannedOrder.qr_code || 'Not available'}
            </code>
          </details>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

