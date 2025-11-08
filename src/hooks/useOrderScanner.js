import { useState, useCallback, useRef } from 'react'
import supabase from '../lib/supabaseClient'

const DUPLICATE_SCAN_WINDOW_MS = 2000

const normalizeScannedValue = (value) => {
  if (!value) return null
  const cleaned = String(value).trim()
  if (!cleaned) return null

  // Direct barcode / token value
  if (!cleaned.includes('://')) {
    return cleaned
  }

  // Handle URLs produced by legacy QR codes
  try {
    const url = new URL(cleaned)
    const params = url.searchParams
    const code =
      params.get('order_token') ||
      params.get('token') ||
      params.get('qr_code') ||
      params.get('order_qr_code') ||
      params.get('code')

    return code ? code.trim() : cleaned
  } catch (_) {
    return cleaned
  }
}

const getFallbackQrValue = (value) => {
  if (!value) return null
  const cleaned = String(value).trim()
  if (!cleaned) return null

  // Legacy QR codes stored without prefixes; just return cleaned value
  if (!cleaned.startsWith('ORD-')) return cleaned
  return cleaned.substring(4)
}

export function useOrderScanner() {
  const [scannedOrder, setScannedOrder] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanMessage, setScanMessage] = useState('')
  const [lastScannedCode, setLastScannedCode] = useState(null)

  const duplicateRef = useRef({ code: '', timestamp: 0 })

  const fetchOrder = useCallback(async (code) => {
    if (!code) return null

    try {
      console.log('🔍 Fetching order for scanned code:', code)

      // Primary lookup: order_token (barcode stores token directly)
      let { data, error } = await supabase
        .from('orders')
        .select('id,item_name,qr_code,order_token,created_at,status,total_amount,user_id,order_type')
        .eq('order_token', code)
        .limit(1)
        .maybeSingle()

      if ((!data || error) && !error?.message?.includes('No rows')) {
        console.log('🔁 Token lookup failed, trying qr_code fallback...')
        const fallbackCode = getFallbackQrValue(code)

        const fallbackResult = await supabase
          .from('orders')
          .select('id,item_name,qr_code,order_token,created_at,status,total_amount,user_id,order_type')
          .eq('qr_code', fallbackCode)
          .limit(1)
          .maybeSingle()

        if (!fallbackResult.error && fallbackResult.data) {
          data = fallbackResult.data
          error = null
        } else if (fallbackResult.error && !fallbackResult.error?.message?.includes('No rows')) {
          error = fallbackResult.error
        }
      }

      if (error) {
        console.error('❌ Order lookup failed:', error)
        throw error
      }

      if (!data) {
        console.log('❌ No order matched scanned code:', code)
        return null
      }

      console.log('✅ Matched order:', data)
      return data
    } catch (err) {
      console.error('❌ Unexpected error fetching order:', err)
      return null
    }
  }, [])

  const processScan = useCallback(
    async (rawValue) => {
      const normalized = normalizeScannedValue(rawValue)

      if (!normalized) {
        console.log('⚠️ Ignoring empty scan payload')
        setScanMessage('Invalid barcode')
        setTimeout(() => setScanMessage(''), 2000)
        return
      }

      const now = Date.now()
      if (
        duplicateRef.current.code === normalized &&
        now - duplicateRef.current.timestamp < DUPLICATE_SCAN_WINDOW_MS
      ) {
        console.log('⏭️ Duplicate scan ignored:', normalized)
        return
      }

      duplicateRef.current = { code: normalized, timestamp: now }
      setLastScannedCode(normalized)

      if (isProcessing || scannedOrder) {
        console.log('⏳ Scanner busy, ignoring new input')
        setScanMessage('Finish current order first')
        setTimeout(() => setScanMessage(''), 1500)
        return
      }

      setIsProcessing(true)
      const order = await fetchOrder(normalized)

      if (order) {
        setScannedOrder(order)
        setScanMessage('✅ Order located')
        setTimeout(() => setScanMessage(''), 2000)
      } else {
        setScannedOrder(null)
        setScanMessage('❌ Order not found')
        setTimeout(() => setScanMessage(''), 2000)
      }

      setIsProcessing(false)
    },
    [fetchOrder, isProcessing, scannedOrder]
  )

  const closeModal = useCallback(() => {
    setScannedOrder(null)
    setScanMessage('')
  }, [])

  return {
    scannedOrder,
    isProcessing,
    scanMessage,
    closeModal,
    processScan,
    lastScannedCode,
  }
}


