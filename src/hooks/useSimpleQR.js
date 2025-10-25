import { useState, useEffect, useCallback, useRef } from 'react'
import supabase from '../lib/supabaseClient'
import { useSoundNotification } from './useSoundNotification'

export function useSimpleQR() {
  const [scannedOrder, setScannedOrder] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanMessage, setScanMessage] = useState('')
  const { playNotification } = useSoundNotification()
  
  // QR scanner input buffer
  const scanBufferRef = useRef('')
  const scanTimeoutRef = useRef(null)
  const lastScanRef = useRef({ code: '', time: 0 })

  // Parse scanned text to extract QR code
  const parseScannedCode = useCallback((text) => {
    if (!text) return null
    const cleaned = String(text).trim()
    
    // Direct QR code (any format)
    if (cleaned) {
      return cleaned
    }
    
    // If it's a URL, try to extract from parameters
    try {
      const url = new URL(cleaned)
      const params = url.searchParams
      const code = params.get('qr_code') || params.get('order_qr_code') || params.get('code')
      if (code) {
        return code
      }
    } catch (_) { /* not a URL */ }
    
    return null
  }, [])

  // Fetch order from Supabase using QR code
  const fetchOrder = useCallback(async (qrCode) => {
    try {
      console.log('🔍 Fetching order for QR code:', qrCode)
      
      const { data, error } = await supabase
        .from('orders')
        .select('id,item_name,qr_code,order_token,created_at,status,total_amount,user_id,order_type')
        .eq('qr_code', qrCode)
        .limit(1)
        .maybeSingle()
      
      if (error) {
        console.error('Error fetching order:', error)
        throw error
      }
      
      if (data && data.qr_code === qrCode) {
        console.log('✅ Order found:', data)
        return data
      }

      console.log('❌ No order found for QR code:', qrCode)
      return null
    } catch (e) {
      console.error('Failed to fetch order:', e)
      return null
    }
  }, [])

  // Process scanned QR code
  const processQRCode = useCallback(async (scannedText) => {
    // Prevent duplicate scans
    const now = Date.now()
    if (lastScanRef.current.code === scannedText && (now - lastScanRef.current.time) < 2000) {
      console.log('⏭️ Duplicate scan ignored')
      return
    }

    lastScanRef.current = { code: scannedText, time: now }

    const qrCode = parseScannedCode(scannedText)
    if (!qrCode) {
      console.log('❌ Invalid QR code format')
      setScanMessage('Invalid QR code')
      setTimeout(() => setScanMessage(''), 2000)
      return
    }

    // If already processing, ignore new scan
    if (isProcessing || scannedOrder) {
      console.log('📋 Already processing an order, ignoring new scan')
      setScanMessage('Please complete current order first')
      setTimeout(() => setScanMessage(''), 2000)
      return
    }

    setIsProcessing(true)
    const order = await fetchOrder(qrCode)
    
    if (order) {
      setScannedOrder(order)
      setScanMessage('✅ Order scanned successfully')
      
      // Play success sound
      try {
        await playNotification()
      } catch (e) {
        console.log('Sound failed:', e)
      }
      
      setTimeout(() => setScanMessage(''), 2000)
    } else {
      setScanMessage('❌ Order not found')
      setTimeout(() => setScanMessage(''), 2000)
    }
    
    setIsProcessing(false)
  }, [scannedOrder, isProcessing, parseScannedCode, fetchOrder, playNotification])

  // Close modal
  const closeModal = useCallback(() => {
    setScannedOrder(null)
    setScanMessage('')
  }, [])

  // Manual trigger for testing or camera-based scanning
  const scanQRCode = useCallback((code) => {
    processQRCode(code)
  }, [processQRCode])

  return {
    scannedOrder,
    isProcessing,
    scanMessage,
    closeModal,
    scanQRCode,
    processQRCode
  }
}
