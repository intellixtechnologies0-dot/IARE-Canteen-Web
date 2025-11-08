import React, { createContext, useContext, useState, useEffect } from 'react'
import supabase from '../lib/supabaseClient'

const CanteenStatusContext = createContext()

export const useCanteenStatus = () => {
  const context = useContext(CanteenStatusContext)
  if (!context) {
    throw new Error('useCanteenStatus must be used within a CanteenStatusProvider')
  }
  return context
}

export const CanteenStatusProvider = ({ children }) => {
  const [status, setStatus] = useState('closed')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [lastUpdateTime, setLastUpdateTime] = useState(null)

  // Fetch current status on mount
  useEffect(() => {
    fetchCanteenStatus()
    
    // Real-time subscription temporarily disabled to fix UI revert issue
    // const channel = supabase
    //   .channel('canteen_status_changes')
    //   .on('postgres_changes', 
    //     { 
    //       event: 'UPDATE', 
    //       schema: 'public', 
    //       table: 'canteen_status' 
    //     }, 
    //     (payload) => {
    //       console.log('🔄 Real-time update received:', payload.new.is_open)
    //       const newStatus = payload.new.is_open ? 'open' : 'closed'
    //       console.log('📡 Real-time update: setting status to', newStatus)
    //       setStatus(newStatus)
    //     }
    //   )
    //   .subscribe((status) => {
    //     console.log('📡 Real-time subscription status:', status)
    //   })

    // return () => {
    //   supabase.removeChannel(channel)
    // }
  }, [])

  const fetchCanteenStatus = async (force = false) => {
    // Don't fetch if we just updated recently (within 2 seconds)
    if (!force && lastUpdateTime && (Date.now() - lastUpdateTime) < 2000) {
      console.log('⏭️ Skipping fetch - recent update detected')
      return
    }
    
    console.log('🔍 Fetching canteen status from database...')
    try {
      const { data, error } = await supabase
        .from('canteen_status')
        .select('is_open, updated_at')
        .eq('id', 1)
        .single()

      if (error) {
        console.error('❌ Error fetching canteen status:', error)
        throw error
      }
      
      const fetchedStatus = data?.is_open ? 'open' : 'closed'
      console.log('📊 Fetched status from database:', fetchedStatus)
      console.log('📊 Raw data:', data)
      console.log('📊 is_open value:', data?.is_open, 'type:', typeof data?.is_open)
      setStatus(fetchedStatus)
    } catch (error) {
      console.error('❌ Error fetching canteen status:', error)
      setStatus('closed') // Default to closed on error
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (newStatus) => {
    console.log('🔄 updateStatus called! New status:', newStatus)
    setUpdating(true)
    const previousStatus = status
    
    // Optimistic update - update UI immediately
    console.log('📝 Setting optimistic status to:', newStatus)
    setStatus(newStatus)
    setLastUpdateTime(Date.now())
    
    try {
      console.log(`💾 Updating database: is_open = ${newStatus === 'open'}`)
      
      // First, let's check if the table exists and what data is in it
      console.log('🔍 Checking current database state...')
      const { data: currentData, error: currentError } = await supabase
        .from('canteen_status')
        .select('*')
        .eq('id', 1)
        .single()
      
      if (currentError) {
        console.error('❌ Error fetching current data:', currentError)
        throw new Error(`Cannot fetch current data: ${currentError.message}`)
      }
      
      console.log('📊 Current database data:', currentData)
      
      // Now try to update
      console.log(`🔄 Attempting to update is_open to: ${newStatus === 'open'}`)
      const { data: updateData, error } = await supabase
        .from('canteen_status')
        .update({ 
          is_open: newStatus === 'open',
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
        .select()

      if (error) {
        console.error('❌ Database update error:', error)
        console.error('❌ Full error details:', JSON.stringify(error, null, 2))
        throw error
      }
      
      console.log(`✅ Database update response:`, updateData)
      console.log(`✅ Database update response length:`, updateData?.length)
      if (updateData && updateData.length > 0) {
        console.log(`✅ Updated row data:`, updateData[0])
        console.log(`✅ Updated is_open value:`, updateData[0].is_open)
      } else {
        console.warn('⚠️ Update response is empty - this might indicate the update failed')
      }
      console.log(`✅ Database updated successfully! is_open = ${newStatus === 'open'}`)
      
      // Verify the update
      const { data: verifyData, error: verifyError } = await supabase
        .from('canteen_status')
        .select('is_open')
        .eq('id', 1)
        .single()
      
      if (verifyError) {
        console.warn('Could not verify database update:', verifyError)
      } else {
        console.log(`🔍 Database verification: is_open = ${verifyData.is_open}`)
      }
      
      // Don't double-check immediately as it can cause UI reversion
      // The optimistic update should be sufficient
      console.log('✅ Update completed successfully - UI should reflect the change')
      
    } catch (error) {
      console.error('❌ Error updating canteen status:', error)
      // Revert optimistic update on error
      console.log('🔄 Reverting to previous status:', previousStatus)
      setStatus(previousStatus)
      throw error
    } finally {
      setUpdating(false)
    }
  }

  const toggleStatus = async () => {
    const newStatus = status === 'open' ? 'closed' : 'open'
    console.log('🔄 toggleStatus called! Current:', status, 'New:', newStatus)
    await updateStatus(newStatus)
  }

  const isOpen = status === 'open'
  const isClosed = status === 'closed'

  const refreshStatus = async () => {
    console.log('🔄 Manual refresh requested')
    setLoading(true)
    await fetchCanteenStatus(true) // Force refresh
  }

  const value = {
    status,
    loading,
    updating,
    isOpen,
    isClosed,
    updateStatus,
    toggleStatus,
    fetchCanteenStatus,
    refreshStatus
  }

  return (
    <CanteenStatusContext.Provider value={value}>
      {children}
    </CanteenStatusContext.Provider>
  )
}
