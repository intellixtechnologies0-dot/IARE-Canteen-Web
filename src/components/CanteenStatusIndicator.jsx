import React from 'react'
import { useCanteenStatus } from '../contexts/CanteenStatusContext'

const CanteenStatusIndicator = ({ showText = true, size = 'medium' }) => {
  const { status, loading } = useCanteenStatus()

  if (loading) {
    return (
      <div className={`canteen-status-indicator loading ${size}`}>
        <div className="status-dot loading"></div>
        {showText && <span className="status-text">Loading...</span>}
      </div>
    )
  }

  const isOpen = status === 'open'
  
  return (
    <div className={`canteen-status-indicator ${size} ${isOpen ? 'open' : 'closed'}`}>
      <div className="status-dot">
        {isOpen ? '🟢' : '🔴'}
      </div>
      {showText && (
        <span className="status-text">
          {isOpen ? 'Open' : 'Closed'}
        </span>
      )}
      
      <style jsx>{`
        .canteen-status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.2s ease;
        }

        .canteen-status-indicator.open {
          background: #f0fdf4;
          border-color: #22c55e;
        }

        .canteen-status-indicator.closed {
          background: #fef2f2;
          border-color: #ef4444;
        }

        .canteen-status-indicator.loading {
          background: #f9fafb;
          border-color: #d1d5db;
        }

        .status-dot {
          font-size: 16px;
          animation: pulse 2s infinite;
        }

        .status-dot.loading {
          width: 16px;
          height: 16px;
          border: 2px solid #e5e7eb;
          border-top: 2px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .status-text {
          font-weight: 600;
          font-size: 14px;
          color: #374151;
        }

        .canteen-status-indicator.open .status-text {
          color: #16a34a;
        }

        .canteen-status-indicator.closed .status-text {
          color: #dc2626;
        }

        .canteen-status-indicator.loading .status-text {
          color: #6b7280;
        }

        /* Size variants */
        .canteen-status-indicator.small {
          padding: 4px 8px;
          gap: 6px;
        }

        .canteen-status-indicator.small .status-dot {
          font-size: 12px;
        }

        .canteen-status-indicator.small .status-text {
          font-size: 12px;
        }

        .canteen-status-indicator.large {
          padding: 12px 16px;
          gap: 10px;
        }

        .canteen-status-indicator.large .status-dot {
          font-size: 20px;
        }

        .canteen-status-indicator.large .status-text {
          font-size: 16px;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .canteen-status-indicator {
            background: #1f2937;
            border-color: #374151;
          }

          .canteen-status-indicator.open {
            background: #064e3b;
            border-color: #10b981;
          }

          .canteen-status-indicator.closed {
            background: #7f1d1d;
            border-color: #ef4444;
          }

          .canteen-status-indicator.loading {
            background: #374151;
            border-color: #4b5563;
          }

          .status-text {
            color: #f9fafb;
          }

          .canteen-status-indicator.open .status-text {
            color: #34d399;
          }

          .canteen-status-indicator.closed .status-text {
            color: #fca5a5;
          }

          .canteen-status-indicator.loading .status-text {
            color: #9ca3af;
          }
        }

        /* Dark mode class-based styling */
        :global(.dark) .canteen-status-indicator {
          background: #1f2937 !important;
          border-color: #374151 !important;
        }

        :global(.dark) .canteen-status-indicator.open {
          background: #064e3b !important;
          border-color: #10b981 !important;
        }

        :global(.dark) .canteen-status-indicator.closed {
          background: #7f1d1d !important;
          border-color: #ef4444 !important;
        }

        :global(.dark) .canteen-status-indicator.loading {
          background: #374151 !important;
          border-color: #4b5563 !important;
        }

        :global(.dark) .status-text {
          color: #f9fafb !important;
        }

        :global(.dark) .canteen-status-indicator.open .status-text {
          color: #34d399 !important;
        }

        :global(.dark) .canteen-status-indicator.closed .status-text {
          color: #fca5a5 !important;
        }

        :global(.dark) .canteen-status-indicator.loading .status-text {
          color: #9ca3af !important;
        }
      `}</style>
    </div>
  )
}

export default CanteenStatusIndicator
