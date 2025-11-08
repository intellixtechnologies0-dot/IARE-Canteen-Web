// Print Test Button Component
// Allows testing of the POS printer functionality

import React, { useState } from 'react'
import { Printer, RefreshCw } from 'lucide-react'
import posPrinterService from '../services/posPrinterService'
import supabase from '../lib/supabaseClient'

const PrintTestButton = () => {
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchRecentOrders = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) {
        console.error('Error fetching orders:', error)
        return
      }

      setRecentOrders(data || [])
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTestPrint = async () => {
    try {
      console.log('🖨️ Testing POS printer functionality...')
      
      // Create test order data with QR code
      const testOrderData = {
        qr_code: 'ORD-1234567890123456',
        item_name: 'Veg Biryani',
        total_amount: 180,
        order_token: '5678',
        order_type: false, // Dine In
        created_at: new Date().toISOString()
      }
      
      // Attempt to print
      const result = await posPrinterService.printOrder(testOrderData)
      
      if (result.success) {
        alert('✅ Test print successful! Check your printer or print dialog.')
      } else {
        alert(`❌ Test print failed: ${result.error}`)
      }
      
    } catch (error) {
      console.error('❌ Test print error:', error)
      alert(`❌ Test print error: ${error.message}`)
    }
  }

  const handlePrintRealOrder = async (order) => {
    try {
      console.log('🖨️ Printing real order:', order)
      
      const result = await posPrinterService.printOrder({
        qr_code: order.qr_code,
        item_name: order.item_name,
        total_amount: order.total_amount,
        order_token: order.order_token,
        order_type: order.order_type,
        created_at: order.created_at
      })
      
      if (result.success) {
        alert(`✅ Real order printed successfully!\nOrder: ${order.item_name}\nToken: #${order.order_token}`)
      } else {
        alert(`❌ Print failed: ${result.error}`)
      }
      
    } catch (error) {
      console.error('❌ Print error:', error)
      alert(`❌ Print error: ${error.message}`)
    }
  }

  const checkPrinterStatus = () => {
    const status = posPrinterService.getStatus()
    alert(`🖨️ Printer Status:\nConnected: ${status.connected}\nMethod: ${status.method}\nReady: ${status.ready}`)
  }

  const testBarcodeGeneration = async () => {
    try {
      console.log('🔍 Testing barcode generation with QR code')
      
      // Test barcode generation with QR code
      const qrCode = 'ORD-1234567890123456'
      const barcodeDataUrl = await posPrinterService.generateBarcode(qrCode)
      
      if (barcodeDataUrl) {
        // Create a new window to show the barcode
        const barcodeWindow = window.open('', '_blank', 'width=400,height=300')
        barcodeWindow.document.write(`
          <html>
            <head><title>Barcode Test - QR Code</title></head>
            <body style="text-align: center; padding: 20px; font-family: Arial;">
              <h3>Barcode Test</h3>
              <p>QR Code: <strong>${qrCode}</strong></p>
              <img src="${barcodeDataUrl}" alt="Barcode" style="max-width: 100%; border: 1px solid #ccc;" />
              <p><small>16-digit number: 1234567890123456</small></p>
            </body>
          </html>
        `)
        barcodeWindow.document.close()
        
        alert('✅ Barcode generated successfully! Check the new window.')
      } else {
        alert('❌ Barcode generation failed')
      }
      
    } catch (error) {
      console.error('❌ Barcode test error:', error)
      alert(`❌ Barcode test error: ${error.message}`)
    }
  }

  const testDirectPrint = async () => {
    try {
      console.log('🖨️ Testing direct print functionality...')
      
      // Test direct print without going through the full service
      const testData = {
        qr_code: 'ORD-1234567890123456',
        item_name: 'Test Item',
        total_amount: 100,
        order_token: '9999',
        order_type: false,
        created_at: new Date().toISOString()
      }
      
      const result = await posPrinterService.printOrder(testData)
      
      if (result.success) {
        alert('✅ Direct print test successful!')
      } else {
        alert(`❌ Direct print test failed: ${result.error}`)
      }
      
    } catch (error) {
      console.error('❌ Direct print test error:', error)
      alert(`❌ Direct print test error: ${error.message}`)
    }
  }

  const testContentGeneration = async () => {
    try {
      console.log('🔍 Testing content generation...')
      
      const testData = {
        qr_code: 'ORD-1234567890123456',
        item_name: 'Test Item',
        total_amount: 100,
        order_token: '9999',
        order_type: false,
        created_at: new Date().toISOString()
      }
      
      // Test content generation directly
      const content = await posPrinterService.createPrintContent(testData)
      console.log('📄 Generated content:', content)
      
      // Open a window to show the content
      const testWindow = window.open('', '_blank', 'width=400,height=600')
      testWindow.document.write(content.content)
      testWindow.document.close()
      
      alert('✅ Content generation test - check the new window!')
      
    } catch (error) {
      console.error('❌ Content generation test error:', error)
      alert(`❌ Content generation test error: ${error.message}`)
    }
  }

  return (
    <div style={{ 
      position: 'fixed', 
      bottom: '20px', 
      right: '20px', 
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleTestPrint}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            padding: '10px 15px',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '14px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}
          title="Test POS Printer with your 16-digit number"
        >
          <Printer size={16} />
          Test Print
        </button>
        
        <button
          onClick={testBarcodeGeneration}
          style={{
            backgroundColor: '#ffc107',
            color: 'black',
            border: 'none',
            padding: '10px 15px',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '14px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}
          title="Test Barcode Generation with 1234567890123456"
        >
          🔍 Barcode
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={testDirectPrint}
          style={{
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            padding: '10px 15px',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '14px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}
          title="Test Direct Print Function"
        >
          🖨️ Direct Print
        </button>
        
        <button
          onClick={testContentGeneration}
          style={{
            backgroundColor: '#6f42c1',
            color: 'white',
            border: 'none',
            padding: '10px 15px',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '14px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}
          title="Test Content Generation"
        >
          📄 Content
        </button>
      </div>
      
      <button
        onClick={checkPrinterStatus}
        style={{
          backgroundColor: '#28a745',
          color: 'white',
          border: 'none',
          padding: '10px 15px',
          borderRadius: '5px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '14px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }}
        title="Check Printer Status"
      >
        Status
      </button>
    </div>
  )
}

export default PrintTestButton
