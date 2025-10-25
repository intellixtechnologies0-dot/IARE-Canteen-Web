import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react'

// START IMAGE UPLOAD
const ImageUpload = ({ 
  value, 
  onChange, 
  disabled = false, 
  maxSize = 10 * 1024 * 1024, // 10MB default
  acceptedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  className = ''
}) => {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (disabled) return
    
    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFile(files[0])
    }
  }

  const handleFileSelect = (e) => {
    if (disabled) return
    
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  const handleFile = (file) => {
    setError('')
    
    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      setError(`Invalid file type. Allowed types: ${acceptedTypes.join(', ')}`)
      return
    }
    
    // Validate file size
    if (file.size > maxSize) {
      setError(`File too large. Maximum size is ${(maxSize / 1024 / 1024).toFixed(1)}MB`)
      return
    }
    
    onChange(file)
  }

  const removeFile = () => {
    onChange(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className={`image-upload-container ${className}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      {/* Upload Area */}
      <div
        className={`upload-area ${dragActive ? 'drag-active' : ''} ${disabled ? 'disabled' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        {value ? (
          // File Selected State
          <div className="file-selected">
            <div className="file-preview">
              <img
                src={URL.createObjectURL(value)}
                alt="Preview"
                className="preview-image"
              />
            </div>
            <div className="file-info">
              <div className="file-name">{value.name}</div>
              <div className="file-size">{formatFileSize(value.size)}</div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeFile()
              }}
              className="remove-file-btn"
              disabled={disabled}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          // Empty State
          <div className="upload-empty">
            <div className="upload-icon">
              <ImageIcon size={32} />
            </div>
            <div className="upload-text">
              <div className="upload-title">
                {dragActive ? 'Drop image here' : 'Click or drag to upload'}
              </div>
              <div className="upload-subtitle">
                Supports: JPG, PNG, GIF, WebP (max {formatFileSize(maxSize)})
              </div>
            </div>
            <Upload size={20} className="upload-arrow" />
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="upload-error"
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </motion.div>
      )}
    </div>
  )
}
// END IMAGE UPLOAD

export default ImageUpload

