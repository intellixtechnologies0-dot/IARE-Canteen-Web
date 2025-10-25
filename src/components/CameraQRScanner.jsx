import React, { useRef, useEffect, useState } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Camera, CameraOff } from 'lucide-react'

export default function CameraQRScanner({ onScan, onClose, isOpen }) {
  const videoRef = useRef(null)
  const codeReaderRef = useRef(null)
  const controlsRef = useRef(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

  const startScanning = async () => {
    try {
      setError(null)
      
      // Check camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment' // Use back camera for QR scanning
        } 
      })
      
      setPermissionGranted(true)
      const reader = new BrowserQRCodeReader()
      codeReaderRef.current = reader
      setScanning(true)

      await reader.decodeFromVideoDevice(null, videoRef.current, async (result, err, controls) => {
        try {
          if (controls && !controlsRef.current) controlsRef.current = controls
        } catch (_) {}
        
        if (result) {
          const text = String(result.getText() || '')
          if (text) {
            console.log('📱 Camera scanned QR:', text)
            onScan(text)
            stopScanning()
          }
        }
        
        if (err && err.name === 'NotFoundException') {
          // Keep scanning silently
        }
      })
    } catch (e) {
      console.error('Camera error:', e)
      setError(e.message || 'Camera access denied')
      setPermissionGranted(false)
    }
  }

  const stopScanning = async () => {
    try {
      // Immediately hide scanning UI elements (like the overlay)
      setScanning(false)

      if (controlsRef.current) {
        controlsRef.current.stop()
        controlsRef.current = null
      }
      
      if (codeReaderRef.current) {
        await codeReaderRef.current.reset()
        codeReaderRef.current = null
      }
      
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks()
        tracks.forEach(track => track.stop())
        videoRef.current.srcObject = null
      }
      // scanning already set to false at start
    } catch (e) {
      console.error('Error stopping camera:', e)
    }
  }

  useEffect(() => {
    if (isOpen) {
      startScanning()
    } else {
      stopScanning()
    }
    
    return () => {
      stopScanning()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <AnimatePresence>
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
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {/* Camera Scanner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '20px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
              📱 Scan Student's QR Code
            </h3>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                color: '#6b7280'
              }}
            >
              <X size={24} />
            </button>
          </div>

          {/* Camera Feed */}
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <video 
              ref={videoRef} 
              style={{ 
                width: '100%', 
                maxHeight: 300,
                background: '#000', 
                borderRadius: '12px',
                display: scanning ? 'block' : 'none'
              }} 
              muted 
              playsInline 
            />
            
            {!scanning && !error && (
              <div style={{
                width: '100%',
                height: '300px',
                background: '#1f2937',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                gap: '12px'
              }}>
                <Camera size={48} />
                <div>Starting camera...</div>
              </div>
            )}

            {error && (
              <div style={{
                width: '100%',
                minHeight: '300px',
                background: '#fee2e2',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#991b1b',
                gap: '12px',
                padding: '20px',
                boxSizing: 'border-box'
              }}>
                <CameraOff size={48} />
                <div style={{ 
                  textAlign: 'center',
                  width: '100%',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word'
                }}>
                  <div style={{ 
                    fontWeight: '600', 
                    marginBottom: '8px',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word'
                  }}>Camera Error</div>
                  <div style={{ 
                    fontSize: '14px',
                    lineHeight: '1.4',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    maxWidth: '100%'
                  }}>{error}</div>
                </div>
              </div>
            )}

            {/* Scanning Overlay */}
            {scanning && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '200px',
                height: '200px',
                border: '3px solid #3b82f6',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '600',
                  textAlign: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  padding: '8px 16px',
                  borderRadius: '8px'
                }}>
                  📱 Point at QR Code
                </div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div style={{
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            padding: '16px',
            fontSize: '14px',
            color: '#374151'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px' }}>Instructions:</div>
            <div>1. Ask student to show their QR code on their phone</div>
            <div>2. Point camera at the QR code</div>
            <div>3. QR code will be scanned automatically</div>
            <div>4. Order details will appear in a popup</div>
          </div>

          {/* Controls */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginTop: '20px'
          }}>
            <button
              onClick={scanning ? stopScanning : startScanning}
              style={{
                flex: 1,
                padding: '12px 16px',
                backgroundColor: scanning ? '#dc2626' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              {scanning ? <CameraOff size={16} /> : <Camera size={16} />}
              {scanning ? 'Stop Camera' : 'Start Camera'}
            </button>
            
            <button
              onClick={onClose}
              style={{
                padding: '12px 16px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
