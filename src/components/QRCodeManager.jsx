import React, { useState, useEffect } from 'react'
import { 
  fetchEncryptedQRCodes, 
  fetchEncryptedQRCodeById, 
  fetchEncryptedQRCodeByValue,
  fetchRecentEncryptedQRCodes,
  fetchEncryptedQRCodesByStatus,
  getQRCodeStatistics
} from '../utils/qrCodeFetcher'

const QRCodeManager = () => {
  const [qrCodes, setQrCodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    status: '',
    limit: 10
  })
  const [statistics, setStatistics] = useState(null)

  // Load initial data
  useEffect(() => {
    loadQRCodes()
    loadStatistics()
  }, [])

  const loadQRCodes = async (customFilters = {}) => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchEncryptedQRCodes({ ...filters, ...customFilters })
      
      if (result.success) {
        setQrCodes(result.data)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadStatistics = async () => {
    try {
      const result = await getQRCodeStatistics()
      if (result.success) {
        setStatistics(result.data)
      }
    } catch (err) {
      console.error('Failed to load statistics:', err)
    }
  }

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    loadQRCodes(newFilters)
  }

  const handleSearchById = async (orderId) => {
    if (!orderId.trim()) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchEncryptedQRCodeById(orderId.trim())
      
      if (result.success) {
        setQrCodes([result.data])
      } else {
        setError(result.error)
        setQrCodes([])
      }
    } catch (err) {
      setError(err.message)
      setQrCodes([])
    } finally {
      setLoading(false)
    }
  }

  const handleSearchByQRCode = async (qrCode) => {
    if (!qrCode.trim()) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchEncryptedQRCodeByValue(qrCode.trim())
      
      if (result.success) {
        setQrCodes([result.data])
      } else {
        setError(result.error)
        setQrCodes([])
      }
    } catch (err) {
      setError(err.message)
      setQrCodes([])
    } finally {
      setLoading(false)
    }
  }

  const loadRecent = () => {
    loadQRCodes({ date_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() })
  }

  const loadByStatus = (status) => {
    handleFilterChange('status', status)
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>QR Code Manager</h2>
      
      {/* Statistics */}
      {statistics && (
        <div style={{ 
          background: '#f8f9fa', 
          padding: '15px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px'
        }}>
          <div>
            <h4>Total Orders with QR Codes</h4>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
              {statistics.total}
            </p>
          </div>
          <div>
            <h4>Orders by Status</h4>
            {Object.entries(statistics.byStatus).map(([status, count]) => (
              <div key={status} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{status}:</span>
                <span style={{ fontWeight: 'bold' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '15px',
        marginBottom: '20px',
        padding: '15px',
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div>
          <label>Status Filter:</label>
          <select 
            value={filters.status} 
            onChange={(e) => handleFilterChange('status', e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY">Ready</option>
            <option value="DELIVERED">Delivered</option>
          </select>
        </div>
        
        <div>
          <label>Limit:</label>
          <input 
            type="number" 
            value={filters.limit} 
            onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            min="1"
            max="100"
          />
        </div>
        
        <div>
          <label>Search by Order ID:</label>
          <input 
            type="text" 
            placeholder="Enter Order ID"
            onKeyPress={(e) => e.key === 'Enter' && handleSearchById(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        
        <div>
          <label>Search by QR Code:</label>
          <input 
            type="text" 
            placeholder="Enter QR Code"
            onKeyPress={(e) => e.key === 'Enter' && handleSearchByQRCode(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={() => loadQRCodes()} 
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          Load All
        </button>
        <button 
          onClick={loadRecent} 
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          Load Recent (7 days)
        </button>
        <button 
          onClick={() => loadByStatus('PENDING')} 
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          Pending Orders
        </button>
        <button 
          onClick={() => loadByStatus('READY')} 
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          Ready Orders
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{ 
          background: '#f8d7da', 
          color: '#721c24', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          Error: {error}
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          Loading QR codes...
        </div>
      )}

      {/* QR Codes Table */}
      {!loading && qrCodes.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            background: '#ffffff',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Order ID</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>QR Code</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Token</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Item</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Amount</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {qrCodes.map((order) => (
                <tr key={order.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '12px' }}>{order.id}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace' }}>{order.qr_code}</td>
                  <td style={{ padding: '12px' }}>{order.order_token}</td>
                  <td style={{ padding: '12px' }}>{order.item_name}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: order.status === 'PENDING' ? '#fff3cd' : 
                                 order.status === 'PREPARING' ? '#d1ecf1' :
                                 order.status === 'READY' ? '#d4edda' : '#f8d7da',
                      color: order.status === 'PENDING' ? '#856404' :
                             order.status === 'PREPARING' ? '#0c5460' :
                             order.status === 'READY' ? '#155724' : '#721c24'
                    }}>
                      {order.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>₹{order.total_amount}</td>
                  <td style={{ padding: '12px' }}>
                    {new Date(order.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No Data Message */}
      {!loading && qrCodes.length === 0 && !error && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: '#6c757d'
        }}>
          No QR codes found. Try adjusting your filters or search criteria.
        </div>
      )}
    </div>
  )
}

export default QRCodeManager

