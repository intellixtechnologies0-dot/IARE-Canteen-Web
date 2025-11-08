import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Utensils, UtensilsCrossed } from 'lucide-react'
import { useCanteenStatus } from '../contexts/CanteenStatusContext'
import '../App.css'

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
      console.log('🔵 handleToggle - Current status:', status, 'New status:', newStatus)
      console.log('🔵 is_open value should be:', newStatus === 'open')
      
      // Use the context's toggleStatus function which handles the database update
      await toggleStatus()
      
      console.log('🔵 toggleStatus completed, showing toast')
      showToastMessage(`Canteen ${newStatus === 'open' ? 'opened' : 'closed'} successfully!`)
      
    } catch (error) {
      console.error('❌ Toggle failed:', error)
      showToastMessage('Failed to update canteen status. Please try again.', 'error')
    }
  }

  const isOpen = status === 'open'

  if (loading) {
    return (
      <div className="canteen-status-toggle-loading">
        <div className="spinner"></div>
        <span>Loading...</span>
      </div>
    )
  }

  return (
    <>
      <motion.button
        onClick={handleToggle}
        disabled={updating}
        className={`canteen-status-toggle ${isOpen ? 'open' : 'closed'} ${updating ? 'disabled' : ''}`}
        whileHover={!updating ? { scale: 1.05 } : {}}
        whileTap={!updating ? { scale: 0.95 } : {}}
        transition={{ duration: 0.2 }}
      >
        {/* Icon */}
        <motion.div
          className="icon-wrapper"
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
            <Utensils strokeWidth={2.5} />
          ) : (
            <UtensilsCrossed strokeWidth={2.5} />
          )}
        </motion.div>

        {/* Text Content */}
        <div className="text-content">
          <span className="status-label">Status</span>
          <span className="status-text">
            {isOpen ? 'Open' : 'Closed'}
          </span>
        </div>

        {/* Visual Indicator */}
        <motion.div
          className={`indicator ${isOpen ? 'open' : 'closed'}`}
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
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              zIndex: 9999
            }}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ duration: 0.3 }}
          >
            <div
              style={{
                padding: '16px 24px',
                borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                background: showToast.type === 'success' 
                  ? 'linear-gradient(135deg, #10b981, #059669)' 
                  : 'linear-gradient(135deg, #ef4444, #dc2626)'
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

export default CanteenStatusToggleSwitch