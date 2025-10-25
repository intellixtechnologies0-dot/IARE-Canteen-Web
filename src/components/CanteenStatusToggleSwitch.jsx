import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Utensils, UtensilsCrossed } from 'lucide-react'
import { useCanteenStatus } from '../contexts/CanteenStatusContext'

const CanteenStatusToggleSwitch = () => {
  const { status, loading, updating, toggleStatus } = useCanteenStatus()
  const [showToast, setShowToast] = useState({ show: false, message: '', type: 'success' })

  const showToastMessage = (message, type = 'success') => {
    setShowToast({ show: true, message, type })
    setTimeout(() => {
      setShowToast({ show: false, message: '', type: 'success' })
    }, 3000)
  }

  const handleToggle = async () => {
    try {
      const newStatus = status === 'open' ? 'closed' : 'open'
      
      // Use the context's toggleStatus function which handles the database update
      await toggleStatus()
      showToastMessage(`Canteen ${newStatus === 'open' ? 'opened' : 'closed'} successfully!`)
      
    } catch (error) {
      console.error('Toggle failed:', error)
      showToastMessage('Failed to update canteen status. Please try again.', 'error')
    }
  }

  const isOpen = status === 'open'

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingSpinner}></div>
        <span style={styles.loadingText}>Loading...</span>
      </div>
    )
  }

  return (
    <>
      <motion.button
        onClick={handleToggle}
        disabled={updating}
        style={{
          ...styles.toggleContainer,
          ...(isOpen ? styles.containerOpen : styles.containerClosed),
          ...(updating && styles.containerDisabled)
        }}
        whileHover={!updating ? { scale: 1.02 } : {}}
        whileTap={!updating ? { scale: 0.98 } : {}}
        transition={{ duration: 0.2 }}
      >
        {/* Icon */}
        <motion.div
          style={styles.iconWrapper}
          animate={{
            rotate: isOpen ? 0 : 180
          }}
          transition={{
            type: 'spring',
            stiffness: 200,
            damping: 20
          }}
        >
          {isOpen ? (
            <Utensils style={styles.icon} strokeWidth={2.5} />
          ) : (
            <UtensilsCrossed style={styles.icon} strokeWidth={2.5} />
          )}
        </motion.div>

        {/* Text Content */}
        <div style={styles.textContent}>
          <span style={styles.statusLabel}>Status</span>
          <span style={styles.statusText}>
            {isOpen ? 'Open' : 'Closed'}
          </span>
        </div>

        {/* Visual Indicator */}
        <motion.div
          style={{
            ...styles.indicator,
            ...(isOpen ? styles.indicatorOpen : styles.indicatorClosed)
          }}
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      </motion.button>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast.show && (
          <motion.div
            style={styles.toastContainer}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ duration: 0.3 }}
          >
            <div
              style={{
                ...styles.toast,
                ...(showToast.type === 'success' ? styles.toastSuccess : styles.toastError)
              }}
            >
              {showToast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
  },
  loadingSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #e5e7eb',
    borderTop: '2px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#6b7280',
  },
  toggleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 20px',
    border: '2px solid',
    borderRadius: '12px',
    background: 'white',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  containerOpen: {
    borderColor: '#10b981',
    background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
  },
  containerClosed: {
    borderColor: '#ef4444',
    background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
  },
  containerDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  iconWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'white',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
  },
  icon: {
    width: '24px',
    height: '24px',
    color: '#1f2937',
  },
  textContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
  },
  statusLabel: {
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6b7280',
  },
  statusText: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#111827',
    lineHeight: '1',
  },
  indicator: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    boxShadow: '0 0 10px',
  },
  indicatorOpen: {
    background: '#10b981',
    boxShadow: '0 0 10px rgba(16, 185, 129, 0.6)',
  },
  indicatorClosed: {
    background: '#ef4444',
    boxShadow: '0 0 10px rgba(239, 68, 68, 0.6)',
  },
  toastContainer: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: 9999,
  },
  toast: {
    padding: '16px 24px',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
  },
  toastSuccess: {
    background: 'linear-gradient(135deg, #10b981, #059669)',
  },
  toastError: {
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
  },
}

export default CanteenStatusToggleSwitch