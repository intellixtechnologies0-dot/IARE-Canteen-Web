import React, { useEffect, useRef } from 'react'

export default function QRScanner({ onScan, isEnabled = false }) {
  const scanBufferRef = useRef('')
  const scanTimeoutRef = useRef(null)
  const lastScanRef = useRef({ code: '', time: 0 })

  useEffect(() => {
    if (!isEnabled) return

    const handleKeyPress = (e) => {
      // Ignore if user is typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return
      }

      // Clear previous timeout
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
      }

      // Enter key indicates end of scan
      if (e.key === 'Enter' && scanBufferRef.current.length > 0) {
        const scannedText = scanBufferRef.current
        scanBufferRef.current = ''
        console.log('📱 QR Scanned:', scannedText)
        
        // Prevent duplicate scans
        const now = Date.now()
        if (lastScanRef.current.code === scannedText && (now - lastScanRef.current.time) < 2000) {
          console.log('⏭️ Duplicate scan ignored')
          return
        }
        
        lastScanRef.current = { code: scannedText, time: now }
        onScan(scannedText)
        e.preventDefault()
        return
      }

      // Build up scan buffer (QR scanners type very fast)
      if (e.key.length === 1) {
        scanBufferRef.current += e.key
      }

      // Auto-clear buffer after 100ms (QR scanners are faster than human typing)
      scanTimeoutRef.current = setTimeout(() => {
        scanBufferRef.current = ''
      }, 100)
    }

    window.addEventListener('keypress', handleKeyPress)
    
    return () => {
      window.removeEventListener('keypress', handleKeyPress)
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
      }
    }
  }, [isEnabled, onScan])

  // This component doesn't render anything visible
  return null
}

