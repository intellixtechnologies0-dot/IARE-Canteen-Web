import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RotateCcw, Loader, AlertCircle, CheckCircle } from 'lucide-react'
import supabase from '../lib/supabaseClient'

const RemovedItemsPanel = ({ isOpen, onClose, onItemRestored }) => {
  const [removedItems, setRemovedItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [restoringItems, setRestoringItems] = useState(new Set())
  const [toastMessage, setToastMessage] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null) // { itemId, itemName }
  const [confirmRestore, setConfirmRestore] = useState(null) // { itemId, itemName }

  // Fetch removed items from food_items table where is_active = false
  const fetchRemovedItems = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('food_items')
        .select('*')
        .eq('is_active', false)
        .order('name')

      if (error) {
        console.error('Error fetching removed items:', error)
        showToastMessage('Failed to load removed items', 'error')
        return
      }

      setRemovedItems(data || [])
    } catch (error) {
      console.error('Error fetching removed items:', error)
      showToastMessage('Failed to load removed items', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Show restore confirmation dialog
  const showRestoreConfirmation = (itemId, itemName) => {
    setConfirmRestore({ itemId, itemName })
  }

  // Add back an item (restore it)
  const addBackItem = async (itemId, itemName) => {
    try {
      setRestoringItems(prev => new Set([...prev, itemId]))
      setConfirmRestore(null) // Close confirmation modal

      const { error } = await supabase
        .from('food_items')
        .update({
          is_active: true
        })
        .eq('id', itemId)

      if (error) {
        console.error('Error restoring item:', error)
        showToastMessage(`Failed to restore ${itemName}`, 'error')
        return
      }

      showToastMessage(`${itemName} has been restored successfully!`, 'success')
      
      // Refresh the removed items list
      await fetchRemovedItems()
      
      // Notify parent component to refresh main inventory
      if (onItemRestored) {
        onItemRestored()
      }

    } catch (error) {
      console.error('Error restoring item:', error)
      showToastMessage(`Failed to restore ${itemName}`, 'error')
    } finally {
      setRestoringItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }
  }

  // Show confirmation dialog
  const showDeleteConfirmation = (itemId, itemName) => {
    setConfirmDelete({ itemId, itemName })
  }

  // Permanently delete an item from database
  const permanentlyDeleteItem = async (itemId, itemName) => {
    try {
      setRestoringItems(prev => new Set([...prev, itemId]))
      setConfirmDelete(null) // Close confirmation modal

      const { error } = await supabase
        .from('food_items')
        .delete()
        .eq('id', itemId)

      if (error) {
        console.error('Error permanently deleting item:', error)
        showToastMessage(`Failed to delete ${itemName}`, 'error')
        return
      }

      showToastMessage(`${itemName} has been permanently deleted`, 'success')
      
      // Refresh the removed items list
      await fetchRemovedItems()
      
      // Notify parent component to refresh main inventory
      if (onItemRestored) {
        onItemRestored()
      }

    } catch (error) {
      console.error('Error permanently deleting item:', error)
      showToastMessage(`Failed to delete ${itemName}`, 'error')
    } finally {
      setRestoringItems(prev => {
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

  // Fetch data when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchRemovedItems()
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              height: '100vh',
              width: '400px',
              backgroundColor: '#ffffff',
              boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              opacity: 1
            }}
            className="dark:!bg-gray-800"
          >
            {/* Header */}
            <div 
              className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:!bg-gray-900"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '24px',
                backgroundColor: '#f9fafb'
              }}
            >
              <div>
                <h2 
                  className="dark:!text-white"
                  style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    margin: 0,
                    color: '#111827'
                  }}
                >
                  Removed Items
                </h2>
                <p 
                  className="dark:!text-gray-300"
                  style={{
                    fontSize: '14px',
                    marginTop: '4px',
                    color: '#6b7280'
                  }}
                >
                  {removedItems.length} item{removedItems.length !== 1 ? 's' : ''} removed
                </p>
              </div>
              <button
                onClick={onClose}
                className="hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                style={{
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  background: 'transparent'
                }}
              >
                <X size={20} className="dark:!text-gray-300" style={{ color: '#6b7280' }} />
              </button>
            </div>

            {/* Content */}
            <div 
              className="bg-white dark:!bg-gray-800"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
                backgroundColor: '#ffffff'
              }}
            >
              {loading ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '48px 0'
                }}>
                  <Loader style={{ width: '32px', height: '32px', color: '#3b82f6' }} className="animate-spin" />
                  <span className="dark:!text-gray-300" style={{
                    marginLeft: '12px',
                    color: '#6b7280'
                  }}>
                    Loading removed items...
                  </span>
                </div>
              ) : removedItems.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '48px 0'
                }}>
                  <div className="dark:!text-gray-400" style={{ marginBottom: '16px', color: '#9ca3af' }}>
                    <AlertCircle size={48} style={{ margin: '0 auto' }} />
                  </div>
                  <h3 
                    className="dark:!text-white"
                    style={{
                      fontSize: '18px',
                      fontWeight: '500',
                      marginBottom: '8px',
                      color: '#111827'
                    }}
                  >
                    No Removed Items
                  </h3>
                  <p className="dark:!text-gray-300" style={{ color: '#6b7280' }}>
                    All items are currently active in your inventory.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {removedItems.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="bg-gray-50 dark:!bg-gray-700 border border-gray-200 dark:border-gray-600"
                      style={{
                        borderRadius: '12px',
                        padding: '16px',
                        backgroundColor: '#f9fafb'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <h4 
                            className="dark:!text-white"
                            style={{
                              fontWeight: '500',
                              marginBottom: '4px',
                              color: '#111827'
                            }}
                          >
                            {item.name}
                          </h4>
                          <p 
                            className="dark:!text-gray-300"
                            style={{
                              fontSize: '14px',
                              marginTop: '4px',
                              color: '#6b7280'
                            }}
                          >
                            Price: ₹{item.price || item.cost || 'N/A'}
                          </p>
                          {item.description && (
                            <p 
                              className="dark:!text-gray-400"
                              style={{
                                fontSize: '12px',
                                marginTop: '4px',
                                color: '#9ca3af'
                              }}
                            >
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => showRestoreConfirmation(item.id, item.name)}
                            disabled={restoringItems.has(item.id)}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              backgroundColor: restoringItems.has(item.id) ? '#d1d5db' : '#10b981',
                              color: '#ffffff',
                              fontSize: '14px',
                              borderRadius: '8px',
                              border: 'none',
                              cursor: restoringItems.has(item.id) ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              fontWeight: '500'
                            }}
                            onMouseEnter={(e) => {
                              if (!restoringItems.has(item.id)) {
                                e.currentTarget.style.backgroundColor = '#059669'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!restoringItems.has(item.id)) {
                                e.currentTarget.style.backgroundColor = '#10b981'
                              }
                            }}
                          >
                            {restoringItems.has(item.id) ? (
                              <Loader size={16} className="animate-spin" style={{ color: '#ffffff' }} />
                            ) : (
                              <RotateCcw size={16} style={{ color: '#ffffff' }} />
                            )}
                            <span style={{ color: '#ffffff' }}>
                              {restoringItems.has(item.id) ? 'Restoring...' : 'Add Back'}
                            </span>
                          </button>
                          <button
                            onClick={() => showDeleteConfirmation(item.id, item.name)}
                            disabled={restoringItems.has(item.id)}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              backgroundColor: restoringItems.has(item.id) ? '#d1d5db' : '#ef4444',
                              color: '#ffffff',
                              fontSize: '14px',
                              borderRadius: '8px',
                              border: 'none',
                              cursor: restoringItems.has(item.id) ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              fontWeight: '500'
                            }}
                            onMouseEnter={(e) => {
                              if (!restoringItems.has(item.id)) {
                                e.currentTarget.style.backgroundColor = '#dc2626'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!restoringItems.has(item.id)) {
                                e.currentTarget.style.backgroundColor = '#ef4444'
                              }
                            }}
                          >
                            <X size={16} style={{ color: '#ffffff' }} />
                            <span style={{ color: '#ffffff' }}>Delete</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div 
              className="border-t border-gray-200 dark:border-gray-700 bg-white dark:!bg-gray-800"
              style={{
                padding: '24px',
                backgroundColor: '#ffffff'
              }}
            >
              <button
                onClick={fetchRemovedItems}
                disabled={loading}
                className="bg-gray-100 hover:bg-gray-200 dark:!bg-gray-700 dark:hover:!bg-gray-600 dark:!text-gray-200 transition-colors"
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}
              >
                <RotateCcw size={16} className={`${loading ? 'animate-spin' : ''} dark:!text-gray-200`} style={{ color: '#374151' }} />
                <span style={{ color: '#374151' }} className="dark:!text-gray-200">Refresh List</span>
              </button>
            </div>
          </motion.div>

          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {confirmDelete && (
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setConfirmDelete(null)}
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    zIndex: 99998,
                    backdropFilter: 'blur(4px)'
                  }}
                />
                
                {/* Confirmation Dialog */}
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
                    zIndex: 99999,
                    maxWidth: '450px',
                    width: '90%',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                  }}
                  className="dark:!bg-gray-800"
                >
                  {/* Header */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    marginBottom: '16px'
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: '#fee2e2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '16px'
                    }}>
                      <AlertCircle size={24} style={{ color: '#dc2626' }} />
                    </div>
                    <div>
                      <h3 
                        className="dark:!text-white"
                        style={{ 
                          margin: 0, 
                          fontSize: '18px', 
                          fontWeight: '600', 
                          color: '#111827' 
                        }}
                      >
                        Permanently Delete Item?
                      </h3>
                    </div>
                  </div>

                  {/* Message */}
                  <p 
                    className="dark:!text-gray-300"
                    style={{ 
                      margin: '0 0 24px 0',
                      fontSize: '14px',
                      color: '#6b7280',
                      lineHeight: '1.5'
                    }}
                  >
                    Are you sure you want to permanently delete <strong style={{ color: '#111827' }} className="dark:!text-white">"{confirmDelete.itemName}"</strong>? 
                    This action cannot be undone and the item will be removed from the database.
                  </p>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      className="dark:!bg-gray-700 dark:!text-gray-200"
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#e5e7eb'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = '#f3f4f6'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => permanentlyDeleteItem(confirmDelete.itemId, confirmDelete.itemName)}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#b91c1c'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = '#dc2626'
                      }}
                    >
                      <X size={16} />
                      Delete Permanently
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Restore Confirmation Modal */}
          <AnimatePresence>
            {confirmRestore && (
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setConfirmRestore(null)}
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    zIndex: 99998,
                    backdropFilter: 'blur(4px)'
                  }}
                />
                
                {/* Confirmation Dialog */}
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
                    zIndex: 99999,
                    maxWidth: '450px',
                    width: '90%',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                  }}
                  className="dark:!bg-gray-800"
                >
                  {/* Header */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    marginBottom: '16px'
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: '#d1fae5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '16px'
                    }}>
                      <RotateCcw size={24} style={{ color: '#059669' }} />
                    </div>
                    <div>
                      <h3 
                        className="dark:!text-white"
                        style={{ 
                          margin: 0, 
                          fontSize: '18px', 
                          fontWeight: '600', 
                          color: '#111827' 
                        }}
                      >
                        Restore Item?
                      </h3>
                    </div>
                  </div>

                  {/* Message */}
                  <p 
                    className="dark:!text-gray-300"
                    style={{ 
                      margin: '0 0 24px 0',
                      fontSize: '14px',
                      color: '#6b7280',
                      lineHeight: '1.5'
                    }}
                  >
                    Are you sure you want to restore <strong style={{ color: '#111827' }} className="dark:!text-white">"{confirmRestore.itemName}"</strong> back to the active inventory? 
                    This item will be available for ordering again.
                  </p>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setConfirmRestore(null)}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      className="dark:!bg-gray-700 dark:!text-gray-200"
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#e5e7eb'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = '#f3f4f6'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => addBackItem(confirmRestore.itemId, confirmRestore.itemName)}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#059669'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = '#10b981'
                      }}
                    >
                      <RotateCcw size={16} />
                      Restore Item
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Toast Message */}
          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                style={{
                  position: 'fixed',
                  bottom: '20px',
                  right: '20px',
                  padding: '16px',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
                  zIndex: 9999,
                  backgroundColor: toastMessage.type === 'success' ? '#10b981' : '#ef4444',
                  color: 'white'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {toastMessage.type === 'success' ? (
                    <CheckCircle style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                  ) : (
                    <AlertCircle style={{ width: '20px', height: '20px', marginRight: '8px' }} />
                  )}
                  {toastMessage.message}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  )
}

export default RemovedItemsPanel

