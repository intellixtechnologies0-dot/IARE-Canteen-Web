import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CircleCheckBig, Loader } from 'lucide-react'
import supabase from '../lib/supabaseClient'

const APP_USER_ID = 'dd856fdc-905b-4de3-a7e3-771ad81df52c'

const normaliseStatus = (status) => {
  const value = String(status || '').toLowerCase()
  if (value === 'pending') return 'PENDING'
  if (value === 'preparing') return 'PREPARING'
  if (value === 'ready') return 'READY'
  if (value === 'delivered') return 'DELIVERED'
  if (value === 'cancelled') return 'CANCELLED'
  return value.toUpperCase()
}

export default function OrderScanModal({ order, onClose }) {
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState('')

  if (!order) return null

  const safeClose = () => {
    setMessage('')
    onClose?.()
  }

  const updateStatus = async (nextStatus) => {
    if (!order) return

    setUpdating(true)
    setMessage('')

    try {
      const { error } = await supabase.rpc('update_order_status_flexible', {
        p_order_id: order.id,
        p_new_status: String(nextStatus).toLowerCase(),
      })

      if (error) throw error

      const successText =
        nextStatus === 'delivered' ? '✅ Order marked as delivered' : '✅ Order cancelled'

      setMessage(successText)

      setTimeout(() => {
        safeClose()
      }, 1000)
    } catch (err) {
      console.error('Failed to update order:', err)
      setMessage(`❌ Failed: ${err.message || 'Unknown error'}`)
      setTimeout(() => setMessage(''), 3000)
    } finally {
      setUpdating(false)
    }
  }

  const handleMarkDelivered = () => updateStatus('delivered')
  const handleCancel = async () => {
    if (!order) return
    if (!window.confirm('Are you sure you want to cancel this order?')) return
    await updateStatus('cancelled')
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          bottom: 16,
          width: 420,
          backgroundColor: '#ffffff',
          borderRadius: 16,
          padding: 24,
          zIndex: 100000,
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '2px solid #e5e7eb',
            paddingBottom: '16px',
            position: 'sticky',
            top: 0,
            background: '#ffffff',
            zIndex: 1,
          }}
        >
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
            📦 Order Ready
          </h3>
          <button
            onClick={safeClose}
            disabled={updating}
            style={{
              background: 'none',
              border: 'none',
              cursor: updating ? 'not-allowed' : 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              color: '#6b7280',
              opacity: updating ? 0.5 : 1,
            }}
          >
            <X size={24} />
          </button>
        </div>

        <div
          style={{
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              paddingBottom: '16px',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <span style={{ color: '#6b7280', fontSize: '14px', fontWeight: '500' }}>Token Number:</span>
            <span
              style={{
                fontSize: '32px',
                fontWeight: '700',
                color: '#1f2937',
                backgroundColor: '#fff',
                padding: '8px 16px',
                borderRadius: '10px',
                border: '3px solid #3b82f6',
                letterSpacing: '2px',
              }}
            >
              #{order.order_token || 'N/A'}
            </span>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>
              Items:
            </span>
            <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '16px' }}>
              {order.item_name || 'Order Items'}
            </div>
          </div>

          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}
          >
            <div>
              <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>
                Total Amount:
              </span>
              <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '18px' }}>
                ₹{order.total_amount != null ? order.total_amount : '-'}
              </div>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>
                Current Status:
              </span>
              <div
                style={{
                  fontWeight: '600',
                  fontSize: '16px',
                  color:
                    order.status === 'pending'
                      ? '#f59e0b'
                      : order.status === 'preparing'
                      ? '#3b82f6'
                      : order.status === 'ready'
                      ? '#10b981'
                      : order.status === 'delivered'
                      ? '#6b7280'
                      : '#dc2626',
                }}
              >
                {normaliseStatus(order.status)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>
                Order Type:
              </span>
              <div style={{ fontWeight: '500', color: '#1f2937', fontSize: '14px' }}>
                {order.order_type ? '🥡 Takeaway' : '🍽️ Dine In'}
              </div>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '4px' }}>
                Placed Via:
              </span>
              <div style={{ fontWeight: '500', color: '#1f2937', fontSize: '14px' }}>
                {order.user_id === APP_USER_ID ? '📱 App' : '🏪 Counter'}
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: message.includes('✅') ? '#d1fae5' : '#fee2e2',
              color: message.includes('✅') ? '#065f46' : '#991b1b',
              fontSize: '14px',
              fontWeight: '500',
              textAlign: 'center',
            }}
          >
            {message}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <button
              onClick={handleMarkDelivered}
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
                opacity: updating ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!updating) e.currentTarget.style.backgroundColor = '#059669'
              }}
              onMouseLeave={(e) => {
                if (!updating) e.currentTarget.style.backgroundColor = '#10b981'
              }}
            >
              {updating ? <Loader size={18} className="spin" /> : <CircleCheckBig size={18} />}
              {updating ? 'Updating...' : 'Mark as Delivered'}
            </button>
          )}

          {order.status === 'delivered' && (
            <div
              style={{
                padding: '16px',
                backgroundColor: '#d1fae5',
                color: '#065f46',
                borderRadius: '10px',
                textAlign: 'center',
                fontWeight: '600',
              }}
            >
              ✅ This order has already been delivered
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            {order.status !== 'delivered' && order.status !== 'cancelled' && (
              <button
                onClick={handleCancel}
                disabled={updating}
                title="Cancel order"
                aria-label="Cancel order"
                style={{
                  width: 40,
                  height: 40,
                  padding: 0,
                  backgroundColor: '#ffffff',
                  color: '#dc2626',
                  border: '1px solid #dc2626',
                  borderRadius: '8px',
                  cursor: updating ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  opacity: updating ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!updating) e.currentTarget.style.backgroundColor = '#fef2f2'
                }}
                onMouseLeave={(e) => {
                  if (!updating) e.currentTarget.style.backgroundColor = '#ffffff'
                }}
              >
                <X size={16} />
              </button>
            )}

            <button
              onClick={safeClose}
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
                opacity: updating ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!updating) e.currentTarget.style.backgroundColor = '#e5e7eb'
              }}
              onMouseLeave={(e) => {
                if (!updating) e.currentTarget.style.backgroundColor = '#f3f4f6'
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <details style={{ cursor: 'pointer' }}>
            <summary
              style={{
                fontSize: '12px',
                color: '#6b7280',
                userSelect: 'none',
              }}
            >
              Order Identifier
            </summary>
            <code
              style={{
                fontSize: '11px',
                backgroundColor: '#f3f4f6',
                padding: '6px 10px',
                borderRadius: '4px',
                display: 'block',
                marginTop: '8px',
                wordBreak: 'break-all',
                color: '#374151',
                fontFamily: 'monospace',
              }}
            >
              {order.order_token || order.qr_code || 'Not available'}
            </code>
          </details>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}


