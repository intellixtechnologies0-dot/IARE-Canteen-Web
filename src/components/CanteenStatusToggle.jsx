import React from 'react'
import { useCanteenStatus } from '../contexts/CanteenStatusContext'

const CanteenStatusToggle = () => {
  const { status, loading, updating, toggleStatus } = useCanteenStatus()

  const handleToggle = async () => {
    console.log('🔄 Toggle clicked! Current status:', status)
    try {
      await toggleStatus()
      console.log('✅ Toggle completed! New status should be:', status === 'open' ? 'closed' : 'open')
    } catch (error) {
      console.error('❌ Toggle failed:', error)
      alert('Failed to update canteen status. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="canteen-status-toggle loading">
        <div className="status-indicator">
          <div className="loading-spinner"></div>
        </div>
        <span className="status-text">Loading...</span>
      </div>
    )
  }

  return (
    <div className="canteen-status-toggle">
      <div className="status-indicator">
        <span className={`status-dot ${status}`}>
          {status === 'open' ? '🟢' : '🔴'}
        </span>
      </div>
      <div className="status-content">
        <span className="status-text">
          {status === 'open' ? 'Open' : 'Closed'}
        </span>
        <button
          className={`toggle-btn ${updating ? 'updating' : ''}`}
          onClick={handleToggle}
          disabled={updating}
        >
          {updating ? 'Updating...' : `Mark ${status === 'open' ? 'Closed' : 'Open'}`}
        </button>
      </div>
      
      <style jsx>{`
        .canteen-status-toggle {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.2s ease;
        }

        .canteen-status-toggle:hover {
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .status-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #f3f4f6;
        }

        .status-dot {
          font-size: 20px;
          animation: pulse 2s infinite;
        }

        .status-dot.open {
          animation: pulse-green 2s infinite;
        }

        .status-dot.closed {
          animation: pulse-red 2s infinite;
        }

        .status-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .status-text {
          font-weight: 600;
          font-size: 16px;
          color: #374151;
        }

        .toggle-btn {
          padding: 8px 16px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: white;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .toggle-btn:hover:not(:disabled) {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .toggle-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .toggle-btn.updating {
          background: #f3f4f6;
          color: #6b7280;
        }

        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #e5e7eb;
          border-top: 2px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        @keyframes pulse-green {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        @keyframes pulse-red {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .canteen-status-toggle {
            background: #1f2937;
            border-color: #374151;
            color: white;
          }

          .status-indicator {
            background: #374151;
          }

          .status-text {
            color: #f9fafb;
          }

          .toggle-btn {
            background: #374151;
            border-color: #4b5563;
            color: #f9fafb;
          }

          .toggle-btn:hover:not(:disabled) {
            background: #4b5563;
            border-color: #6b7280;
          }
        }

        /* Dark mode class-based styling */
        :global(.dark) .canteen-status-toggle {
          background: #1f2937 !important;
          border-color: #374151 !important;
          color: white !important;
        }

        :global(.dark) .status-indicator {
          background: #374151 !important;
        }

        :global(.dark) .status-text {
          color: #f9fafb !important;
        }

        :global(.dark) .toggle-btn {
          background: #374151 !important;
          border-color: #4b5563 !important;
          color: #f9fafb !important;
        }

        :global(.dark) .toggle-btn:hover:not(:disabled) {
          background: #4b5563 !important;
          border-color: #6b7280 !important;
        }
      `}</style>
    </div>
  )
}

export default CanteenStatusToggle
