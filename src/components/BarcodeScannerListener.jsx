import React, { useEffect, useRef } from 'react'

const BUFFER_RESET_MS = 120
const FLUSH_TIMEOUT_MS = 500

export default function BarcodeScannerListener({ onScan, isEnabled = false }) {
  const bufferRef = useRef('')
  const timeoutRef = useRef(null)
  const lastKeyTimeRef = useRef(0)

  useEffect(() => {
    if (!isEnabled) return

    const resetBuffer = () => {
      bufferRef.current = ''
    }

    const handleKeyPress = (event) => {
      if (!isEnabled) return

      const target = event.target
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        resetBuffer()
        return
      }

      const now = Date.now()
      const delta = now - (lastKeyTimeRef.current || 0)
      lastKeyTimeRef.current = now

      if (delta > BUFFER_RESET_MS) {
        resetBuffer()
      }

      if (event.key === 'Enter') {
        const payload = bufferRef.current.trim()
        resetBuffer()

        if (!payload) return

        console.log('🧾 Barcode scanned:', payload)
        onScan?.(payload)
        event.preventDefault()
        return
      }

      if (event.key.length === 1) {
        bufferRef.current += event.key
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(resetBuffer, FLUSH_TIMEOUT_MS)
      }
    }

    window.addEventListener('keydown', handleKeyPress)

    return () => {
      window.removeEventListener('keydown', handleKeyPress)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      resetBuffer()
    }
  }, [isEnabled, onScan])

  return null
}


