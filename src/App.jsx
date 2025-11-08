import './App.css'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import React, { useEffect, useRef, useState, useContext, useMemo } from 'react'
import { createPortal } from 'react-dom'
// Cache bust: 2024-01-15-14-30
import supabase from './lib/supabaseClient'
import { getAdminUserId } from './lib/admin/getAdminUserId'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { List, UtensilsCrossed, Undo2, X, Sun, Moon, User, UserCheck, GraduationCap, ClipboardList, HandCoins, ClockArrowUp, Loader, CircleCheckBig, Clock4, Zap, ClipboardClock, Image, Plus, X as XIcon, Upload, Save, AlertCircle, Volume2, VolumeX, Bell, BellOff, ShoppingCart, Minus, Trash2, CirclePlus, CircleMinus, Home, Package, Settings, ScanLine, Brain, ChevronLeft, ChevronRight, Menu, Printer, LogOut } from 'lucide-react'
import CanteenStatusIndicator from './components/CanteenStatusIndicator'
import CanteenStatusToggleSwitch from './components/CanteenStatusToggleSwitch'
import { CanteenStatusProvider, useCanteenStatus } from './contexts/CanteenStatusContext'
import ManageOrders from './components/ManageOrders'
import PreOrderPanel from './components/PreOrderPanel'
import RemovedItemsPanel from './components/RemovedItemsPanel'
import ImageUpload from './components/ImageUpload'
import { NotificationProvider, useNotification } from './contexts/NotificationContext'
import { useOrderScanner } from './hooks/useOrderScanner'
import OrderScanModal from './components/OrderScanModal'
import BarcodeScannerListener from './components/BarcodeScannerListener'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './components/Login'
// import JsBarcode from 'jsbarcode' // Temporarily disabled - using CDN fallback

// Normalize status for UI comparisons (handles lowercase/uppercase from DB)
const normStatus = (s) => String(s || '').toUpperCase()

// App user ID - used to identify orders placed from external apps vs website counter
// Orders with this user_id are from external APPS, all others are from the WEBSITE/COUNTER
const APP_USER_ID = 'dd856fdc-905b-4de3-a7e3-771ad81df52c'
// Website counter user ID (staff user - only one)
const WEBSITE_USER_ID = '1e47a19b-baf5-4dd7-86b5-c02243c00d58'

// Helper function to check if an order is from the website counter
const isWebsiteCounter = (userId) => {
  return userId === WEBSITE_USER_ID
}

// Helper function to check if an order is from an app
const isAppOrder = (userId) => {
  return userId && userId !== WEBSITE_USER_ID
}

// Ensure an authenticated session for website counter usage (uses env creds)
const ensureWebsiteSession = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) return session
    const email = import.meta?.env?.VITE_COUNTER_EMAIL
    const password = import.meta?.env?.VITE_COUNTER_PASSWORD
    if (email && password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data.session
    }
    return null
  } catch (_) {
    return null
  }
}

let CACHED_ORDER_USER_ID = null

// Resolve which user_id to use on the order
// - If an app user is authenticated, use their auth user id (different per app source)
// - Otherwise, sign in the website counter (if needed) and use WEBSITE_USER_ID
const resolveOrderUserId = async () => {
  if (CACHED_ORDER_USER_ID) return CACHED_ORDER_USER_ID
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user?.id) {
    const counterEmail = import.meta?.env?.VITE_COUNTER_EMAIL
    // If the session belongs to the website counter account, still use WEBSITE_USER_ID
    if (counterEmail && session.user.email === counterEmail) {
      CACHED_ORDER_USER_ID = WEBSITE_USER_ID
      return CACHED_ORDER_USER_ID
    }
    // App/external authenticated user
    CACHED_ORDER_USER_ID = session.user.id
    return CACHED_ORDER_USER_ID
  }
  // No session – try to create a website session silently
  await ensureWebsiteSession()
  CACHED_ORDER_USER_ID = WEBSITE_USER_ID
  return CACHED_ORDER_USER_ID
}

// Global refresh function for menu items
let globalRefreshMenuItems = null

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CanteenStatusProvider>
          <NotificationProvider>
            <DashboardShell />
          </NotificationProvider>
        </CanteenStatusProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error in App:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Application error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'crimson' }}>{String(this.state.error)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

function DashboardShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [connectionStatus, setConnectionStatus] = useState('checking')
  const { showOrderNotification } = useNotification()
  const { user, loading: authLoading, signOut } = useAuth()
  
  // Global cart state that persists across navigation
  const [globalCart, setGlobalCart] = useState([])
  const [globalShowCart, setGlobalShowCart] = useState(false)
  const [globalCartOrderType, setGlobalCartOrderType] = useState('dine_in')
  
  // Fallback: Show main content after 15 seconds regardless of connection status
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (connectionStatus === 'checking') {
        console.log('🔄 Fallback timer: showing main content')
        setConnectionStatus('connected')
      }
    }, 15000)
    
    return () => clearTimeout(fallbackTimer)
  }, [connectionStatus])
  
  // Order barcode scanning functionality
  const {
    scannedOrder,
    scanMessage,
    closeModal,
    processScan,
    lastScannedCode,
    isProcessing: isScannerProcessing,
  } = useOrderScanner()
  const userMenuRef = useRef(null)

  // Close user menu on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      const el = userMenuRef.current
      if (!el) return
      const isOpen = el.hasAttribute('open')
      if (!isOpen) return
      if (!el.contains(e.target)) {
        el.removeAttribute('open')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [])
  
  // Theme state (reused from Settings)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  
  // Sidebar expanded state
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebarExpanded')
    return saved !== null ? JSON.parse(saved) : true
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])
  
  useEffect(() => {
    localStorage.setItem('sidebarExpanded', JSON.stringify(sidebarExpanded))
  }, [sidebarExpanded])

  // Pre-warm user resolution so placing first order is instant
  useEffect(() => {
    resolveOrderUserId().catch(() => {})
  }, [])

  // Barcode printing
  const printBarcodeReceipt = (orderData) => {
    try {
      console.log('🖨️ Printing barcode receipt with data:', orderData)
      generateBarcodeReceipt(orderData)
    } catch (e) {
      console.error('Failed to print barcode receipt', e)
    }
  }

  // Internal function for barcode receipt generation
  const generateBarcodeReceipt = (orderData) => {
    console.log('🖨️ Generating barcode receipt with data:', orderData)
    console.log('🖨️ QR Code for barcode:', orderData.qrCode)
    console.log('🖨️ Token for barcode:', orderData.token)
      
      // Support multiple items - check if orderData has items array
      const items = orderData.items || [{
        name: orderData.itemName,
        quantity: orderData.quantity || 1,
        price: orderData.pricePerUnit || orderData.totalAmount,
        total: orderData.totalAmount
      }]
      
      console.log('📄 Print Receipt Data:', {
        items: items,
        token: orderData.token,
        qrCode: orderData.qrCode
      })
      
      const totalAmount = items.reduce((sum, item) => sum + (item.total || (item.price * item.quantity)), 0)
      
      // Build items list HTML
      const itemsListHTML = items.map(item => `
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 11px; padding: 3px 0; border-bottom: 1px dashed #ccc;">
          <div style="flex: 1;">
            <span style="font-weight: bold;">${item.name}</span>
            ${item.quantity > 1 ? `<span style="color: #666;"> × ${item.quantity}</span>` : ''}
          </div>
          <span style="font-weight: bold;">₹${item.total || (item.price * item.quantity)}</span>
        </div>
      `).join('')
      
      // Format date and time
      const now = new Date()
      const date = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      
      // Create the receipt HTML content with new structure
      const receiptHTML = `
        <div class="receipt" style="
          width: 80mm;
          min-height: 297mm;
          font-family: 'Arial', sans-serif;
          padding: 6mm 3mm 6mm 5mm;
          background: white;
          margin: 0;
          box-sizing: border-box;
        ">
          <div class="header" style="
            text-align: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #333;
          ">
            <h1 style="font-size: 24px; font-weight: bold; margin: 0 0 2px 0; letter-spacing: 1px; color: #000;">IARE College Canteen</h1>
            <p style="font-size: 12px; margin: 0; color: #000;">DUNDIGAL</p>
          </div>
          
          <div class="order-info" style="margin: 6px 0; font-size: 11px; padding-bottom: 6px; border-bottom: 1px solid #333;">
            <div style="display: flex; justify-content: space-between;">
              <span>${date}</span>
              <span>${time}</span>
            </div>
            <div style="margin-top: 4px;">Order Type : ${orderData.orderType && orderData.orderType.includes('takeaway') ? 'Takeaway' : 'Dine-in'}</div>
          </div>
          
          <div class="item-details" style="margin: 12px 0;">
            <div style="font-weight: bold; font-size: 12px; margin-bottom: 8px;">Item Details</div>
            ${items.map((item, index) => {
              const price = Number(item.price || 0)
              const qty = Number(item.quantity || 1)
              const total = Number(item.total || (price * qty))
              return `
                <div style="margin: 6px 0 10px 0;">
                  <div style="display: flex; font-size: 13px; align-items: center; gap: 8px;">
                    <div style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      <span style="font-weight: 600;">${index + 1}.</span>
                      <span style="margin-left: 6px; font-weight: 700;">${item.name || ''}</span>
                    </div>
                    <div style="margin-left: auto; white-space: nowrap; font-weight: 800; flex: 0 0 auto;">#${item.token || orderData.token || ''} • Qty: ${qty}</div>
                  </div>
                  <div style="display: flex; justify-content: flex-end; font-size: 11px; margin-top: 2px;">
                    <div style="white-space: nowrap;">₹${price.toFixed(2)} × ${qty} = <strong>₹${total.toFixed(2)}</strong></div>
                  </div>
                  <div id="barcode-${index}" style="margin: 6px auto 0; display: block; width: 100%; height: 56px;"></div>
                  <div style="height: 1px; background: #ddd; margin: 8px 0 4px 0;"></div>
                </div>
              `
            }).join('')}
          </div>
          
          <div style="margin-top: 15px;">
            <div style="border-top: 1px solid #333;"></div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin-top: 8px;">
              <span>Total</span>
              <span>₹${totalAmount.toFixed(2)}</span>
            </div>
          </div>
          
          <div class="barcode-section" style="text-align: center; margin-top: 4px;">
            <p style="margin: 2px 0; font-size: 10px; color: #666;">Scan to collect your order</p>
            <div id="barcode" style="margin: 6px auto 0; display: block; width: 100%; height: 56px;"></div>
            <p style="margin: 2px 0; font-weight: bold; font-size: 10px;">Thanks for choosing us today!</p>
          </div>
          
          <div class="footer" style="
            text-align: center;
            margin-top: 25px;
            font-size: 10px;
            color: #666;
          ">
            <p style="margin: 5px 0; font-weight: bold;">Thanks for choosing us today!</p>
            <p style="margin: 3px 0; color: #999;">Powered by CustomBridge Technologies</p>
          </div>
        </div>
      `
      
      // Create a hidden div for printing in the same tab
      const printDiv = document.createElement('div')
      printDiv.id = 'print-receipt'
      printDiv.style.position = 'absolute'
      printDiv.style.left = '-9999px'
      printDiv.style.top = '-9999px'
      printDiv.style.width = '80mm'
      printDiv.style.height = '297mm'
      printDiv.innerHTML = receiptHTML
      
      // Add print styles to the document head instead of inline
      const existingPrintStyles = document.getElementById('print-styles')
      if (existingPrintStyles) {
        existingPrintStyles.remove()
      }
      
      const printStyles = document.createElement('style')
      printStyles.id = 'print-styles'
      printStyles.textContent = `
        /* Ensure only the receipt prints and the rest of the app is hidden */
        @media print {
          body { margin: 0 !important; padding: 0 !important; }
          /* Improve printed color fidelity */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Hide everything by default */
          body * { visibility: hidden !important; }
          /* Only show the receipt and ensure barcodes are visible */
          #print-receipt, #print-receipt * { 
            visibility: visible !important; 
          }
          /* Preserve table layout for proper alignment */
          #print-receipt table {
            display: table !important;
            table-layout: fixed !important;
            width: 100% !important;
          }
          #print-receipt tr {
            display: table-row !important;
          }
          #print-receipt td {
            display: table-cell !important;
            vertical-align: top !important;
          }
          /* Prevent text wrapping in total amount */
          #print-receipt td:last-child {
            white-space: nowrap !important;
            word-wrap: normal !important;
            overflow-wrap: normal !important;
          }
          /* Ensure SVG barcodes are visible */
          #print-receipt svg, #print-receipt svg * {
            visibility: visible !important;
            display: block !important;
          }
          /* Place the receipt at the top-left and set exact width */
          #print-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            min-height: auto !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
        }
        /* Set paper size to thermal roll width */
        @page {
          size: 80mm auto;
          margin: 0;
        }
        /* Lock scaling for Chrome print dialog */
        @media print {
          html, body {
            width: 80mm;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `
      document.head.appendChild(printStyles)
      
      // Add to document
      document.body.appendChild(printDiv)
      
      // Wait for content to render, then generate barcodes and print
      setTimeout(() => {
        try {
          console.log('🔍 Generating barcodes in hidden div')
          
          // Ensure JsBarcode is loaded before proceeding
          console.log('🔍 Checking JsBarcode availability...')
          console.log('🔍 window.JsBarcode:', typeof window.JsBarcode)
          console.log('🔍 window.JsBarcode available:', !!window.JsBarcode)
          
          if (typeof window.JsBarcode === 'undefined') {
            console.log('⏳ JsBarcode not loaded yet, waiting...')
            // Wait a bit more for the library to load
            setTimeout(() => {
              console.log('🔍 Re-checking JsBarcode after delay...')
              console.log('🔍 window.JsBarcode:', typeof window.JsBarcode)
              console.log('🔍 window.JsBarcode available:', !!window.JsBarcode)
              
              if (typeof window.JsBarcode === 'undefined') {
                console.error('❌ JsBarcode still not loaded after delay')
                alert('Barcode library failed to load. Please refresh the page and try again.')
                return
              }
              generateBarcodes(printDiv, orderData, items)
            }, 1000)
            return
          }
          
          generateBarcodes(printDiv, orderData, items)
        } catch (error) {
          console.error('❌ Barcode generation failed:', error)
          // Clean up the hidden div
          if (printDiv.parentNode) {
            printDiv.parentNode.removeChild(printDiv)
          }
        }
      }, 500)
  }
  // Helper function to generate barcodes
  const generateBarcodes = (printDiv, orderData, items) => {
    try {
          
          // Generate barcode(s) - handle both single and multiple barcodes
          if (orderData.isCombinedReceipt && items && items.length > 1) {
            // Generate individual barcodes for each item
            console.log('🔍 Generating individual barcodes for', items.length, 'items')
            items.forEach((item, index) => {
              console.log(`🔍 Looking for barcode element #barcode-${index}...`)
              const barcodeElement = printDiv.querySelector(`#barcode-${index}`)
              console.log(`🔍 Barcode element #barcode-${index} found:`, !!barcodeElement)
              
              if (barcodeElement) {
                try {
                  const qrCodeToUse = item.qrCode || orderData.qrCode
                  console.log(`🔍 Generating barcode for item ${index + 1} with QR code:`, qrCodeToUse)
                  
                  if (!qrCodeToUse || qrCodeToUse.length < 8) {
                    console.error(`❌ Invalid QR code for item ${index + 1}:`, qrCodeToUse)
                    throw new Error(`Invalid QR code: ${qrCodeToUse}`)
                  }
                  
                  console.log('🔍 Checking JsBarcode availability for item barcode...')
                  console.log('🔍 window.JsBarcode:', typeof window.JsBarcode)
                  console.log('🔍 window.JsBarcode available:', !!window.JsBarcode)
                  
                  if (typeof window.JsBarcode === 'undefined') {
                    console.error('❌ JsBarcode library not loaded for item barcode')
                    throw new Error('JsBarcode library not loaded')
                  }
                  
                  // Render to canvas first for better printer compatibility, then to image
                  const canvas = document.createElement('canvas')
                  window.JsBarcode(canvas, qrCodeToUse, {
                    format: 'CODE128',
                    width: 1.8,
                    height: 56,
                    displayValue: false,
                    margin: 4,
                    lineColor: '#000000',
                    background: '#ffffff'
                  })
                  const img = document.createElement('img')
                  img.src = canvas.toDataURL('image/png')
                  img.style.display = 'block'
                  img.style.margin = '0 auto'
                  img.style.maxWidth = '100%'
                  // Replace SVG placeholder with image
                  barcodeElement.replaceWith(img)
                  console.log(`✅ Barcode ${index + 1} generated as image for ${item.name}`)
                } catch (itemBarcodeError) {
                  console.error(`❌ Barcode generation failed for item ${index + 1}:`, itemBarcodeError)
                  barcodeElement.innerHTML = `<text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial" font-size="10" fill="black">Token: ${item.token}</text>`
                }
              } else {
                console.error(`❌ Barcode element not found for item ${index + 1}`)
              }
            })
          } else {
            // Generate single barcode for regular receipt
            console.log('🔍 Looking for single barcode element...')
            const barcodeElement = printDiv.querySelector('#barcode')
            console.log('🔍 Barcode element found:', !!barcodeElement)
            console.log('🔍 Barcode element:', barcodeElement)
            
            if (barcodeElement) {
              try {
                console.log('🔍 Generating single barcode with QR code:', orderData.qrCode)
                console.log('🔍 Barcode element found:', barcodeElement)
                
                if (!orderData.qrCode || orderData.qrCode.length < 8) {
                  throw new Error(`Invalid QR code: ${orderData.qrCode}`)
                }
                
                // Check if JsBarcode is available
                console.log('🔍 Checking JsBarcode availability...')
                console.log('🔍 window.JsBarcode:', typeof window.JsBarcode)
                console.log('🔍 window.JsBarcode available:', !!window.JsBarcode)
                
                if (typeof window.JsBarcode === 'undefined') {
                  console.error('❌ JsBarcode library not loaded')
                  throw new Error('JsBarcode library not loaded')
                }
                
                // Render to canvas first for better printer compatibility, then to image
                const canvas = document.createElement('canvas')
                window.JsBarcode(canvas, orderData.qrCode, {
                  format: 'CODE128',
                  width: 1.8,
                  height: 56,
                  displayValue: false,
                  margin: 4,
                  lineColor: '#000000',
                  background: '#ffffff'
                })
                const img = document.createElement('img')
                img.src = canvas.toDataURL('image/png')
                img.style.display = 'block'
                img.style.margin = '0 auto'
                img.style.maxWidth = '100%'
                // Replace SVG placeholder with image
                barcodeElement.replaceWith(img)
                console.log('✅ Single barcode generated successfully as image')
              } catch (barcodeError) {
                console.error('❌ Single barcode generation failed:', barcodeError)
                console.log('🔍 QR Code data:', orderData.qrCode)
                console.log('🔍 JsBarcode available:', typeof window.JsBarcode)
                barcodeElement.innerHTML = `<div style="text-align: center; padding: 20px; border: 1px dashed #ccc; font-family: Arial; font-size: 12px; color: #666;">Barcode Error: ${barcodeError.message}<br/>QR: ${orderData.qrCode || 'N/A'}</div>`
              }
            } else {
              console.error('❌ Barcode element not found for single receipt')
            }
          }
          
          // Wait a bit more for barcodes to render, then print
          setTimeout(() => {
            try {
              console.log('🖨️ Opening print dialog in current window...')

              // Keep receipt off-screen to avoid in-page preview while still printable
              printDiv.style.position = 'absolute'
              printDiv.style.top = '0'
              printDiv.style.left = '-10000px'
              printDiv.style.zIndex = '-1'
              printDiv.style.backgroundColor = 'white'
              printDiv.style.display = 'block'

              // Trigger print dialog
              setTimeout(() => {
                try {
                  window.print()
                  console.log('✅ Print dialog opened in current window')

                  // Hide the receipt after printing
                  setTimeout(() => {
                    if (printDiv.parentNode) {
                      printDiv.parentNode.removeChild(printDiv)
                    }
                    // Clean up print styles
                    const printStyles = document.getElementById('print-styles')
                    if (printStyles) {
                      printStyles.remove()
                    }
                  }, 1000)

                } catch (printError) {
                  console.error('❌ Print failed:', printError)
                  // Hide the receipt
                  if (printDiv.parentNode) {
                    printDiv.parentNode.removeChild(printDiv)
                  }
                  // Clean up print styles
                  const printStyles = document.getElementById('print-styles')
                  if (printStyles) {
                    printStyles.remove()
                  }
                  alert('Print failed! Please try manually:\n1. Right-click and select "Print"\n2. Or use Ctrl+P')
                }
              }, 500)

            } catch (error) {
              console.error('❌ Print setup failed:', error)
              // Clean up the hidden div
              if (printDiv.parentNode) {
                printDiv.parentNode.removeChild(printDiv)
              }
              // Clean up print styles
              const printStyles = document.getElementById('print-styles')
              if (printStyles) {
                printStyles.remove()
              }
              alert(`Print setup failed: ${error.message}\n\nPlease try manually:\n1. Right-click and select "Print"\n2. Or use Ctrl+P`)
            }
          }, 1000)

      } catch (error) {
        console.error('❌ Error in generateBarcodes:', error)
        // Clean up the hidden div
        if (printDiv.parentNode) {
          printDiv.parentNode.removeChild(printDiv)
        }
        // Clean up print styles
        const printStyles = document.getElementById('print-styles')
        if (printStyles) {
          printStyles.remove()
        }
        alert('Error generating barcodes! Please try printing manually.')
      }
  }

  // Function to fetch encrypted QR codes from Supabase orders table
  const fetchEncryptedQRCodes = async (filters = {}) => {
    try {
      console.log('🔍 Fetching encrypted QR codes from orders table...')
      
      let query = supabase
        .from('orders')
        .select('id, qr_code, order_token, item_name, status, created_at, total_amount, user_id, order_type')
        .not('qr_code', 'is', null) // Only get orders that have QR codes
        .order('created_at', { ascending: false })

      // Apply filters if provided
      if (filters.status) {
        query = query.eq('status', filters.status)
      }
      
      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id)
      }
      
      if (filters.order_type) {
        query = query.eq('order_type', filters.order_type)
      }
      
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from)
      }
      
      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to)
      }
      
      if (filters.limit) {
        query = query.limit(filters.limit)
      }

      const { data, error } = await query

      if (error) {
        console.error('❌ Error fetching encrypted QR codes:', error)
        throw error
      }

      console.log('✅ Successfully fetched encrypted QR codes:', data?.length || 0, 'orders')
      
      // Return the data with QR codes (these are already encrypted as stored in the database)
      return {
        success: true,
        data: data || [],
        count: data?.length || 0
      }
    } catch (error) {
      console.error('❌ Failed to fetch encrypted QR codes:', error)
      return {
        success: false,
        error: error.message,
        data: [],
        count: 0
      }
    }
  }

  // Function to fetch a specific encrypted QR code by order ID
  const fetchEncryptedQRCodeById = async (orderId) => {
    try {
      console.log('🔍 Fetching encrypted QR code for order ID:', orderId)
      
      const { data, error } = await supabase
        .from('orders')
        .select('id, qr_code, order_token, item_name, status, created_at, total_amount, user_id, order_type')
        .eq('id', orderId)
        .single()

      if (error) {
        console.error('❌ Error fetching encrypted QR code by ID:', error)
        throw error
      }

      if (!data) {
        console.log('❌ No order found with ID:', orderId)
        return {
          success: false,
          error: 'Order not found',
          data: null
        }
      }

      console.log('✅ Successfully fetched encrypted QR code for order:', data.id)
      
      return {
        success: true,
        data: data
      }
    } catch (error) {
      console.error('❌ Failed to fetch encrypted QR code by ID:', error)
      return {
        success: false,
        error: error.message,
        data: null
      }
    }
  }

  // Function to fetch order by barcode/order token value
  // Barcodes now contain the order_token value
  const fetchEncryptedQRCodeByValue = async (barcodeValue) => {
    try {
      console.log('🔍 Fetching order by barcode/token value:', barcodeValue)
      
      // Try searching by order_token first (barcode contains order_token)
      let { data, error } = await supabase
        .from('orders')
        .select('id, qr_code, order_token, item_name, status, created_at, total_amount, user_id, order_type')
        .eq('order_token', barcodeValue)
        .single()

      // If not found by order_token, try qr_code for backward compatibility
      if (!data || error) {
        console.log('🔍 Order not found by token, trying qr_code...')
        const result = await supabase
          .from('orders')
          .select('id, qr_code, order_token, item_name, status, created_at, total_amount, user_id, order_type')
          .eq('qr_code', barcodeValue)
          .single()
        
        if (!result.error && result.data) {
          data = result.data
          error = null
        }
      }

      if (error) {
        console.error('❌ Error fetching order by barcode/token value:', error)
        throw error
      }

      if (!data) {
        console.log('❌ No order found with barcode/token:', barcodeValue)
        return {
          success: false,
          error: 'Order not found',
          data: null
        }
      }

      console.log('✅ Successfully fetched order by barcode/token value:', data.order_token || data.qr_code)
      
      return {
        success: true,
        data: data
      }
    } catch (error) {
      console.error('❌ Failed to fetch order by barcode/token value:', error)
      return {
        success: false,
        error: error.message,
        data: null
      }
    }
  }

  

  // Debug function to check JsBarcode status
  const testJsBarcodeStatus = () => {
    const status = {
      windowJsBarcode: !!window.JsBarcode,
      windowJsBarcodeType: typeof window.JsBarcode,
      importedJsBarcode: typeof JsBarcode,
      scripts: Array.from(document.querySelectorAll('script')).map(s => s.src).filter(src => src.includes('jsbarcode'))
    }

    console.log('🔍 JsBarcode Status:', status)

    let message = 'JsBarcode Status:\n\n'
    message += `Window.JsBarcode: ${status.windowJsBarcode ? '✅ Available' : '❌ Not Available'}\n`
    message += `Type: ${status.windowJsBarcodeType}\n`
    message += `Imported JsBarcode: ${status.importedJsBarcode}\n`
    message += `Loaded Scripts: ${status.scripts.length}\n`

    if (status.scripts.length > 0) {
      message += '\nLoaded JsBarcode scripts:\n' + status.scripts.join('\n')
    }

    alert(message)
  }

  // Enable barcode listener on specific pages (including Home '/')
  const scannerEnabledPages = ['/', '/orders', '/place-order', '/manage-orders']
  const isScannerEnabled = scannerEnabledPages.includes(location.pathname)
  const titles = {
    '/': 'Dashboard',
    '/place-order': 'Place Order',
    '/orders': 'Orders',
    '/inventory': 'Inventory Management',
    '/manage-orders': 'Manage Orders',
    '/pre-order': 'Pre-Order',
    '/scan': 'Scan Orders',
    '/ai': 'AI Predictions',
    '/settings': 'Settings',
  }
  const title = titles[location.pathname] || 'Dashboard'
  // Orders panel view controls
  const [ordersView, setOrdersView] = useState('live')
  const [ordersPictureMode, setOrdersPictureMode] = useState(false)
  const [recent, setRecent] = useState([])

  // Simple in-memory orders state shared between Home and Orders panels
  const [orders, setOrders] = useState([])
  const [delivered, setDelivered] = useState([])
  const [activity, setActivity] = useState([]) // {orderId, items, from, to, at, prevLoc, nextLoc}
  const [updatingIds, setUpdatingIds] = useState({}) // { [orderId]: true }
  const [confirmCancelOrder, setConfirmCancelOrder] = useState(null) // { orderId, itemName }
  const [confirmCancelItems, setConfirmCancelItems] = useState([])

  const updateOrderStatus = async (orderId, nextStatus) => {
    // Snapshot current orders to avoid stale closures and allow rollback
    const prevOrdersSnapshot = [...orders]
    // Optimistic UI update to give immediate feedback
    setOrders((prev) => {
      const updated = prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
      // Keep stable FIFO ordering to prevent layout jumps on status change
      return updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    })
    // Mark as updating to prevent action flicker
    setUpdatingIds((prev) => ({ ...prev, [orderId]: true }))

    try {
      // Persist status via RPC
      const { data, error } = await supabase.rpc('update_order_status_flexible', {
        p_order_id: orderId,
        p_new_status: String(nextStatus).toLowerCase(),
      })
      if (error) throw error

      // Locate the order from the snapshot (fallback to latest state)
      const found = prevOrdersSnapshot.find((o) => o.id === orderId) || orders.find((o) => o.id === orderId)
      if (!found) return
      const prevStatus = found.status
      const now = new Date().toLocaleString()

      // Handle transitions
      if (nextStatus === 'READY') {
        setOrders((prev) => {
          const updated = prev.map((o) => (o.id === orderId ? { ...o, status: 'READY' } : o))
          // Keep stable FIFO ordering to prevent layout jumps on status change
          return updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        })
        setRecent((prev) => {
          const pruned = prev.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING'))
          return [{ orderId, itemName: found.item_name, from: prevStatus, to: 'READY', ts: Date.now() }, ...pruned]
        })
        setActivity((a) => [
          { orderId, itemName: found.item_name, from: prevStatus, to: 'READY', at: now, ts: Date.now(), prevLoc: 'live', nextLoc: 'live' },
          ...a.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING')),
        ])
        return
      }

      if (nextStatus === 'DELIVERED') {
        // Move the order out of the live list into the past list
        setOrders((prev) => prev.filter((o) => o.id !== orderId))
        setDelivered((d) => [{ ...found, status: 'DELIVERED', deliveredAt: Date.now() }, ...d])
        setRecent((prev) => {
          const pruned = prev.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING'))
          return [{ orderId, itemName: found.item_name, from: prevStatus, to: 'DELIVERED', ts: Date.now() }, ...pruned]
        })
        setActivity((a) => [
          { orderId, itemName: found.item_name, from: prevStatus, to: 'DELIVERED', at: now, ts: Date.now(), prevLoc: 'live', nextLoc: 'delivered' },
          ...a.filter((e) => !(e.orderId === orderId && e.to === 'PREPARING')),
        ])

        // Stock is already reduced when order is placed, no need to reduce again on delivery
        console.log('📦 Order marked as delivered - stock was already reduced on order placement')

        return
      }

      // default: update status in-place
      setOrders((prev) => {
        const updated = prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
        // Keep stable FIFO ordering to prevent layout jumps on status change
        return updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      })
      setRecent((prev) => [{ orderId, itemName: found.item_name, from: prevStatus, to: nextStatus, ts: Date.now() }, ...prev])
      setActivity((a) => [
        { orderId, itemName: found.item_name, from: prevStatus, to: nextStatus, at: now, ts: Date.now(), prevLoc: 'live', nextLoc: 'live' },
        ...a,
      ])

    } catch (err) {
      console.error('Failed to update order status:', err)
      // Rollback optimistic update
      try { setOrders(prevOrdersSnapshot) } catch (e) { /* ignore */ }
      alert('Failed to update order status: ' + (err.message || err))
    } finally {
      // Clear updating flag
      setUpdatingIds((prev) => {
        const next = { ...prev }
        delete next[orderId]
        return next
      })
    }
  }

  // Show cancel order confirmation dialog
  const showCancelConfirmation = async (orderId) => {
    // First get the order details to show in the confirmation
    const order = orders.find(o => o.id === orderId)
    if (order) {
      setConfirmCancelOrder({ orderId, itemName: order.item_name })
    }
  }

  // When cancel modal opens, show a concise preview using current order data
  useEffect(() => {
    const orderId = confirmCancelOrder?.orderId
    if (!orderId) {
      setConfirmCancelItems([])
      return
    }

    const fallbackOrder = orders.find((o) => o.id === orderId)
    if (fallbackOrder) {
      setConfirmCancelItems([
        {
          quantity: fallbackOrder.quantity ?? 1,
          food_items: { name: fallbackOrder.item_name },
        },
      ])
    } else {
      setConfirmCancelItems([])
    }
  }, [confirmCancelOrder?.orderId, orders])

  // Handle ESC key to close and ENTER key to confirm cancel confirmation modal
  useEffect(() => {
    if (!confirmCancelOrder) return
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setConfirmCancelOrder(null)
      } else if (e.key === 'Enter' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault()
        // Call cancelOrder inline to avoid dependency issues
        const orderId = confirmCancelOrder.orderId
        setConfirmCancelOrder(null)
        setConfirmCancelItems([])
        
        // Perform cancellation
        const cancelOrderAsync = async () => {
          try {
            const { data: orderData, error: orderFetchError } = await supabase
              .from('orders')
              .select('item_name, status, id')
              .eq('id', orderId)
              .single()

            if (orderFetchError) {
              alert(`Failed to fetch order details: ${orderFetchError.message}`)
              return
            }

            const currentStatus = normStatus(orderData.status)
            if (currentStatus === 'DELIVERED') {
              alert('Cannot cancel delivered orders. Use "Revert" instead.')
              return
            }

            const { error: updateError } = await supabase
              .from('orders')
              .update({ 
                status: 'cancelled',
                updated_at: new Date().toISOString()
              })
              .eq('id', orderId)
            
            if (updateError) {
              alert(`Failed to cancel order: ${updateError.message}`)
              return
            }
            if (orderData.item_name) {
              const { data: currentStock } = await supabase
                .from('food_items')
                .select('available_quantity')
                .eq('name', orderData.item_name)
                .single()

              if (currentStock) {
                await supabase
                  .from('food_items')
                  .update({
                    available_quantity: currentStock.available_quantity + 1,
                    is_available: true,
                    updated_at: new Date().toISOString()
                  })
                  .eq('name', orderData.item_name)
              }
            }
          } catch (err) {
            console.error('Failed to cancel order:', err)
          }
        }
        
        cancelOrderAsync()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmCancelOrder])
  // Cancel order (for pending/preparing orders)
  const cancelOrder = async (orderId) => {
    setConfirmCancelOrder(null) // Close confirmation modal
    setConfirmCancelItems([])
    
    try {
      console.log('🔄 Starting order cancellation for ID:', orderId)
      
      // First get the order details to know which item to restore stock for
      const { data: orderData, error: orderFetchError } = await supabase
        .from('orders')
        .select('item_name, status, id')
        .eq('id', orderId)
        .single()

      if (orderFetchError) {
        console.error('❌ Could not fetch order details:', orderFetchError)
        alert(`Failed to fetch order details: ${orderFetchError.message}`)
        return
      }

      console.log('📋 Order data retrieved:', orderData)

      // Only allow canceling pending/preparing orders
      const currentStatus = normStatus(orderData.status)
      if (currentStatus === 'DELIVERED') {
        alert('Cannot cancel delivered orders. Use "Revert" instead.')
        return
      }

      // Update order status to cancelled (try both lowercase and uppercase)
      const { error: updateError } = await supabase
        .from('orders')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
      
      if (updateError) {
        console.error('❌ Failed to update order status:', updateError)
        alert(`Failed to cancel order: ${updateError.message}`)
        return
      }

      console.log('✅ Order status updated to CANCELLED')

      // Restore stock when order is canceled (item returned to inventory)
      if (orderData.item_name) {
        console.log('📦 Order canceled, restoring stock for:', orderData.item_name)
        try {
          // First get current stock
          const { data: currentStock, error: stockFetchError } = await supabase
            .from('food_items')
            .select('available_quantity')
            .eq('name', orderData.item_name)
            .single()

          if (stockFetchError) {
            console.error('❌ Could not fetch current stock for restore:', stockFetchError)
            console.warn('⚠️ Order canceled but stock not restored. Please update manually.')
          } else {
            const newQuantity = currentStock.available_quantity + 1
            const { error: stockUpdateError } = await supabase
              .from('food_items')
              .update({
                available_quantity: newQuantity,
                is_available: true, // Set to available when stock is restored
                updated_at: new Date().toISOString()
              })
              .eq('name', orderData.item_name)

            if (stockUpdateError) {
              console.error('❌ Failed to restore stock on cancel:', stockUpdateError)
              console.warn('⚠️ Order canceled but stock not restored. Please update manually.')
            } else {
              console.log('✅ Stock restored on cancel (marked as available)')

              // Refresh menu items to show updated stock
              if (globalRefreshMenuItems) {
                globalRefreshMenuItems()
              }
            }
          }
        } catch (stockErr) {
          console.error('❌ Stock restoration error:', stockErr)
        }
      }

      // Update local state optimistically - remove from live orders
      setOrders(prev => prev.filter(order => order.id !== orderId))
      
      // Show notification for cancelled order
      try {
        await showOrderNotification({
          item_name: orderData.item_name || 'Order',
          order_token: 'CANCELLED',
          total_amount: 0,
          order_type: 'cancelled',
          user_id: APP_USER_ID,
          isCancellation: true
        })
      } catch (notifError) {
        console.warn('⚠️ Failed to show notification:', notifError)
      }
      
      console.log('✅ Order cancellation completed successfully')
      
    } catch (error) {
      console.error('❌ Error canceling order:', error)
      alert(`Failed to cancel order: ${error.message || 'Unknown error'}`)
    }
  }
  // fetch initial orders from Supabase if configured
  const fetchOrders = async (timeoutRef) => {
      console.log('📡 fetchOrders called')
      try {
        // Check if Supabase is configured
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
        
        if (!supabaseUrl || !supabaseKey || supabaseUrl === 'your_supabase_project_url_here') {
          console.warn('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file')
          console.log('Supabase URL:', supabaseUrl)
          console.log('Supabase Key exists:', !!supabaseKey)
          setConnectionStatus('not-configured')
          return
        }

        setConnectionStatus('connecting')
        // Fetch in pages to avoid PostgREST default row limits
        const pageSize = 1000
        let from = 0
        let all = []
        while (true) {
          const to = from + pageSize - 1
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: true })
            .range(from, to)
        if (error) throw error
          const batch = data || []
          console.log('Fetched batch:', batch.length, 'orders')
          all = all.concat(batch)
          if (batch.length < pageSize) break
          from += pageSize
        }
        // order_token is now directly available in the orders table
        // Merge item prices from food_items when total_amount is missing
        try {
          const itemIds = Array.from(
            new Set((all || []).map(o => o.item_id || o.itemId || o.item || o.food_item_id).filter(Boolean))
          )
          if (itemIds.length > 0) {
            const priceMap = Object.create(null)
            const { data: rows, error: priceError } = await supabase
              .from('food_items')
              .select('*')
              .in('id', itemIds)
            if (!priceError) {
              for (const r of rows || []) {
                const key = r.id || r.item_id || r.code || r.slug
                const val = r.price ?? r.cost ?? r.rate ?? r.amount
                if (key && typeof val === 'number') priceMap[key] = val
              }
              all = all.map(o => {
                const key = o.item_id || o.itemId || o.item || o.food_item_id
                const resolved = key != null ? priceMap[key] : undefined
                return resolved != null && (o.total_amount == null || Number.isNaN(o.total_amount))
                  ? { ...o, total_amount: resolved }
                  : o
              })
            }
          }
        } catch (e) {
          console.warn('Price merge skipped:', e?.message || e)
        }
        // Split into live and past
        const live = (all || []).filter((o) => {
          const status = normStatus(o.status)
          return status !== 'DELIVERED' && status !== 'CANCELLED'
        })
        const past = (all || []).filter((o) => {
          const status = normStatus(o.status)
          return status === 'DELIVERED' || status === 'CANCELLED'
        })
        
        // Sort past orders by created_at descending (latest first)
        const sortedPast = past.sort((a, b) => {
          return new Date(b.created_at) - new Date(a.created_at)
        })
        
        // Sort live orders: Pure time-based sorting (oldest first, newest last)
        const sortedLive = live.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        
        console.log('Total orders fetched:', all.length)
        console.log('Live orders:', sortedLive.length)
        console.log('Past orders:', sortedPast.length)
        console.log('Sample order:', all[0])
        setOrders(sortedLive)
        setDelivered(sortedPast)
        setConnectionStatus('connected')
        if (timeoutRef) clearTimeout(timeoutRef)
      } catch (err) {
        console.error('Supabase orders fetch failed:', err)
        setConnectionStatus('error')
        // Show more detailed error info
        if (err.message?.includes('JWT')) {
          console.error('Authentication error - check your Supabase anon key')
        } else if (err.message?.includes('relation "orders" does not exist')) {
          console.error('Orders table does not exist - run the SQL script in Supabase')
        }
      }
    }

  // subscribe to realtime orders on mount (with a 1s polling fallback until realtime confirms)
  useEffect(() => {
    console.log('🚀 DashboardShell useEffect triggered')
    
    // Set a timeout to automatically proceed if connection check takes too long
    const connectionTimeout = setTimeout(() => {
      if (connectionStatus === 'checking') {
        console.log('⏰ Connection timeout, proceeding anyway')
        setConnectionStatus('connected')
      }
    }, 10000) // 10 second timeout

    fetchOrders(connectionTimeout)

    // start polling every second as a fallback until realtime delivers first event
    let intervalId = setInterval(() => fetchOrders(undefined), 1000)
    let gotRealtime = false

    const channel = supabase.channel('public:orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        console.log('🔄 Orders Panel: New order received via real-time:', payload.new)
        
        // when realtime arrives, stop polling and apply change
        if (!gotRealtime) {
          gotRealtime = true
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }
        let enriched = payload.new
        // order_token is now directly available in the orders table
        // Enrich price if missing using food_items
        try {
          const hasTotalAmount =
            enriched &&
            enriched.total_amount != null &&
            !Number.isNaN(Number(enriched.total_amount))
          if (enriched && !hasTotalAmount) {
            const key = enriched.item_id || enriched.itemId || enriched.item || enriched.food_item_id
            if (key != null) {
              const { data: rows2, error: e2 } = await supabase
                .from('food_items')
                .select('*')
                .or(`id.eq.${key},item_id.eq.${key}`)
              if (!e2) {
                const r2 = (rows2 || [])[0]
                const price =
                  r2 != null
                    ? r2.price ?? r2.cost ?? r2.rate ?? r2.amount ?? null
                    : null
                if (typeof price === 'number') {
                  enriched = { ...enriched, total_amount: price }
                }
              }
            }
          }
        } catch (_) {}
        setOrders((prev) => {
          const updated = [enriched, ...prev]
          return updated.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        })

        // Trigger notification for new orders from Orders Panel real-time subscription
        // This ensures notifications work for ALL order sources (app, website, etc.)
        try {
          console.log('🔔 Orders Panel: Checking if notification should be triggered for order:', enriched)
          
          // Apply the same filtering logic as NotificationContext
          // Since orders now start as 'preparing', check for that status instead
          const isPreparing = enriched.status === 'preparing' || enriched.status === 'PREPARING'
          const isNotAppOrder = enriched.user_id !== APP_USER_ID
          
          console.log('🔍 Orders Panel: Filter check:', {
            status: enriched.status,
            user_id: enriched.user_id,
            isPreparing,
            isNotAppOrder,
            willNotify: isPreparing && isNotAppOrder
          })
          
          // Orders are now added directly to the list via setOrders above
          // Popup notifications are disabled - orders appear directly in the orders panel
          console.log('✅ Orders Panel: New order added directly to list (popup disabled)')
        } catch (error) {
          console.warn('⚠️ Orders Panel: Error triggering notification:', error)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, async (payload) => {
        if (!gotRealtime) {
          gotRealtime = true
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }
        let enriched = payload.new
        try {
          // Preserve existing token if known
          setOrders((prev) => {
            const found = prev.find(o => o.id === payload.new.id)
            const tokenExisting = found && (found.order_token || found.token_no)
            let next = { ...payload.new }
            if (tokenExisting) {
              next.token_no = tokenExisting
              next.order_token = tokenExisting
            }
            // If delivered or cancelled, remove from live; otherwise, update in place
            if (normStatus(next.status) === 'DELIVERED' || normStatus(next.status) === 'CANCELLED') {
              return prev.filter(o => o.id !== next.id)
            }
            const updated = prev.map(o => (o.id === next.id ? next : o))
            // Keep stable FIFO ordering to prevent layout jumps on status change
            return updated.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          })
          // If delivered or cancelled, add to past list
          if (normStatus(payload.new.status) === 'DELIVERED' || normStatus(payload.new.status) === 'CANCELLED') {
            setDelivered((d) => [{ ...enriched, deliveredAt: Date.now() }, ...d.filter((o) => o.id !== enriched.id)])
          }
          return
        } catch (e) {
          // Fallback: simple replace
          if (normStatus(enriched.status) === 'DELIVERED' || normStatus(enriched.status) === 'CANCELLED') {
            setOrders((prev) => prev.filter(o => o.id !== enriched.id))
            setDelivered((d) => [{ ...enriched, deliveredAt: Date.now() }, ...d.filter((o) => o.id !== enriched.id)])
          } else {
            setOrders((prev) => {
              const updated = prev.map(o => (o.id === enriched.id ? enriched : o))
              return updated.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            })
          }
        }
      })
      .subscribe()

    return () => {
      clearTimeout(connectionTimeout)
      if (intervalId) clearInterval(intervalId)
      try { channel.unsubscribe() } catch (e) { /* ignore */ }
    }
  }, [])

  const revertActivity = async (entry) => {
    if (!entry) return
    const { orderId, from, to, prevLoc, nextLoc } = entry
    if (prevLoc === 'live' && nextLoc === 'delivered') {
      // move back from delivered to live with previous status
      const found = delivered.find((o) => o.id === orderId)
      if (!found) return
      setDelivered((d) => d.filter((o) => o.id !== orderId))
      setOrders((prev) => [{ ...found, status: from }, ...prev])
      // record revert in recent updates for Home panel
      setRecent((prev) => [{ orderId, itemName: found.item_name, from: to, to: from, ts: Date.now() }, ...prev])
      // persist to backend so realtime reflects across clients
      try {
        await supabase.rpc('update_order_status_flexible', {
          p_order_id: orderId,
          p_new_status: String(from).toLowerCase(),
        })
      } catch (e) { /* ignore; local state already reflects revert */ }
    } else if (prevLoc === 'live' && nextLoc === 'live') {
      // just status change revert
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: from } : o)))
      // try to find the order name from current state to log the revert
      try {
        const current = orders.find((o) => o.id === orderId)
        const itemName = current?.item_name || 'Order Item'
        setRecent((prev) => [{ orderId, itemName, from: to, to: from, ts: Date.now() }, ...prev])
      } catch (_) { /* ignore */ }
      try {
        await supabase.rpc('update_order_status_flexible', {
          p_order_id: orderId,
          p_new_status: String(from).toLowerCase(),
        })
      } catch (e) { /* ignore */ }
    }
    // Remove the reverted entry from activity to avoid confusion
    setActivity((a) => a.filter((e) => e !== entry))
  }

  // Auto-prune recent updates older than 25 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setRecent((prev) => prev.filter((e) => Date.now() - e.ts < 25000))
      setActivity((prev) => prev.filter((e) => (e.ts ? Date.now() - e.ts < 25000 : true)))
    }, 1000)
    return () => clearInterval(id)
  }, [])
  // Expose current data for the Reports page to access
  useEffect(() => {
    window.__IARE_ORDERS__ = orders
    window.__IARE_DELIVERED__ = delivered
  }, [orders, delivered])

  // Show loading spinner while checking authentication
  if (authLoading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">
              <Loader size={32} className="spinner" />
            </div>
            <h1>Loading...</h1>
            <p>Checking authentication</p>
          </div>
        </div>
      </div>
    )
  }

  // Show login form if not authenticated
  if (!user) {
    return <Login />
  }
  return (
    <div className="app">
      <aside className={`sidebar ${sidebarExpanded ? 'expanded' : 'collapsed'}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          {sidebarExpanded && <h2 className="brand" style={{ margin: 0 }}>IARE Canteen</h2>}
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="sidebar-toggle-btn"
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              backgroundColor: theme === 'dark' ? '#374151' : '#f9fafb',
              color: theme === 'dark' ? '#ffffff' : '#1f2937',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              marginLeft: sidebarExpanded ? '0' : 'auto',
              marginRight: sidebarExpanded ? '0' : 'auto',
              width: '36px',
              height: '36px'
            }}
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarExpanded ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>
        <nav className="nav">
          <NavLink to="/" end title="Home">
            <Home size={20} />
            {sidebarExpanded && <span>Home</span>}
          </NavLink>
          <NavLink to="/place-order" title="Place Order">
            <ShoppingCart size={20} />
            {sidebarExpanded && <span>Place Order</span>}
          </NavLink>
          <NavLink to="/orders" title="Orders">
            <ClipboardList size={20} />
            {sidebarExpanded && <span>Orders</span>}
          </NavLink>
          <NavLink to="/inventory" title="Inventory Management">
            <Package size={20} />
            {sidebarExpanded && <span>Inventory Management</span>}
          </NavLink>
          <NavLink to="/manage-orders" title="Manage Orders">
            <ClipboardClock size={20} />
            {sidebarExpanded && <span>Manage Orders</span>}
          </NavLink>
          <NavLink to="/scan" title="Scan Orders">
            <ScanLine size={20} />
            {sidebarExpanded && <span>Scan Orders</span>}
          </NavLink>
          <NavLink to="/ai" title="AI Predictions">
            <Brain size={20} />
            {sidebarExpanded && <span>AI Predictions</span>}
          </NavLink>
          <NavLink to="/pre-order" title="Pre-Order">
            <ClockArrowUp size={20} />
            {sidebarExpanded && <span>Pre-Order</span>}
          </NavLink>
          <NavLink to="/settings" title="Settings">
            <Settings size={20} />
            {sidebarExpanded && <span>Settings</span>}
          </NavLink>
          
          

          
          
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ margin: 0 }}>{title}</h1>
            {/* Scanner status */}
            
            {scanMessage && (
              <div style={{
                padding: '6px 12px',
                backgroundColor: scanMessage.includes('✅') ? '#d1fae5' : scanMessage.includes('📋') ? '#fef3c7' : '#fee2e2',
                color: scanMessage.includes('✅') ? '#065f46' : scanMessage.includes('📋') ? '#92400e' : '#991b1b',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500',
                animation: 'fadeIn 0.3s ease'
              }}>
                {scanMessage}
              </div>
            )}
            {/* connection status indicator removed per request */}
          </div>
          <div className="header-actions">
          {location.pathname === '/orders' && (
            <>
              <button
                className={`btn orders-btn recent-btn ${ordersView === 'activity' ? 'active' : ''}`}
                onClick={() => {
                  setOrdersView('activity')
                  console.log('📋 Recent orders view activated')
                }}
                disabled={ordersView === 'activity'}
                title="View recent order activity"
              >
                <Clock4 className="w-4 h-4" />
                Recent
              </button>
              <button
                className={`btn orders-btn live-btn ${ordersView === 'live' ? 'active' : ''}`}
                onClick={() => {
                  setOrdersView('live')
                  console.log('🔴 Live orders view activated')
                }}
                disabled={ordersView === 'live'}
                title="View live orders in real-time"
              >
                <Zap className="w-4 h-4" />
                Live
              </button>
              <button
                className={`btn orders-btn past-btn ${ordersView === 'past' ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOrdersView('past')
                  console.log('📜 Past orders view activated, ordersView will be set to:', 'past')
                }}
                disabled={ordersView === 'past'}
                title="View completed orders history"
              >
                <ClipboardClock className="w-4 h-4" />
                Past
              </button>
            </>
          )}
              {location.pathname === '/orders' && ordersView === 'live' && (
                  <button 
                    className={`btn orders-btn picture-btn ${ordersPictureMode ? 'active' : ''}`}
                    onClick={() => {
                      setOrdersPictureMode((v) => !v);
                      console.log(`🖼 Switched to ${ordersPictureMode ? 'List' : 'Picture'} mode`);
                    }}
                    title={`Switch to ${ordersPictureMode ? 'List' : 'Picture'} view`}
                  >
                    {ordersPictureMode ? <List className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                    {ordersPictureMode ? 'List Mode' : 'Picture Mode'}
                </button>
              )}
              {location.pathname === '/orders' && (
                <button 
                  className="btn orders-btn bulk-cancel-btn"
                  onClick={() => {
                    // Trigger bulk cancel from OrdersPage
                    const event = new CustomEvent('openBulkCancel');
                    window.dispatchEvent(event);
                  }}
                  title="Bulk update orders - cancel or mark as delivered"
                >
                  <CircleCheckBig className="w-4 h-4" />
                  Bulk Update
                </button>
              )}
            {location.pathname === '/manage-orders' && (
                <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                backgroundColor: '#fef3c7',
                color: '#92400e',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                border: '1px solid #f59e0b',
                marginRight: '12px'
              }}>
                <span style={{ marginRight: '8px' }}>🚧</span>
                Under Development, Coming Soon!
              </div>
            )}
            <motion.button
              className="theme-toggle-btn bg-white dark:bg-gray-800 text-black dark:text-white transition-colors duration-300"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Toggle Dark Mode"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <motion.div
                animate={{ 
                  rotate: theme === 'dark' ? 180 : 0,
                  scale: theme === 'dark' ? 1.1 : 1
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="text-black dark:text-white"
              >
                {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
              </motion.div>
            </motion.button>
            {location.pathname === '/' && (
              <CanteenStatusToggleSwitch />
            )}
            <details ref={userMenuRef} style={{ position: 'relative', marginLeft: '12px' }} className="user-menu">
              <summary
                style={{
                  listStyle: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '9999px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--panel-bg)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
                className="hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '9999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundImage: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    boxShadow: '0 6px 18px rgba(59,130,246,0.35)'
                  }}
                >
                  {(() => {
                    const fullName = user?.user_metadata?.full_name || ''
                    const email = user?.email || ''
                    const basis = fullName || email
                    const first = String(basis).trim()[0]
                    return (first ? first.toUpperCase() : 'A')
                  })()}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {user?.user_metadata?.full_name || (user?.email ? String(user.email).split('@')[0] : 'Admin')}
                </span>
              </summary>
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  minWidth: 220,
                  backgroundColor: 'var(--panel-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  boxShadow: '0 12px 32px rgba(59,130,246,0.15)',
                  zIndex: 50,
                  overflow: 'hidden'
                }}
              >
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {user?.user_metadata?.full_name || 'Administrator'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{user?.email}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', padding: 6 }}>
                  <NavLink
                    to="/settings"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      color: 'var(--text)',
                      textDecoration: 'none'
                    }}
                    className="hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Settings size={16} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Profile & Settings</span>
                  </NavLink>
                  <button
                    onClick={signOut}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'transparent',
                      border: 'none',
                      color: '#b91c1c',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    className="hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Sign out"
                  >
                    <LogOut size={16} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Sign out</span>
                  </button>
                </div>
              </div>
            </details>
          </div>
        </header>
        {connectionStatus === 'not-configured' ? (
          <div className="home-dashboard">
            <div className="card">
              <h2 style={{ marginTop: 0, color: '#ef4444' }}>⚠️ Supabase Not Configured</h2>
              <div style={{ marginBottom: '16px' }}>
                <p>The app needs Supabase credentials to work properly.</p>
                <p>Please follow these steps:</p>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <h3>1. Get Your Supabase Credentials</h3>
                <p>Go to <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">Supabase Dashboard</a> → Your Project → Settings → API</p>
                <p>Copy your Project URL and anon public key</p>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <h3>2. Create .env File</h3>
                <p>Create a file named <code>.env</code> in the project root with:</p>
                <pre style={{ 
                  backgroundColor: '#f3f4f6', 
                  padding: '12px', 
                  borderRadius: '4px', 
                  fontSize: '14px',
                  overflow: 'auto'
                }}>
{`VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here`}
                </pre>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <h3>3. Restart Development Server</h3>
                <p>After creating the .env file, restart the server:</p>
                <code>npm run dev</code>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <h3>4. Check Console</h3>
                <p>Open browser console (F12) to see connection status and any errors.</p>
              </div>
              <button 
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                🔄 Refresh Page
              </button>
            </div>
          </div>
        ) : connectionStatus === 'checking' ? (
          <div className="home-dashboard">
            <div className="card">
              <h2 style={{ marginTop: 0 }}>🔄 Connecting to Supabase...</h2>
              <p>Please wait while we connect to the database.</p>
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <div className="spinner" style={{ margin: '0 auto' }}></div>
              </div>
              <button 
                className="btn btn-primary"
                onClick={() => setConnectionStatus('connected')}
                style={{ marginTop: '20px' }}
              >
                Continue Anyway (Skip Connection Check)
              </button>
            </div>
          </div>
        ) : connectionStatus === 'error' ? (
          <div className="home-dashboard">
            <div className="card">
              <h2 style={{ marginTop: 0, color: '#ef4444' }}>❌ Connection Error</h2>
              <p>Failed to connect to Supabase. Please check:</p>
              <ul style={{ marginLeft: '20px' }}>
                <li>Your Supabase credentials in .env file</li>
                <li>Internet connection</li>
                <li>Supabase project status</li>
              </ul>
              <button 
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                🔄 Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            <Routes>
              <Route
                path="/"
                element={<HomePage recent={recent} orders={orders} onUpdateStatus={updateOrderStatus} updatingIds={updatingIds} />}
              />
              <Route
                path="/place-order"
                element={
                  <PlaceOrderPage
                    globalCart={globalCart}
                    setGlobalCart={setGlobalCart}
                    globalShowCart={globalShowCart}
                    setGlobalShowCart={setGlobalShowCart}
                    globalCartOrderType={globalCartOrderType}
                    setGlobalCartOrderType={setGlobalCartOrderType}
                    fetchOrders={fetchOrders}
                    printBarcodeReceipt={printBarcodeReceipt}
                  />
                }
              />
              <Route
                path="/orders"
                element={
                  <OrdersPage
                    orders={orders}
                    deliveredOrders={delivered}
                    activity={activity}
                    onUpdateStatus={updateOrderStatus}
                    onRevert={revertActivity}
                    onCancel={showCancelConfirmation}
                    onCancelOrder={cancelOrder}
                    view={ordersView}
                    pictureMode={ordersPictureMode}
                    updatingIds={updatingIds}
                  />
                }
              />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/manage-orders" element={<ManageOrders />} />
              <Route path="/pre-order" element={<PreOrderPanel />} />
              <Route
                path="/scan"
                element={
                  <ScanOrderPage
                    onScan={processScan}
                    scanMessage={scanMessage}
                    lastScannedCode={lastScannedCode}
                    isProcessing={isScannerProcessing}
                  />
                }
              />
              <Route path="/ai" element={<AIPredictionsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </>
        )}
        
        {/* Popup Notification Component */}
        <OrderNotificationPopup />
        
        {/* Barcode scanner listener */}
        <BarcodeScannerListener isEnabled={isScannerEnabled} onScan={processScan} />

        {/* Order details sidebar */}
        <OrderScanModal order={scannedOrder} onClose={closeModal} />

        {/* Cancel Order Confirmation Modal */}
        <AnimatePresence>
          {confirmCancelOrder && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setConfirmCancelOrder(null)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  zIndex: 99998,
                  backdropFilter: 'blur(4px)'
                }}
              />
              
              {/* Confirmation Dialog */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  padding: '24px',
                  zIndex: 99999,
                  maxWidth: '450px',
                  width: '90%',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    outline: 'none'
                }}
                className="dark:!bg-gray-800"
              >
                {/* Header */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    backgroundColor: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '16px'
                  }}>
                    <AlertCircle size={24} style={{ color: '#dc2626' }} />
                  </div>
                  <div>
                    <h3 
                      className="dark:!text-white"
                      style={{ 
                        margin: 0, 
                        fontSize: '18px', 
                        fontWeight: '600', 
                        color: '#111827' 
                      }}
                    >
                      Cancel Order?
                    </h3>
                  </div>
                </div>

                {/* Message */}
                <div 
                  className="dark:!text-gray-300"
                  style={{ 
                    margin: '0 0 16px 0',
                    fontSize: '14px',
                    color: '#6b7280',
                    lineHeight: '1.5'
                  }}
                >
                  Are you sure you want to cancel this order?
                </div>

                {/* Items preview (scrollable, summarized) */}
                <div
                  className="dark:!bg-gray-700 dark:!border-gray-600"
                  style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    margin: '0 0 16px 0',
                    padding: '8px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    background: '#f9fafb'
                  }}
                >
                  {Array.isArray(confirmCancelItems) && confirmCancelItems.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {confirmCancelItems.slice(0, 12).map((it, idx) => (
                        <span key={idx} style={{
                          background: '#eef2ff',
                          color: '#1e3a8a',
                          padding: '4px 8px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}>
                          {(it.food_items?.name || 'Item')} ×{it.quantity || 1}
                        </span>
                      ))}
                      {confirmCancelItems.length > 12 && (
                        <span style={{
                          background: '#fee2e2',
                          color: '#991b1b',
                          padding: '4px 8px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap'
                        }}>
                          +{confirmCancelItems.length - 12} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#374151' }} className="dark:!text-gray-200">
                      <strong>"{confirmCancelOrder.itemName}"</strong>
                    </div>
                  )}
                </div>

                {/* Warning Note */}
                <div style={{
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fbbf24',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '24px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ color: '#f59e0b', marginTop: '2px', flexShrink: 0 }} />
                  <p style={{ 
                    margin: 0, 
                    fontSize: '13px', 
                    color: '#92400e',
                    lineHeight: '1.4'
                  }}>
                    This will mark the order as cancelled and the customer will need to place a new order.
                  </p>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setConfirmCancelOrder(null)}
                    style={{
                      padding: '10px 20px',
                      fontSize: '14px',
                      fontWeight: '500',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    className="dark:!bg-gray-700 dark:!text-gray-200"
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#e5e7eb'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = '#f3f4f6'
                    }}
                  >
                    Keep Order
                  </button>
                  <button
                    onClick={() => cancelOrder(confirmCancelOrder.orderId)}
                    style={{
                      padding: '10px 20px',
                      fontSize: '14px',
                      fontWeight: '500',
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#dc2626'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = '#ef4444'
                    }}
                  >
                    <X size={16} />
                    Cancel Order
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

function Card({ title, children, titleAction }) {
  return (
    <section className="card bg-white dark:bg-gray-800 transition-colors duration-300">
      {title ? (
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="text-black dark:text-white" style={{ margin: 0 }}>{title}</h2>
          {titleAction && (
            <div className="card-title-action" style={{ marginLeft: 'auto' }}>
              {titleAction}
            </div>
          )}
        </div>
      ) : null}
      {children}
    </section>
  )
}
function HomePage({ orders, recent = [], onUpdateStatus, updatingIds = {} }) {
  const navigate = useNavigate()
  const latestOrders = [...orders]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 5)
  const deliveredGlobal = window.__IARE_DELIVERED__ || []
  const totalCount = orders.length + deliveredGlobal.length
  const pendingCount = orders.filter((o) => normStatus(o.status) !== 'READY').length
  const completedCount = deliveredGlobal.length
  
  // Calculate revenue from completed orders
  const revenue = deliveredGlobal.reduce((sum, order) => {
    return sum + (order.total_amount || order.amount || 0)
  }, 0)

  // Calculate live popular items from all orders
  const popularItems = React.useMemo(() => {
    // Combine all orders (current + delivered)
    const allOrders = [...orders, ...deliveredGlobal]
    
    // Count items
    const itemCounts = {}
    allOrders.forEach(order => {
      const itemName = order.item_name || order.item || order.name || 'Unknown Item'
      itemCounts[itemName] = (itemCounts[itemName] || 0) + 1
    })
    
    // Convert to array and sort by count
    const sortedItems = Object.entries(itemCounts)
      .map(([name, count]) => ({ name, orders: count }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 4) // Top 4 items
    
    // Calculate percentages
    const maxCount = sortedItems[0]?.orders || 1
    return sortedItems.map(item => ({
      ...item,
      percentage: Math.round((item.orders / maxCount) * 100)
    }))
  }, [orders, deliveredGlobal])

  const [shortage, setShortage] = useState([])
  
  // Modal states
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false)
  const [showRevertModal, setShowRevertModal] = useState(false)
  const [showReportsModal, setShowReportsModal] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  const [deliveredOrders, setDeliveredOrders] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Export functions for Reports buttons
  const exportCsv = () => {
    const header = ['Order Token', 'Item', 'Total', 'Received At', 'Delivered At']
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"'
    const isoNoMs = (ms) => {
      if (!ms) return ''
      return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
    }
    const lines = deliveredGlobal.map(o => {
      const receivedTs = new Date(o.createdAt).getTime()
      const deliveredTs = new Date(o.deliveredAt).getTime()
      const token = o.token || o.id?.slice(-4)
      
      return [
        esc(token ? ('#' + token) : ''),
        esc(o.item_name || 'Food Item'),
        esc(o.total_amount || o.amount || 0),
        esc(isoNoMs(receivedTs)),
        esc(isoNoMs(deliveredTs))
      ].join(',')
    })
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
      <table border="1">
        <tr><th>Order Token</th><th>Item</th><th>Total</th><th>Received At</th><th>Delivered At</th></tr>
        ${deliveredGlobal.map(o => {
          const token = o.token || o.id?.slice(-4)
          return `<tr>
            <td>${token ? ('#' + token) : ''}</td>
            <td>${o.item_name || 'Food Item'}</td>
            <td>₹${o.total_amount || o.amount || 0}</td>
            <td>${new Date(o.createdAt).toLocaleString()}</td>
            <td>${new Date(o.deliveredAt).toLocaleString()}</td>
          </tr>`
        }).join('')}
      </table></body></html>`
    const blob = new Blob(["\ufeff", html], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports_${new Date().toISOString().slice(0, 10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Fetch out-of-stock items from Supabase food_items for Shortage table
  useEffect(() => {
    const fetchShortage = async () => {
      try {
        const pageSize = 1000
        let from = 0
        let all = []
        while (true) {
          const to = from + pageSize - 1
          const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .range(from, to)
          if (error) throw error
          const batch = data || []
          all = all.concat(batch)
          if (batch.length < pageSize) break
          from += pageSize
        }
        const mapped = all.map((r) => {
          const name = r.name ?? r.item_name ?? r.title ?? r.label ?? 'Item'
          const inStock = (
            (typeof r.available_quantity === 'number' ? r.available_quantity > 0 : undefined) ??
            r.in_stock ?? r.available ?? r.is_available ?? (typeof r.stock === 'number' ? r.stock > 0 : undefined) ??
            (typeof r.status === 'string' ? String(r.status).toLowerCase() === 'in' : undefined) ?? true
          )
          return { name, inStock: !!inStock }
        })
        setShortage(mapped.filter(i => !i.inStock))
      } catch (e) {
        setShortage([])
      }
    }
    fetchShortage()
  }, [])

  // Fetch data when modals are opened
  useEffect(() => {
    if (showAvailabilityModal) {
      fetchMenuItems()
    }
  }, [showAvailabilityModal])

  useEffect(() => {
    if (showRevertModal) {
      fetchDeliveredOrders()
    }
  }, [showRevertModal])

  // Fetch menu items for availability toggle
  const fetchMenuItems = async () => {
    try {
      setLoadingItems(true)
      const { data, error } = await supabase
        .from('food_items')
        .select('*')
        .eq('is_active', true) // Only fetch active items
        .order('name')
      
      if (error) throw error
      setMenuItems(data || [])
    } catch (error) {
      console.error('Error fetching menu items:', error)
      alert('Failed to load menu items')
    } finally {
      setLoadingItems(false)
    }
  }

  // Fetch delivered orders for revert functionality
  const fetchDeliveredOrders = async () => {
    try {
      setLoadingOrders(true)
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (error) throw error
      setDeliveredOrders(data || [])
    } catch (error) {
      console.error('Error fetching delivered orders:', error)
      alert('Failed to load delivered orders')
    } finally {
      setLoadingOrders(false)
    }
  }

  // Toggle item availability
  const toggleItemAvailability = async (itemId, currentStatus) => {
    try {
      const newStatus = !currentStatus
      const item = menuItems.find(item => item.id === itemId)
      
      // Update both is_available and available_quantity fields
      const updateData = {
        is_available: newStatus,
        // If disabling item, set quantity to 0; if enabling, keep current quantity or set to 10
        available_quantity: newStatus ? 
          (item?.available_quantity || 10) : 0
      }
      
      const { error } = await supabase
        .from('food_items')
        .update(updateData)
        .eq('id', itemId)
      
      if (error) throw error
      
      // Update local state optimistically
      setMenuItems(prev => prev.map(item => 
        item.id === itemId ? { 
          ...item, 
          is_available: newStatus,
          available_quantity: updateData.available_quantity
        } : item
      ))
      
      // Show notification
      const message = `${item?.name || 'Item'} ${newStatus ? 'enabled' : 'disabled'} successfully!`
      await showAvailabilityNotification(message, false)
      
    } catch (error) {
      console.error('Error updating item availability:', error)
      // Show error notification
      await showAvailabilityNotification('Failed to update item availability', true)
    }
  }

  // Revert delivered order
  const revertOrder = async (orderId) => {
    if (!confirm('Are you sure you want to revert this order?')) return
    
    try {
      // First get the order details to know which item to restore stock for
      const { data: orderData, error: orderFetchError } = await supabase
        .from('orders')
        .select('item_name')
        .eq('id', orderId)
        .single()

      if (orderFetchError) {
        console.error('❌ Could not fetch order details:', orderFetchError)
        throw orderFetchError
      }

      const { error } = await supabase
        .from('orders')
        .update({ status: 'pending' })
        .eq('id', orderId)
      
      if (error) throw error

      // Restore stock when order is reverted (item returned to inventory)
      console.log('📦 Order reverted, restoring stock for:', orderData.item_name)
      try {
        // First get current stock
        const { data: currentStock, error: stockFetchError } = await supabase
          .from('food_items')
          .select('available_quantity')
          .eq('name', orderData.item_name)
          .single()

        if (stockFetchError) {
          console.error('❌ Could not fetch current stock for restore:', stockFetchError)
          return
        }

        const newQuantity = currentStock.available_quantity + 1
        const { error: stockUpdateError } = await supabase
          .from('food_items')
          .update({
            available_quantity: newQuantity,
            is_available: true, // Set to available when stock is restored
            updated_at: new Date().toISOString()
          })
          .eq('name', orderData.item_name)

        if (stockUpdateError) {
          console.error('❌ Failed to restore stock on revert:', stockUpdateError)
          console.warn('⚠️ Order reverted but stock not restored. Please update manually.')
        } else {
          console.log('✅ Stock restored on revert (marked as available)')

          // Refresh menu items to show updated stock
          if (globalRefreshMenuItems) {
            globalRefreshMenuItems()
          }
        }
      } catch (stockErr) {
        console.error('❌ Stock restoration error:', stockErr)
      }

      // Update local state optimistically
      setDeliveredOrders(prev => prev.filter(order => order.id !== orderId))
      
      alert('Order reverted successfully! Stock has been restored.')
    } catch (error) {
      console.error('Error reverting order:', error)
      alert('Failed to revert order')
    }
  }

  return (
    <div className="home-dashboard">
      {/* Top Row: Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-icon">
            <ClipboardList className="w-6 h-6" />
            </div>
          <div className="summary-content">
            <div className="summary-value">{totalCount}</div>
            <div className="summary-label">Total Orders</div>
            </div>
            </div>
        <div className="summary-card">
          <div className="summary-icon">
            <ClockArrowUp className="w-6 h-6" />
          </div>
          <div className="summary-content">
            <div className="summary-value">{pendingCount}</div>
            <div className="summary-label">Pending</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">
            <CircleCheckBig className="w-6 h-6" />
          </div>
          <div className="summary-content">
            <div className="summary-value">{completedCount}</div>
            <div className="summary-label">Completed</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">
            <HandCoins className="w-6 h-6" />
          </div>
          <div className="summary-content">
            <div className="summary-value">₹{revenue}</div>
            <div className="summary-label">Revenue</div>
          </div>
        </div>
      </div>

      {/* Middle Row: Charts */}
      <div className="charts-section">
        <Card title="Quick Actions">
          <div className="quick-actions-grid">
            <button 
              className="quick-action-btn toggle-availability-btn bg-gray-100 dark:bg-gray-700 text-black dark:text-white transition-colors duration-300"
              onClick={() => setShowAvailabilityModal(true)}
            >
              <UtensilsCrossed className="btn-icon text-black dark:text-white" size={24} />
              <div className="btn-text text-black dark:text-white">Toggle Item Availability</div>
            </button>
            
          </div>
        </Card>
      </div>

      {/* Bottom Row: Reports Table */}
      <div className="reports-section">
        <Card title="Reports" titleAction={
          <button 
            className="reports-shortcut-btn"
            onClick={() => setShowReportsModal(true)}
          >
            View Full Reports
          </button>
        }>
          <div className="reports-preview">
            <div className="reports-buttons">
              <button 
                className="reports-btn export-csv-btn"
                onClick={exportCsv}
              >
                Export CSV
              </button>
              <button 
                className="reports-btn export-excel-btn"
                onClick={exportExcel}
              >
                Export Excel
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Availability Toggle Modal */}
      {showAvailabilityModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Toggle Item Availability</h3>
              <button 
                className="modal-close"
                onClick={() => setShowAvailabilityModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {loadingItems ? (
                <div className="loading">Loading items...</div>
              ) : (
                <div className="items-list">
                  {menuItems.map((item) => (
                    <div key={item.id} className="item-row">
                      <span className="item-name">{item.name}</span>
                      <div className="availability-toggle">
                        <span className={`availability-badge ${item.is_available ? 'on' : 'off'}`}>
                          {item.is_available ? 'On' : 'Off'}
                        </span>
                        <label className="toggle-switch" aria-label={`Toggle availability for ${item.name}`}>
                          <input
                            type="checkbox"
                            checked={item.is_available || false}
                            onChange={() => toggleItemAvailability(item.id, item.is_available || false)}
                          />
                          <span className="slider"></span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Revert Delivered Orders Modal */}
      {showRevertModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Revert Delivered Orders</h3>
              <button 
                className="modal-close"
                onClick={() => setShowRevertModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {loadingOrders ? (
                <div className="loading">Loading orders...</div>
              ) : (
                <div className="orders-list">
                  {deliveredOrders.length === 0 ? (
                    <div className="no-orders">No delivered orders found</div>
                  ) : (
                  deliveredOrders.map((order) => {
                    const token = order.token_no ?? order.order_token ?? null
                    const tokenLabel = token ? ('#' + token) : (order.id ? ('#' + String(order.id).slice(-4)) : 'N/A')
                    const createdAt = order.created_at || order.createdAt || order.received_at
                    const deliveredAt = order.delivered_at || order.deliveredAt || order.updated_at
                    const total = order.total_amount ?? order.total ?? order.amount
                    return (
                      <div key={order.id} className="order-row">
                        <div className="order-info">
                          <div className="order-id" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tokenLabel}</div>
                          <div className="order-item">{order.item_name || order.item || 'Food Item'}</div>
                          <div className="order-time" style={{ fontSize: '12px', color: '#6b7280' }}>
                            {createdAt ? new Date(createdAt).toLocaleString() : ''}
                            {deliveredAt ? ` → ${new Date(deliveredAt).toLocaleString()}` : ''}
                            {typeof total === 'number' ? ` • ₹${total}` : ''}
                          </div>
                        </div>
                        <button 
                          className="revert-btn"
                          onClick={() => revertOrder(order.id)}
                        >
                          Revert
                        </button>
                      </div>
                    )
                  })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reports Modal */}
      {showReportsModal && (
        <div className="modal-overlay">
          <div className="modal-content reports-modal">
            <div className="modal-header">
              <h3>Reports</h3>
              <button 
                className="modal-close"
                onClick={() => setShowReportsModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <ReportsModalContent />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
function ReportsModalContent() {
  const [from, setFrom] = useState(() => new Date(Date.now()-24*60*60*1000).toISOString().slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [dataDelivered, setDataDelivered] = useState([])

  useEffect(() => {
    const fetchDeliveredOrders = async () => {
      try {
        if (window.__IARE_DELIVERED__ && window.__IARE_DELIVERED__.length > 0) {
          setDataDelivered(window.__IARE_DELIVERED__)
        } else {
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'DELIVERED')
            .order('created_at', { ascending: false })
          
          if (error) throw error
          setDataDelivered(data || [])
        }
      } catch (e) {
        console.error('Failed to fetch delivered orders:', e)
        setDataDelivered([])
      }
    }
    
    fetchDeliveredOrders()
  }, [])

  const toValidMs = (ts) => {
    const d = new Date(ts)
    return isNaN(d) ? null : d.getTime()
  }

  const displayRows = dataDelivered
    .filter(o => {
      const receivedTs = toValidMs(o.created_at || o.createdAt || o.received_at)
      const deliveredTs = toValidMs(o.delivered_at || o.deliveredAt || o.updated_at)
      const fromMs = new Date(from).getTime()
      const toMs = new Date(to).getTime() + 24*60*60*1000 - 1
      return receivedTs && receivedTs >= fromMs && receivedTs <= toMs
    })
    .map(o => {
      const receivedTs = toValidMs(o.created_at || o.createdAt || o.received_at)
      const deliveredTs = toValidMs(o.delivered_at || o.deliveredAt || o.updated_at)
      const token = o.token_no ?? o.order_token ?? o.token ?? o.token_number ?? o.id ?? null
      
      return {
        id: o.id,
        token: token,
        item: o.item_name || o.item || 'Food Item',
        total_amount: o.total_amount || o.total || o.price || 0,
        receivedTs: receivedTs,
        deliveredTs: deliveredTs
      }
    })

  const totals = displayRows.reduce((acc, r) => ({
    orders: acc.orders + 1,
    revenue: acc.revenue + (r.total_amount || 0),
    items: acc.items + 1,
    PENDING: acc.PENDING + (normStatus(r.status) === 'PENDING' ? 1 : 0),
    PREPARING: acc.PREPARING + (normStatus(r.status) === 'PREPARING' ? 1 : 0),
    READY: acc.READY + (normStatus(r.status) === 'READY' ? 1 : 0)
  }), { orders: 0, revenue: 0, items: 0, PENDING: 0, PREPARING: 0, READY: 0 })

  const exportCsv = () => {
    const header = ['Order Token', 'Item', 'Total', 'Received At', 'Delivered At']
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"'
    const isoNoMs = (ms) => {
      if (!ms) return ''
      return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
    }
    const lines = displayRows.map(r => [
      esc(r.token ? ('#' + r.token) : ''),
      esc(r.item),
      esc(r.total_amount || 0),
      esc(isoNoMs(r.receivedTs)),
      esc(isoNoMs(r.deliveredTs))
    ].join(','))
    const summary = ["", esc('Total Revenue'), esc(totals.revenue)].join(',')
    const csv = [header.join(','), ...lines, '', summary].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
      <table border="1">
        <tr><th>Order Token</th><th>Item</th><th>Total</th><th>Received At</th><th>Delivered At</th></tr>
        ${displayRows.map(r => `<tr>
          <td>${r.token ? ('#' + r.token) : ''}</td>
          <td>${r.item}</td>
          <td>₹${r.total_amount || 0}</td>
          <td>${new Date(r.receivedTs).toLocaleString()}</td>
          <td>${new Date(r.deliveredTs).toLocaleString()}</td>
        </tr>`).join('')}
        <tr><td colspan="2"><strong>Total Revenue</strong></td><td><strong>₹${totals.revenue}</strong></td><td colspan="2"></td></tr>
      </table></body></html>`
    const blob = new Blob(["\ufeff", html], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports_${from}_to_${to}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="reports-modal-content">
      <div className="reports-filters">
        <div className="field" style={{minWidth: 220}}>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{minWidth: 220}}>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" onClick={exportCsv}>Export CSV</button>
          <button className="btn" onClick={exportExcel}>Export Excel</button>
        </div>
      </div>


      <div className="reports-table">
          <table className="table">
            <thead>
              <tr>
              <th>Order Token</th>
              <th>Item</th>
              <th>Total</th>
              <th>Received</th>
              <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
            {displayRows.slice(0, 10).map((r) => (
              <tr key={r.id}>
                <td>{r.token ? ('#' + r.token) : ''}</td>
                <td>{r.item}</td>
                <td>₹{r.total_amount || 0}</td>
                <td>{new Date(r.receivedTs).toLocaleString()}</td>
                <td>{new Date(r.deliveredTs).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        {displayRows.length > 10 && (
          <div className="table-note">
            Showing first 10 of {displayRows.length} orders. Export to see all data.
      </div>
        )}

      </div>
    </div>
  )
}
function PlaceOrderPage({ 
  globalCart, 
  setGlobalCart, 
  globalShowCart,
  setGlobalShowCart,
  globalCartOrderType,
  setGlobalCartOrderType,
  fetchOrders,
  printBarcodeReceipt
}) {
  const [placingOrderId, setPlacingOrderId] = useState(null)
  const [lastToken, setLastToken] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [counterTokens, setCounterTokens] = useState([])
  const [loadingCounter, setLoadingCounter] = useState(false)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [viewMode, setViewMode] = useState('button') // 'list', 'card', or 'button'
  const [selectedItemIndex, setSelectedItemIndex] = useState(0) // For keyboard navigation
  const searchInputRef = useRef(null) // Ref for auto-focus
  const gridRef = useRef(null)
  const [itemsPerRow, setItemsPerRow] = useState(5)
  // Use canteen status from context instead of local state
  const { status: canteenStatus, updateStatus, refreshStatus } = useCanteenStatus()
  // Use global cart state instead of local state
  const cart = globalCart
  const setCart = setGlobalCart
  const showCart = globalShowCart
  const setShowCart = setGlobalShowCart
  const cartOrderType = globalCartOrderType
  const setCartOrderType = setGlobalCartOrderType
  const [showConfirmModal, setShowConfirmModal] = useState(null) // { title, message, confirmText, confirmStyle, onConfirm }
  const { suppressNotificationForOrder, showOrderNotification } = useNotification()
  const serialBufferRef = useRef('')
  const serialTimerRef = useRef(null)
  const [processingCheckout, setProcessingCheckout] = useState(false)
  const recentCheckoutRef = useRef({ hash: null, ts: 0 })
  
  // Helper function to check if an item matches the selected category
  const matchesCategory = (item) => {
    if (selectedCategory === 'all') return true
    
    // Handle combined "Lunch" category (includes Cuisine, Lunch, and Beverages)
    if (selectedCategory === 'lunch') {
      // Find the original categories to get their IDs
      const cuisineCategory = categories.find(c => c.name.toLowerCase() === 'cuisine')
      const lunchCategory = categories.find(c => c.name.toLowerCase() === 'lunch')
      const beveragesCategory = categories.find(c => {
        const n = (c.name || '').toLowerCase()
        return n === 'beverages' || n === 'beverage'
      })
      return (
        item.categoryId === cuisineCategory?.id ||
        item.categoryId === lunchCategory?.id ||
        item.categoryId === beveragesCategory?.id
      )
    }
    
  // Handle combined "Breakfast" category (includes Snacks, Breakfast, and Beverages)
  if (selectedCategory === 'breakfast') {
    // Find the original categories to get their IDs
    const snacksCategory = categories.find(c => c.name.toLowerCase() === 'snacks')
    const breakfastCategory = categories.find(c => c.name.toLowerCase() === 'breakfast')
    const beveragesCategory = categories.find(c => {
      const n = (c.name || '').toLowerCase()
      return n === 'beverages' || n === 'beverage'
    })
    return (
      item.categoryId === snacksCategory?.id ||
      item.categoryId === breakfastCategory?.id ||
      item.categoryId === beveragesCategory?.id
    )
  }
    
    return item.categoryId === selectedCategory
  }

  // Helper function to get filtered items for keyboard navigation
  const getFilteredItems = () => {
    const filtered = menuItems.filter(matchesCategory)
    
    // Special sorting for Breakfast category: breakfast items first, then beverages
    if (selectedCategory === 'breakfast') {
      const snacksCategory = categories.find(c => c.name.toLowerCase() === 'snacks')
      const breakfastCategory = categories.find(c => c.name.toLowerCase() === 'breakfast')
      const beveragesCategory = categories.find(c => {
        const n = (c.name || '').toLowerCase()
        return n === 'beverages' || n === 'beverage'
      })
      
      const breakfastItems = filtered.filter(item => 
        item.categoryId === snacksCategory?.id || item.categoryId === breakfastCategory?.id
      )
      const beverageItems = filtered.filter(item => 
        item.categoryId === beveragesCategory?.id
      )
      
      // Sort each group separately, then combine
      const sortItems = (items) => {
        return items.sort((a, b) => {
          // Primary sort: In stock items first, out of stock items last
          const aInStock = a.inStock ? 1 : 0
          const bInStock = b.inStock ? 1 : 0
          if (aInStock !== bInStock) {
            return bInStock - aInStock
          }
          
          // Secondary sort: If search query exists, prioritize items starting with the search text
          const q = search.trim().toLowerCase()
          const nameA = String(a.name || '').toLowerCase()
          const nameB = String(b.name || '').toLowerCase()
          
          if (q) {
            const aStartsWith = nameA.startsWith(q)
            const bStartsWith = nameB.startsWith(q)
            if (aStartsWith && !bStartsWith) return -1
            if (!aStartsWith && bStartsWith) return 1
          }
          
          // Tertiary sort: Alphabetically
          return nameA.localeCompare(nameB)
        })
      }
      
      return [...sortItems(breakfastItems), ...sortItems(beverageItems)]
    }
    
    // Special sorting for Lunch category: lunch items first, then beverages
    if (selectedCategory === 'lunch') {
      const cuisineCategory = categories.find(c => c.name.toLowerCase() === 'cuisine')
      const lunchCategory = categories.find(c => c.name.toLowerCase() === 'lunch')
      const beveragesCategory = categories.find(c => {
        const n = (c.name || '').toLowerCase()
        return n === 'beverages' || n === 'beverage'
      })
      
      const lunchItems = filtered.filter(item => 
        item.categoryId === cuisineCategory?.id || item.categoryId === lunchCategory?.id
      )
      const beverageItems = filtered.filter(item => 
        item.categoryId === beveragesCategory?.id
      )
      
      // Sort each group separately, then combine
      const sortItems = (items) => {
        return items.sort((a, b) => {
          // Primary sort: In stock items first, out of stock items last
          const aInStock = a.inStock ? 1 : 0
          const bInStock = b.inStock ? 1 : 0
          if (aInStock !== bInStock) {
            return bInStock - aInStock
          }
          
          // Secondary sort: If search query exists, prioritize items starting with the search text
          const q = search.trim().toLowerCase()
          const nameA = String(a.name || '').toLowerCase()
          const nameB = String(b.name || '').toLowerCase()
          
          if (q) {
            const aStartsWith = nameA.startsWith(q)
            const bStartsWith = nameB.startsWith(q)
            if (aStartsWith && !bStartsWith) return -1
            if (!aStartsWith && bStartsWith) return 1
          }
          
          // Tertiary sort: Alphabetically
          return nameA.localeCompare(nameB)
        })
      }
      
      return [...sortItems(lunchItems), ...sortItems(beverageItems)]
    }
    
    // Default sorting for other categories
    return filtered.sort((a, b) => {
      // Primary sort: In stock items first, out of stock items last
      const aInStock = a.inStock ? 1 : 0
      const bInStock = b.inStock ? 1 : 0
      if (aInStock !== bInStock) {
        return bInStock - aInStock
      }
      
      // Secondary sort: If search query exists, prioritize items starting with the search text
      const q = search.trim().toLowerCase()
      const nameA = String(a.name || '').toLowerCase()
      const nameB = String(b.name || '').toLowerCase()
      
      if (q) {
        const aStartsWith = nameA.startsWith(q)
        const bStartsWith = nameB.startsWith(q)
        if (aStartsWith && !bStartsWith) return -1
        if (!aStartsWith && bStartsWith) return 1
      }
      
      // Tertiary sort: Alphabetically
      return nameA.localeCompare(nameB)
    })
      .map((item, index) => ({ ...item, displayNumber: index + 1 }))
      .filter(it => {
        const raw = search.trim().toLowerCase()
        if (!raw) return true
        const tokens = raw.split(/[\s,]+/).filter(Boolean)
        if (tokens.length === 0) return true
        const nameLc = String(it.name || '').toLowerCase()
        const serialStr = String(it.displayNumber)
        return tokens.some(tok => {
          if (!tok) return false
          // If token is numeric, match serial exactly; else name includes
          if (/^\d+$/.test(tok)) {
            return serialStr === tok
          }
          return nameLc.includes(tok)
        })
      })
  }
  
  // Search input will only be focused when Ctrl+S is pressed

  // Reset selected index when search or category changes
  useEffect(() => {
    // Reset to the first in-stock item (fallback to 0)
    const items = getFilteredItems()
    if (!items || items.length === 0) {
      setSelectedItemIndex(0)
      return
    }
    const firstInStock = items.findIndex((it) => !!it.inStock)
    setSelectedItemIndex(firstInStock >= 0 ? firstInStock : 0)
  }, [search, selectedCategory])

  // Reset selected index when panel opens
  useEffect(() => {
    setSelectedItemIndex(0)
  }, [])

  // Calculate items per row dynamically
  useEffect(() => {
    const computeItemsPerRow = () => {
      const el = gridRef.current
      if (!el) return
      
      const children = Array.from(el.children)
      if (children.length > 0) {
        const firstChild = children[0]
        const firstChildRect = firstChild.getBoundingClientRect()
        
        let columns = 0
        for (let i = 0; i < children.length; i++) {
          const childRect = children[i].getBoundingClientRect()
          if (Math.abs(childRect.top - firstChildRect.top) < 5) {
            columns++
          } else {
            break
          }
        }
        
        if (columns > 0) {
          setItemsPerRow(columns)
        }
      }
    }
    
    const timeoutId = setTimeout(computeItemsPerRow, 100)
    window.addEventListener('resize', computeItemsPerRow)

    // Also track grid container size changes (e.g., expand/collapse sidebars)
    let resizeObserver
    if (window.ResizeObserver && gridRef.current) {
      resizeObserver = new ResizeObserver(() => computeItemsPerRow())
      resizeObserver.observe(gridRef.current)
    }
    
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', computeItemsPerRow)
      if (resizeObserver) {
        try { resizeObserver.disconnect() } catch (_) {}
      }
    }
  }, [menuItems.length, selectedCategory, search])
  // Simple left-right navigation
  useEffect(() => {
    // Helper to move to next/previous in-stock item with wrap-around
    const findNextInStockIndex = (startIndex, step, list) => {
      if (!list || list.length === 0) return 0
      // If current index is invalid, normalize it
      let current = Math.min(Math.max(startIndex, 0), list.length - 1)
      let i = current
      for (let count = 0; count < list.length; count++) {
        i = (i + step + list.length) % list.length
        if (list[i] && list[i].inStock) return i
      }
      // No in-stock items found; stay where we are
      return current
    }

    // Helper to move vertically to same column in next/prev row, wrapping rows.
    // If the immediate target row has no in-stock items, continue searching
    // subsequent rows (wrapping) until one is found. If none found, stay put.
    const findVerticalInStockIndex = (startIndex, direction, list) => {
      if (!list || list.length === 0) return 0
      const total = list.length
      const perRow = Math.max(1, itemsPerRow)
      const totalRows = Math.ceil(total / perRow)
      const currentIndex = Math.min(Math.max(startIndex, 0), total - 1)
      const currentRow = Math.floor(currentIndex / perRow)
      const currentCol = currentIndex % perRow

      // Try each row once, starting from the next/previous row, wrapping.
      for (let step = 1; step <= totalRows; step++) {
        const targetRow = (currentRow + direction * step + totalRows) % totalRows
        const rowStart = targetRow * perRow
        const isLastRow = targetRow === totalRows - 1
        const rowLen = isLastRow ? (total - rowStart) : perRow
        if (rowLen <= 0) continue

        // Clamp column within the row length
        const startColInRow = Math.min(currentCol, rowLen - 1)

        // Prefer exact same column, then scan within row (wrapping) to find first in-stock
        for (let k = 0; k < rowLen; k++) {
          const col = (startColInRow + k) % rowLen
          const idx = rowStart + col
          if (list[idx] && list[idx].inStock) return idx
        }
      }
      // No in-stock item found in any row; remain on current selection
      return currentIndex
    }
    const handleKeyDown = (e) => {
      // Only handle navigation when not typing in search box
      if (e.target === searchInputRef.current) {
        const baseAllowed = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter']
        const allowBackspace = (e.key === 'Backspace' && !search)
        const allowed = baseAllowed.includes(e.key) || allowBackspace
        if (allowed) {
          e.preventDefault()
        } else {
          return // Allow normal typing in search box
        }
      }

      const filteredItems = getFilteredItems()
      if (filteredItems.length === 0) return

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          // Move to next in-stock item
          setSelectedItemIndex(prev => findNextInStockIndex(prev, +1, filteredItems))
          break
        case 'ArrowLeft':
          e.preventDefault()
          // Move to previous in-stock item
          setSelectedItemIndex(prev => findNextInStockIndex(prev, -1, filteredItems))
          break
        case 'ArrowDown':
          e.preventDefault()
          // Move to same column in next row (wrap to first row), prefer in-stock
          setSelectedItemIndex(prev => findVerticalInStockIndex(prev, +1, filteredItems))
          break
        case 'ArrowUp':
          e.preventDefault()
          // Move to same column in previous row (wrap to last row), prefer in-stock
          setSelectedItemIndex(prev => findVerticalInStockIndex(prev, -1, filteredItems))
          break
        case 'Enter':
          e.preventDefault()
          // If user typed a serial number, use it to add that item
          if (serialBufferRef.current) {
            const buf = serialBufferRef.current
            serialBufferRef.current = ''
            const n = parseInt(buf, 10)
            if (!isNaN(n) && n > 0) {
              const items = getFilteredItems()
              const item = items[n - 1]
              if (item && canteenStatus !== 'closed' && item.inStock) {
                const currentQuantity = cart.find(ci => ci.id === item.id)?.quantity || 0
                if (currentQuantity === 0) {
                  addToCart(item, 1)
                } else {
                  updateCartItemQuantity(item.id, currentQuantity + 1)
                }
                setSelectedItemIndex(Math.min(n - 1, Math.max(0, items.length - 1)))
              }
            }
            break
          }
          // If confirmation modal is open, handle Enter as confirmation
          if (showConfirmModal) {
            if (showConfirmModal.onConfirm) {
              try { 
                showConfirmModal.onConfirm() 
              } finally { 
                setShowConfirmModal(null) 
              }
            }
            return
          }
          
          if (e.shiftKey) {
            // Shift+Enter → Checkout (only if cart has items)
            if (Array.isArray(cart) && cart.length > 0) {
              handleCheckout(cartOrderType)
            }
          } else {
            // Plain Enter → add selected item by +1
            const selectedItem = filteredItems[selectedItemIndex]
            if (selectedItem && canteenStatus !== 'closed' && selectedItem.inStock) {
              const currentQuantity = cart.find(ci => ci.id === selectedItem.id)?.quantity || 0
              if (currentQuantity === 0) {
                addToCart(selectedItem, 1)
              } else {
                updateCartItemQuantity(selectedItem.id, currentQuantity + 1)
              }
            }
          }
          break
        case 'Backspace':
          e.preventDefault()
          // If user typed a serial number, decrement that item's quantity
          if (serialBufferRef.current) {
            const buf = serialBufferRef.current
            serialBufferRef.current = ''
            const n = parseInt(buf, 10)
            if (!isNaN(n) && n > 0) {
              const items = getFilteredItems()
              const item = items[n - 1]
              if (item) {
                const currentQuantity = cart.find(ci => ci.id === item.id)?.quantity || 0
                if (currentQuantity > 1) {
                  updateCartItemQuantity(item.id, currentQuantity - 1)
                } else if (currentQuantity === 1) {
                  if (typeof removeFromCart === 'function') {
                    removeFromCart(item.id)
                  } else {
                    updateCartItemQuantity(item.id, 0)
                  }
                }
              }
            }
            break
          }
          if (e.shiftKey) {
            // Shift+Backspace → Clear Cart (with confirmation)
            if (Array.isArray(cart) && cart.length > 0) {
              setShowConfirmModal({
                title: 'Clear Cart?',
                message: 'This will remove all items from the cart. You cannot undo this action.',
                confirmText: 'Clear Cart',
                confirmStyle: 'danger',
                onConfirm: () => {
                  setCart([])
                  setToastMessage({ type: 'success', message: 'Cart cleared!' })
                  setTimeout(() => setToastMessage(null), 2000)
                }
              })
            }
          } else {
            // Plain Backspace → decrease selected item quantity
            const selectedItem = filteredItems[selectedItemIndex]
            if (selectedItem) {
              const currentQuantity = cart.find(ci => ci.id === selectedItem.id)?.quantity || 0
              if (currentQuantity > 1) {
                updateCartItemQuantity(selectedItem.id, currentQuantity - 1)
              } else if (currentQuantity === 1) {
                if (typeof removeFromCart === 'function') {
                  removeFromCart(selectedItem.id)
                } else {
                  updateCartItemQuantity(selectedItem.id, 0)
                }
              }
            }
          }
          break
        case 'Escape':
          e.preventDefault()
          // If confirmation modal is open, handle Escape as cancel
          if (showConfirmModal) {
            setShowConfirmModal(null)
            return
          }
          break
        case 's':
          // Ctrl+S → Focus search input
          if (e.ctrlKey) {
            e.preventDefault()
            if (searchInputRef.current) {
              searchInputRef.current.focus()
            }
          }
          break
        default: {
          // Numeric shortcuts: type serial number to add that item
          if (/^\d$/.test(e.key)) {
            serialBufferRef.current = (serialBufferRef.current + e.key).slice(0, 4)
            if (serialTimerRef.current) clearTimeout(serialTimerRef.current)
            serialTimerRef.current = setTimeout(() => {
              const buf = serialBufferRef.current
              serialBufferRef.current = ''
              const n = parseInt(buf, 10)
              if (!isNaN(n) && n > 0) {
                const items = getFilteredItems()
                const item = items[n - 1]
                if (item && canteenStatus !== 'closed' && item.inStock) {
                  const currentQuantity = cart.find(ci => ci.id === item.id)?.quantity || 0
                  if (currentQuantity === 0) {
                    addToCart(item, 1)
                  } else {
                    updateCartItemQuantity(item.id, currentQuantity + 1)
                  }
                  setSelectedItemIndex(Math.min(n - 1, Math.max(0, items.length - 1)))
                }
              }
            }, 500)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (serialTimerRef.current) clearTimeout(serialTimerRef.current)
    }
  }, [selectedItemIndex, cart, canteenStatus, getFilteredItems, showConfirmModal])

  // Scroll to selected item or first item
  useEffect(() => {
    const scrollToItem = () => {
      if (selectedItemIndex === 0) {
        // When at first item or no selection, scroll to first item
        const firstElement = document.getElementById('po-item-btn-0')
        if (firstElement) {
          firstElement.scrollIntoView({ 
            block: 'start', 
            inline: 'nearest', 
            behavior: 'smooth' 
          })
        }
      } else {
        // When item is selected, scroll to that item
        const selectedElement = document.getElementById(`po-item-btn-${selectedItemIndex}`)
        if (selectedElement) {
          selectedElement.scrollIntoView({ 
            block: 'center', 
            inline: 'nearest', 
            behavior: 'smooth' 
          })
        }
      }
    }
    
    // Small delay to ensure DOM is ready
    const timer = setTimeout(scrollToItem, 50)
    return () => clearTimeout(timer)
  }, [selectedItemIndex])

  // Navigation will work without auto-focusing the search input
  
  // Custom notification function for availability changes
  const showAvailabilityNotification = async (message, isError = false) => {
    console.log('🔔 showAvailabilityNotification called with:', { message, isError })
    
    try {
      // Show popup notification using the notification context (no sound)
      const notificationData = {
        item_name: message,
        order_token: `AVAIL-${Date.now()}`,
        total_amount: 0,
        order_type: isError ? 'error' : 'availability_change',
        user_id: APP_USER_ID,
        isAvailabilityChange: !isError,
        isError: isError,
        id: `availability-${Date.now()}`
      }
      
      console.log('🔔 Showing popup notification:', notificationData)
      await showOrderNotification(notificationData)
      console.log('✅ Popup notification triggered successfully')
      
    } catch (error) {
      console.warn('⚠️ Notification failed, using fallback:', error)
      // Fallback to simple alert (no sound)
        alert(isError ? `❌ ${message}` : `✅ ${message}`)
        console.log('✅ Fallback notification shown')
    }
  }
  const [toastMessage, setToastMessage] = useState(null)

  // Cart management functions
  const addToCart = (item, quantity = 1) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(cartItem => cartItem.id === item.id)
      if (existingItem) {
        return prevCart.map(cartItem =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem
        )
      } else {
        return [...prevCart, { ...item, quantity }]
      }
    })
  }

  const updateCartItemQuantity = (itemId, newQuantity) => {
    // Ensure quantity is always at least 1 to prevent accidental deletion
    const safeQuantity = Math.max(1, newQuantity || 1)
    
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === itemId ? { ...item, quantity: safeQuantity } : item
      )
    )
  }

  const removeFromCart = (itemId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId))
  }

  const clearCart = () => {
    setCart([])
  }

  const getCartTotal = () => {
    const TAKEAWAY_SURCHARGE = 10 // ₹10 per item for takeaway
    const isTakeaway = cartOrderType === 'takeaway'
    
    return cart.reduce((total, item) => {
      const pricePerUnit = isTakeaway ? (item.price + TAKEAWAY_SURCHARGE) : item.price
      return total + (pricePerUnit * item.quantity)
    }, 0)
  }

  const getCartSubtotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0)
  }

  const getTakeawaySurcharge = () => {
    const TAKEAWAY_SURCHARGE = 10
    if (cartOrderType !== 'takeaway') return 0
    return cart.reduce((total, item) => total + (TAKEAWAY_SURCHARGE * item.quantity), 0)
  }

  const getCartItemCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0)
  }

  // Canteen status is now managed by CanteenStatusContext

  // Load items from Supabase `food_items` table (replaces testing items)
  useEffect(() => {
    const fetchFoodItems = async () => {
      try {
        const pageSize = 1000
        let from = 0
        let all = []
        while (true) {
          const to = from + pageSize - 1
          const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .eq('is_active', true)  // Only fetch active items (not removed)
            .range(from, to)
          if (error) throw error
          const batch = data || []
          all = all.concat(batch)
          if (batch.length < pageSize) break
          from += pageSize
        }
        const mapped = all.map((r) => ({
          id: r.id ?? r.item_id ?? r.slug ?? String(Math.random()).slice(2),
          name: r.name ?? r.item_name ?? 'Item',
          price: r.price ?? r.cost ?? 0,
          image: r.image_url ?? r.image ?? r.photo ?? 'https://via.placeholder.com/300?text=Food',
            description: r.description ?? '',
            availableQuantity: r.available_quantity ?? 0,
            isAvailable: r.is_available ?? true,
            inStock: (r.is_available !== false) && (r.available_quantity > 0),
            categoryId: r.category_id ?? null,
            serialNumber: r.serial_number ?? null // Serial number from database
        }))
        
        // Sort by serial number if available, otherwise by name
        const sorted = mapped.sort((a, b) => {
          // If both have serial numbers, sort by serial number
          if (a.serialNumber != null && b.serialNumber != null) {
            return a.serialNumber - b.serialNumber
          }
          // Items with serial numbers come first
          if (a.serialNumber != null && b.serialNumber == null) return -1
          if (a.serialNumber == null && b.serialNumber != null) return 1
          // If neither has serial number, sort alphabetically
          return (a.name || '').localeCompare(b.name || '')
        })
        // If no items loaded from database, use fallback items
        if (sorted.length === 0) {
          console.log('No food items found in database, using fallback items')
          const fallbackItems = [
            {
              id: 'fallback_1',
              name: 'Veg Biryani',
              price: 180,
              image: 'https://as1.ftcdn.net/v2/jpg/04/59/27/88/1000_F_459278894_92eSlejnR7NSwJRCbVyy9ZZibSmjbF8q.jpg',
              description: 'Delicious vegetarian biryani',
              serialNumber: 1
            },
            {
              id: 'fallback_2',
              name: 'Masala Dosa',
              price: 80,
              image: 'https://as2.ftcdn.net/v2/jpg/14/45/94/59/1000_F_1445945944_eBUM7ot1AWezNkqknKsRImNvLvFbmr7z.jpg',
              description: 'Crispy dosa with potato filling',
              serialNumber: 2
            },
            {
              id: 'fallback_3',
              name: 'Samosa',
              price: 40,
              image: 'https://as2.ftcdn.net/v2/jpg/15/85/73/65/1000_F_1585736532_NFMq8z0vAjbker6w9vuzoF8FmsxVRGPI.jpg',
              description: 'Spicy potato and pea samosa',
              serialNumber: 3
            }
          ]
          setMenuItems(fallbackItems)
        } else {
          setMenuItems(sorted)
        }
      } catch (e) {
        console.error('Failed to load food_items:', e)
        // Use fallback items if database fails
        const fallbackItems = [
          {
            id: 'fallback_1',
            name: 'Veg Biryani',
            price: 180,
            image: 'https://as1.ftcdn.net/v2/jpg/04/59/27/88/1000_F_459278894_92eSlejnR7NSwJRCbVyy9ZZibSmjbF8q.jpg',
            description: 'Delicious vegetarian biryani',
            serialNumber: 1
          },
          {
            id: 'fallback_2',
            name: 'Masala Dosa',
            price: 80,
            image: 'https://as2.ftcdn.net/v2/jpg/14/45/94/59/1000_F_1445945944_eBUM7ot1AWezNkqknKsRImNvLvFbmr7z.jpg',
            description: 'Crispy dosa with potato filling',
            serialNumber: 2
          },
          {
            id: 'fallback_3',
            name: 'Samosa',
            price: 40,
            image: 'https://as2.ftcdn.net/v2/jpg/15/85/73/65/1000_F_1585736532_NFMq8z0vAjbker6w9vuzoF8FmsxVRGPI.jpg',
            description: 'Spicy potato and pea samosa',
            serialNumber: 3
          }
        ]
        setMenuItems(fallbackItems)
      }
    }

    // Register global refresh function
    globalRefreshMenuItems = fetchFoodItems
    
    fetchFoodItems()
  }, [])

  // Fetch categories from Supabase
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('name', { ascending: true })
        
        if (error) throw error
        
        setCategories(data || [])
      } catch (e) {
        console.error('Failed to load categories:', e)
        setCategories([])
      }
    }
    
    fetchCategories()
  }, [])

  // Fetch token numbers for items placed by Counter (user_id != APP_USER_ID)
  const fetchCounterTokens = async () => {
    setLoadingCounter(true)
    try {
      const pageSize = 1000
      let from = 0
      let all = []
      while (true) {
        const to = from + pageSize - 1
        const { data, error } = await supabase
          .from('orders')
          .select('id, item_name, status, user_id, created_at, order_token')
          .neq('user_id', APP_USER_ID)
          .order('created_at', { ascending: false })
          .range(from, to)
        if (error) throw error
        const batch = data || []
        all = all.concat(batch)
        if (batch.length < pageSize) break
        from += pageSize
      }
      // order_token is now directly available in the orders table
      setCounterTokens(all)
    } catch (e) {
      console.error('Failed to fetch Counter tokens:', e)
    } finally {
      setLoadingCounter(false)
    }
  }

  useEffect(() => {
    fetchCounterTokens()
  }, [])
  // Fallback function for direct order insertion (without token generation)
  // New robust order function with order type support
  const createNewOrder = async (item, orderTypeBoolean = false) => {
    try {
      console.log('🚀 Creating new order for:', item.name, 'Price:', item.price)
      
      // Generate a unique order ID
      const orderId = crypto.randomUUID()
      console.log('🆔 Generated order ID:', orderId)

      // Generate a 4-digit token
      const token = Math.floor(1000 + Math.random() * 9000).toString()
      console.log('🎫 Generated token:', token)

      // Generate QR code: 16-digit numeric code only (no prefix)
      // Take numeric digits from UUID and pad to 16
      const digitsFromUuid = orderId.replace(/\D/g, '')
      const sixteenDigits = (digitsFromUuid + '0000000000000000').slice(0, 16)
      const qrCode = sixteenDigits
      console.log('📱 Generated QR code:', qrCode)
      console.log('🔍 QR Code length:', qrCode.length, 'Digits from UUID:', digitsFromUuid)

      // Calculate final price with takeaway surcharge
      const TAKEAWAY_SURCHARGE = 10 // ₹10 per item for takeaway
      const finalPrice = orderTypeBoolean ? (item.price + TAKEAWAY_SURCHARGE) : item.price
      console.log(`💰 Price calculation: Base ${item.price} + Takeaway ${orderTypeBoolean ? TAKEAWAY_SURCHARGE : 0} = ${finalPrice}`)
      
      // Show success toast immediately (optimistic)
      setLastToken(token)
      const orderTypeText = orderTypeBoolean ? 'Takeaway' : 'Dine In'
      setToastMessage({ type: 'success', message: `✅ Order placed successfully! Token: #${token} • ${orderTypeText}` })
      setTimeout(() => setToastMessage(null), 3500)

      // Decide correct user_id (cached for speed)
      const adminUserId = await resolveOrderUserId()

      // (toast already shown above)

      // Insert the order into the orders table with order_type boolean (no return payload to save time)
      const { error } = await supabase
        .from('orders')
        .insert({
          id: orderId,
          order_id: orderId, // Required field
          user_id: adminUserId,
          item_name: item.name,
          total_amount: finalPrice, // Price with takeaway surcharge if applicable
          status: 'preparing', // Default status is now 'preparing' instead of 'pending'
          order_type: orderTypeBoolean, // Use the passed order type boolean
          order_token: token,
          qr_code: qrCode,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      // Suppress global/browser notification for this locally placed order
      suppressNotificationForOrder(orderId)
      
      if (error) {
        console.error('❌ Failed to create order:', error)
        throw new Error(`Failed to add item ${item.name} to order: ${error.message}`)
      }
      
      console.log('✅ Order created successfully')

      // Reduce stock when order is placed (run in background, don't block UI)
      decrementStockSafely(item.id, 1).catch(() => {})
      
      // Defer printing so it doesn't block UI responsiveness
      setTimeout(() => {
        try {
          printBarcodeReceipt({
            orderId: orderId,
            token: token,
            qrCode: qrCode,
            itemName: item.name,
            quantity: 1,
            pricePerUnit: finalPrice,
            totalAmount: finalPrice,
            orderType: orderTypeText.toLowerCase().replace(' ', '_'),
            status: 'preparing'
          })
        } catch (_) {}
      }, 0)
      
      // Refresh counter tokens
      fetchCounterTokens()
      
      return { success: true, token, data }
      
    } catch (error) {
      console.error('❌ Order creation failed:', error)
      alert(`❌ Order failed!\n\nError: ${error.message}\n\nPlease try again.`)
      throw error
    }
  }

  // Simplified order function that uses the new createNewOrder with order type selection
  const handlePlaceOrder = async (item) => {
    if (placingOrderId) return // Prevent multiple orders while one is processing
    
    setPlacingOrderId(item.id)
    try {
      console.log('🚀 Placing order for:', item.name, 'Price:', item.price)
      // Use the cart's selected order type
      const orderTypeBoolean = cartOrderType === 'takeaway'
      await createNewOrder(item, orderTypeBoolean)
      
      // Refresh orders asynchronously (do not block UI)
      console.log('🔄 Refreshing orders after placement...')
      fetchOrders(undefined)
      
    } catch (err) {
      console.error('❌ Order placement failed:', err)
      alert(`❌ Order failed!\n\nError: ${err.message}\n\nPlease try again.`)
    } finally {
      setPlacingOrderId(null)
    }
  }

  // OPTIMIZED: Safely decrement stock with timeout and retry logic
  const decrementStockSafely = async (foodItemId, byQty = 1, retryCount = 0) => {
    const MAX_RETRIES = 3;
    const TIMEOUT_MS = 8000; // 8 seconds timeout
    
    try {
      const qtyToReduce = Math.max(0, Number(byQty) || 0);
      if (!foodItemId || qtyToReduce === 0) return;

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Stock update timeout')), TIMEOUT_MS);
      });

      // Use atomic update to reduce database operations and locking
      const stockUpdatePromise = async () => {
        // First get current stock
        const { data: currentData, error: fetchError } = await supabase
          .from('food_items')
          .select('available_quantity, is_available')
          .eq('id', foodItemId)
          .single();

        if (fetchError) throw fetchError;

        const currentQty = currentData.available_quantity || 0;
        const newQty = Math.max(0, currentQty - qtyToReduce);
        const newIsAvailable = newQty > 0;

        // Update with calculated values
        const { data, error } = await supabase
          .from('food_items')
          .update({
            available_quantity: newQty,
            is_available: newIsAvailable,
            updated_at: new Date().toISOString()
          })
          .eq('id', foodItemId)
          .select('available_quantity, is_available');

        if (error) throw error;
        return data;
      };

      // Race between timeout and actual operation
      const result = await Promise.race([stockUpdatePromise(), timeoutPromise]);
      
      console.log(`✅ Stock reduced atomically: ${result[0]?.available_quantity} remaining`);
      if (globalRefreshMenuItems) globalRefreshMenuItems();
      
      return result;

    } catch (error) {
      console.error(`❌ Stock update failed (attempt ${retryCount + 1}):`, error);
      
      // Retry logic with exponential backoff
      if (retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`🔄 Retrying stock update in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return decrementStockSafely(foodItemId, byQty, retryCount + 1);
      }
      
      throw new Error(`Failed to update stock after ${MAX_RETRIES} attempts: ${error.message}`);
    }
  }


  // OPTIMIZED: Modified checkout function with timeout handling
  const handleCheckout = async (orderType) => {
    if (processingCheckout) return
    if (cart.length === 0) {
      setToastMessage({ type: 'error', message: 'Your cart is empty!' })
      setTimeout(() => setToastMessage(null), 2000)
      return
    }

    // Prevent accidental duplicate checkouts of the same cart within a short window
    const fingerprintCart = (arr) => {
      const compact = (arr || []).map(it => ({ id: it.id, q: it.quantity || 0, p: it.price || 0 }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      return JSON.stringify(compact)
    }
    const now = Date.now()
    const currentHash = fingerprintCart(cart)
    if (recentCheckoutRef.current.hash === currentHash && (now - recentCheckoutRef.current.ts) < 5000) {
      setToastMessage({ type: 'error', message: 'Checkout already in progress. Please wait…' })
      setTimeout(() => setToastMessage(null), 2000)
      return
    }

    recentCheckoutRef.current = { hash: currentHash, ts: now }
    setProcessingCheckout(true)

    try {
      console.log('🛒 Starting optimized checkout process for:', cart.length, 'items - creating separate orders')
      
      const createdOrders = []
      const TIMEOUT_PER_ITEM = 12000; // 12 seconds per item

      // Define takeaway variables in outer scope
      const TAKEAWAY_SURCHARGE = 10 // ₹10 per item for takeaway
      const isTakeaway = orderType === 'takeaway'

      // Create a separate order for each cart item with timeout handling
      for (const item of cart) {
        console.log('📝 Creating separate order for:', item.name, 'Qty:', item.quantity)
        
        // Create timeout promise for this item
        const itemTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout processing ${item.name}`)), TIMEOUT_PER_ITEM);
        });

        // Create the order processing promise
        const processItemPromise = async () => {
          // Calculate price with takeaway surcharge
          const pricePerUnit = isTakeaway ? (item.price + TAKEAWAY_SURCHARGE) : item.price
          const totalPrice = pricePerUnit * item.quantity
          
          console.log(`💰 Price: Base ${item.price} + Takeaway ${isTakeaway ? TAKEAWAY_SURCHARGE : 0} = ${pricePerUnit} × ${item.quantity} = ${totalPrice}`)
          
          // Generate unique order ID for each item; backend generates token and qr_code
          const orderId = crypto.randomUUID()
          console.log('🆔 Generated order ID (backend will assign token/qr):', orderId)

          // Decide correct user_id for this item
          const adminUserId = await resolveOrderUserId()

          // Insert individual order for this cart item
          const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert({
              id: orderId,
              order_id: orderId, // Required field
              user_id: adminUserId,
              item_name: item.name,
              total_amount: totalPrice, // Price with takeaway surcharge and quantity
              status: 'preparing', // Default status is now 'preparing' instead of 'pending'
              order_type: isTakeaway, // Boolean: true for takeaway, false for dine_in
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single()

          // Suppress global/browser notification for this locally placed order
          suppressNotificationForOrder(orderId)

          if (orderError) {
            console.error('❌ Failed to create order for item:', item.name, orderError)
            throw new Error(`Failed to create order for ${item.name}: ${orderError.message}`)
          }

          console.log('✅ Order created for item:', item.name, orderData)

          // Reduce stock when order is placed (safe)
          await decrementStockSafely(item.id, item.quantity)

          // Removed sending barcode data to backend

          // Get backend-generated token and QR code
          let tokenFromBackend = orderData?.order_token || orderData?.token_no || orderData?.token || null
          let encryptedQrForItem = orderData?.qr_code || orderData?.[0]?.qr_code || null
          if (!encryptedQrForItem || encryptedQrForItem.length < 8) {
            try {
              const { data: refetchRow } = await supabase
                .from('orders')
                .select('order_token, qr_code')
                .eq('id', orderId)
                .single()
              if (!tokenFromBackend && (refetchRow?.order_token || refetchRow?.token_no)) {
                tokenFromBackend = refetchRow.order_token || refetchRow.token_no
              }
              if (refetchRow?.qr_code && refetchRow.qr_code.length >= 8) {
                encryptedQrForItem = refetchRow.qr_code
              }
            } catch (_) { /* ignore and fallback */ }
          }

          // Fallback: if backend did not assign a token, generate a next token safely on client
          if (!tokenFromBackend) {
            try {
              console.warn('⚠️ order_token missing from backend; generating fallback token on client')
              // Fetch latest token and compute next 4-digit value
              const { data: latestTokens } = await supabase
                .from('orders')
                .select('order_token, created_at')
                .not('order_token', 'is', null)
                .order('created_at', { ascending: false })
                .limit(50)
              const numericTokens = (latestTokens || [])
                .map(r => parseInt(String(r.order_token).replace(/\D/g, ''), 10))
                .filter(n => Number.isFinite(n))
              const maxToken = numericTokens.length ? Math.max(...numericTokens) : 999
              let nextToken = ((maxToken % 9999) + 1)
              if (nextToken < 1000) nextToken += 1000 // keep 4 digits

              // Attempt to find a free token (avoid recent collisions)
              for (let attempt = 0; attempt < 20; attempt++) {
                const candidate = String(nextToken).padStart(4, '0')
                // Check if candidate exists very recently
                const { data: exists } = await supabase
                  .from('orders')
                  .select('id')
                  .eq('order_token', candidate)
                  .order('created_at', { ascending: false })
                  .limit(1)
                if (!exists || exists.length === 0) {
                  // Assign candidate to this order
                  await supabase
                    .from('orders')
                    .update({ order_token: candidate })
                    .eq('id', orderId)
                  tokenFromBackend = candidate
                  break
                }
                nextToken = ((nextToken % 9999) + 1) || 1000
              }
            } catch (fallbackErr) {
              console.error('❌ Failed to assign fallback token:', fallbackErr)
            }
          }
          return { item: item.name, token: tokenFromBackend, orderId: orderId, qrCode: encryptedQrForItem }
        };

        // Race between timeout and processing
        try {
          const result = await Promise.race([processItemPromise(), itemTimeoutPromise]);
          createdOrders.push(result);
          console.log('✅ Item processed successfully:', item.name);
        } catch (error) {
          console.error(`❌ Failed to process ${item.name}:`, error);
          throw new Error(`Failed to add item ${item.name} to order: ${error.message}`);
        }
      }

      // Removed batch barcode sending to backend

      // Print SINGLE COMBINED BILL for all orders (to save paper)
      if (createdOrders.length > 0) {
        console.log('🖨️ Printing single combined receipt for', createdOrders.length, 'orders')
        
        // Prepare all items for combined receipt
        const allItems = createdOrders.map((order, i) => {
          const cartItem = cart[i]
          const pricePerUnit = isTakeaway ? (cartItem.price + TAKEAWAY_SURCHARGE) : cartItem.price
          const totalAmount = pricePerUnit * cartItem.quantity
          
          return {
            name: order.item,
            quantity: cartItem.quantity,
            price: pricePerUnit,
            total: totalAmount,
            token: order.token,
            orderId: order.orderId,
            qrCode: order.qrCode // Include individual QR code for each item
          }
        })
        
        // Calculate total amount for all orders
        const grandTotal = allItems.reduce((sum, item) => sum + item.total, 0)
        
        // Use the first order's QR code for the combined receipt
        const primaryOrder = createdOrders[0]
        
        // Print single combined receipt with all items (deferred)
        setTimeout(() => {
          try {
            printBarcodeReceipt({
              orderId: primaryOrder.orderId,
              token: primaryOrder.token || (createdOrders[0]?.token) || '', // Show primary token
              qrCode: primaryOrder.qrCode || (createdOrders[0]?.qrCode) || '',
              items: allItems, // Array of all items with their tokens
              totalAmount: grandTotal,
              orderType: orderType,
              status: 'preparing',
              isCombinedReceipt: true, // Flag to indicate this is a combined receipt
              allTokens: createdOrders.map(order => order.token || '') // All tokens for reference
            })
          } catch (_) {}
        }, 0)
      }
      
      // Clear cart and show success toast
      setCart([])
      setShowCart(false)
      setLastToken(createdOrders[createdOrders.length - 1]?.token) // Set last token for reference
      
      const orderTypeText = orderType === 'dine_in' ? 'Dine In' : 'Takeaway'
      const tokensList = createdOrders.map(order => `#${order.token}`).join(', ')
      setToastMessage({ 
        type: 'success', 
        message: `✅ Checkout successful! ${createdOrders.length} order(s) created • Tokens: ${tokensList} • ${orderTypeText}` 
      })
      setTimeout(() => setToastMessage(null), 3500)

      // Refresh menu items and counter tokens
      if (globalRefreshMenuItems) {
        globalRefreshMenuItems()
      }
      fetchCounterTokens()

      // Refresh orders asynchronously (do not block UI)
      console.log('🔄 Refreshing orders after checkout...')
      fetchOrders(undefined)

      console.log('🎉 Checkout completed successfully!')
      // On success, keep recent hash to prevent rapid duplicates

    } catch (error) {
      console.error('❌ Checkout failed:', error)
      setToastMessage({ type: 'error', message: `❌ Checkout failed: ${error.message}` })
      setTimeout(() => setToastMessage(null), 3500)
      // Allow retry on failure
      recentCheckoutRef.current = { hash: null, ts: 0 }
    }
    finally {
      setProcessingCheckout(false)
    }
  }
  return (
    <div className="home-dashboard">
      <Card title="Menu - Place Order (Counter)" titleAction={
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Search Bar */}
          <div style={{ position: 'relative', width: '300px' }}>
            <input 
              ref={searchInputRef}
              className="input search-input" 
              placeholder="Search menu items or serial number..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Let the global key handler process Enter/Arrows/Backspace
                if (e.key === 'Enter' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || (e.key === 'Backspace' && !search)) {
                  e.preventDefault()
                }
              }}
              style={{ 
                paddingRight: search ? '40px' : '12px',
                width: '100%',
                fontSize: '14px'
              }}
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('')
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#6b7280',
                  borderRadius: '4px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#f3f4f6'
                  e.target.style.color = '#374151'
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent'
                  e.target.style.color = '#6b7280'
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
          
          {/* View Mode Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: viewMode === 'list' ? '#3b82f6' : 'var(--muted-bg)',
                color: viewMode === 'list' ? '#ffffff' : 'var(--text)',
                border: viewMode === 'list' ? '1px solid #2563eb' : '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="List Mode"
            >
              <List size={16} />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('card')}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: viewMode === 'card' ? '#3b82f6' : 'var(--muted-bg)',
                color: viewMode === 'card' ? '#ffffff' : 'var(--text)',
                border: viewMode === 'card' ? '1px solid #2563eb' : '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Card Mode"
            >
              <Image size={16} />
              <span>Card</span>
            </button>
            <button
              onClick={() => setViewMode('button')}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: viewMode === 'button' ? '#3b82f6' : 'var(--muted-bg)',
                color: viewMode === 'button' ? '#ffffff' : 'var(--text)',
                border: viewMode === 'button' ? '1px solid #2563eb' : '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Button Mode"
            >
              <CirclePlus size={16} />
              <span>Button</span>
            </button>
          </div>
        </div>
      }>

        {/* Quick Search Recommendations (always visible) */}
        <div style={{
          marginTop: '16px',
          marginBottom: '8px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !bulkCancelLoading) {
            e.stopPropagation();
            setShowBulkCancel(false);
          }
        }}
        tabIndex={-1}
        >
          <span style={{
            fontSize: '14px',
            fontWeight: '600',
            color: 'var(--text-primary)'
          }}>
            Quick Search:
          </span>
            {['Biryani', 'Dosa', 'Idli', 'Paratha', 'Manchuria', 'Noodles', 'Rice', 'Omlette', 'Egg', 'Chicken'].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setSearch(suggestion)}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: '500',
                  backgroundColor: 'var(--muted-bg)',
                  color: 'var(--text)',
                  border: suggestion && search && search.toLowerCase() === suggestion.toLowerCase() ? '1px solid #3b82f6' : '1px solid var(--border)',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'var(--panel-bg)'
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.color = '#3b82f6'
                }}
                onMouseLeave={(e) => {
                  if (!(search && search.toLowerCase() === suggestion.toLowerCase())) {
                    e.target.style.backgroundColor = 'var(--muted-bg)'
                    e.target.style.borderColor = 'var(--border)'
                    e.target.style.color = 'var(--text)'
                  }
                }}
              >
                {suggestion}
              </button>
            ))}
        </div>

        {/* View Mode toggles moved to Card titleAction */}

         {/* Category Filter */}
         {categories.length > 0 && (
           <div style={{
             marginTop: '16px',
             marginBottom: '8px',
             display: 'flex',
             gap: '8px',
             flexWrap: 'wrap',
             alignItems: 'center'
           }}>
             <span style={{
               fontSize: '14px',
               fontWeight: '600',
               color: 'var(--text)',
               marginRight: '4px'
             }}>
               Special Categories:
             </span>
             <button
               onClick={() => setSelectedCategory('all')}
               style={{
                 padding: '6px 16px',
                 fontSize: '14px',
                 fontWeight: '500',
                 backgroundColor: selectedCategory === 'all' ? '#3b82f6' : 'var(--muted-bg)',
                 color: selectedCategory === 'all' ? '#ffffff' : 'var(--text)',
                 border: 'none',
                 borderRadius: '20px',
                 cursor: 'pointer',
                 transition: 'all 0.2s',
                 boxShadow: selectedCategory === 'all' ? '0 2px 8px rgba(59, 130, 246, 0.3)' : 'none'
               }}
               onMouseEnter={(e) => {
                 if (selectedCategory !== 'all') {
                   e.target.style.backgroundColor = 'var(--panel-bg)'
                 }
               }}
               onMouseLeave={(e) => {
                 if (selectedCategory !== 'all') {
                   e.target.style.backgroundColor = 'var(--muted-bg)'
                 }
               }}
             >
               All ({menuItems.length})
             </button>
             {categories
               .map((category) => ({
                 ...category,
                 itemCount: menuItems.filter(item => item.categoryId === category.id).length
               }))
               .filter(category => category.itemCount > 0) // Only show categories with items
               .reduce((acc, category) => {
                 // Combine "Cuisine" and "Lunch" categories into "Lunch"
                 if (category.name.toLowerCase() === 'cuisine' || category.name.toLowerCase() === 'lunch') {
                   const existingLunch = acc.find(c => c.name === 'Lunch')
                   if (existingLunch) {
                     existingLunch.itemCount += category.itemCount
                   } else {
                     acc.push({
                       ...category,
                       name: 'Lunch',
                       id: 'lunch', // Use a special ID for the combined category
                       originalIds: [category.id] // Store original IDs for filtering
                     })
                   }
                 }
                // Build a combined "Breakfast" (Snacks + Breakfast + Beverages),
                // but KEEP Beverages as its own category too.
                else if (
                  category.name.toLowerCase() === 'snacks' ||
                  category.name.toLowerCase() === 'breakfast' ||
                  category.name.toLowerCase() === 'beverages' ||
                  category.name.toLowerCase() === 'beverage'
                ) {
                  // Update or create synthetic Breakfast category count
                  const existingBreakfast = acc.find(c => c.id === 'breakfast' || c.name === 'Breakfast')
                  if (existingBreakfast) {
                    existingBreakfast.itemCount += category.itemCount
                  } else {
                    acc.push({
                      ...category,
                      name: 'Breakfast',
                      id: 'breakfast',
                      originalIds: [category.id]
                    })
                  }

                  // Keep Beverages visible as its own category
                  if (
                    category.name.toLowerCase() === 'beverages' ||
                    category.name.toLowerCase() === 'beverage'
                  ) {
                    acc.push(category)
                  }
                  // For Snacks and Breakfast originals, we skip pushing individual buttons
                } else {
                   acc.push(category)
                 }
                 return acc
               }, [])
               .sort((a, b) => b.itemCount - a.itemCount) // Sort by item count (highest first)
               .map((category) => (
                 <button
                   key={category.id}
                   onClick={() => setSelectedCategory(category.id)}
                   style={{
                     padding: '6px 16px',
                     fontSize: '14px',
                     fontWeight: '500',
                  backgroundColor: selectedCategory === category.id ? '#3b82f6' : 'var(--muted-bg)',
                  color: selectedCategory === category.id ? '#ffffff' : 'var(--text)',
                     border: 'none',
                     borderRadius: '20px',
                     cursor: 'pointer',
                     transition: 'all 0.2s',
                     boxShadow: selectedCategory === category.id ? '0 2px 8px rgba(59, 130, 246, 0.3)' : 'none'
                   }}
                   onMouseEnter={(e) => {
                    if (selectedCategory !== category.id) {
                      e.target.style.backgroundColor = 'var(--panel-bg)'
                    }
                   }}
                   onMouseLeave={(e) => {
                    if (selectedCategory !== category.id) {
                      e.target.style.backgroundColor = 'var(--muted-bg)'
                    }
                   }}
                 >
                   {category.name} ({category.itemCount})
                 </button>
               ))}
           </div>
         )}
        


         {viewMode === 'list' ? (
           /* List Mode - Column Cards without picture */
           <div className="menu-items-grid" style={{
             marginTop: '20px',
             display: 'grid',
             gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
             gap: '20px'
           }}>
             {(menuItems
               // First filter by category
               .filter(matchesCategory)
               // Then sort
               .sort((a, b) => {
              // Primary sort: In stock items first, out of stock items last
              const aInStock = a.inStock ? 1 : 0
              const bInStock = b.inStock ? 1 : 0
              if (aInStock !== bInStock) {
                return bInStock - aInStock
              }
              
              // Secondary sort: If search query exists, prioritize items starting with the search text
            const q = search.trim().toLowerCase()
              const nameA = String(a.name || '').toLowerCase()
              const nameB = String(b.name || '').toLowerCase()
              
              if (q) {
                const aStartsWith = nameA.startsWith(q)
                const bStartsWith = nameB.startsWith(q)
                if (aStartsWith && !bStartsWith) return -1
                if (!aStartsWith && bStartsWith) return 1
              }
              
              // Tertiary sort: Alphabetically
              return nameA.localeCompare(nameB)
            })
            // Assign serial numbers based on sorted position
            .map((item, index) => ({ ...item, displayNumber: index + 1 }))
            // Then filter by search query (supports multiple serials)
            .filter(it => {
              const raw = search.trim().toLowerCase()
              if (!raw) return true
              const tokens = raw.split(/[\s,]+/).filter(Boolean)
              if (tokens.length === 0) return true
              const nameLc = String(it.name || '').toLowerCase()
              const serialStr = String(it.displayNumber)
              return tokens.some(tok => (/^\d+$/.test(tok) ? serialStr === tok : nameLc.includes(tok)))
            }))
            .map((item) => (
               <div key={item.id} className="menu-item-card" style={{
                 padding: '14px',
                 border: '1px solid #e5e7eb',
                 borderRadius: '12px',
                 backgroundColor: '#ffffff',
                 opacity: !item.inStock ? 0.6 : 1,
                 minHeight: '220px',
                 display: 'flex',
                 flexDirection: 'column',
                 boxSizing: 'border-box',
                 position: 'relative'
               }}>
                 {/* Serial Number Badge */}
                 <div style={{ 
                   position: 'absolute',
                   top: '8px',
                   left: '8px',
                   backgroundColor: '#3b82f6',
                   color: 'white',
                   padding: '4px 10px',
                   borderRadius: '20px',
                   fontSize: '11px',
                   fontWeight: '700',
                   zIndex: 1
                 }}>
                   #{item.displayNumber}
                 </div>
                 
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                     <img
                       src={item.image}
                       alt={item.name}
                       loading="lazy"
                       style={{ width: '46px', height: '46px', borderRadius: '10px', objectFit: 'cover', backgroundColor: '#f3f4f6', flexShrink: 0 }}
                       onError={(e) => { const t = e.currentTarget; if (t.src !== 'https://via.placeholder.com/80?text=Food') { t.src = 'https://via.placeholder.com/80?text=Food' } }}
                     />
                     <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</h3>
                   </div>
                   <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>₹{item.price}</div>
                 </div>
                {!item.inStock && (
                  <div style={{
                    marginBottom: '10px',
                    padding: '8px',
                    backgroundColor: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: '#991b1b',
                    fontWeight: '500',
                    fontSize: '12px'
                  }}>
                    ⚠️ Currently Unavailable
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => {
                        const currentQuantity = cart.find(cartItem => cartItem.id === item.id)?.quantity || 0
                        if (currentQuantity > 1) {
                          updateCartItemQuantity(item.id, currentQuantity - 1)
                        } else if (currentQuantity === 1) {
                          removeFromCart(item.id)
                        }
                      }}
                      disabled={canteenStatus === 'closed' || !item.inStock}
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#ffffff',
                        color: '#374151',
                        cursor: (canteenStatus === 'closed' || !item.inStock) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: (canteenStatus === 'closed' || !item.inStock) ? 0.5 : 1
                      }}
                    >
                      -
                    </button>
                    <span style={{ minWidth: '56px', textAlign: 'center', fontWeight: '700', fontSize: '15px' }}>
                      {cart.find(cartItem => cartItem.id === item.id)?.quantity || 0}
                    </span>
                    <button
                      onClick={() => {
                        const currentQuantity = cart.find(cartItem => cartItem.id === item.id)?.quantity || 0
                        if (currentQuantity === 0) {
                          addToCart(item, 1)
                        } else {
                          updateCartItemQuantity(item.id, currentQuantity + 1)
                        }
                      }}
                      disabled={canteenStatus === 'closed' || !item.inStock}
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#ffffff',
                        color: '#374151',
                        cursor: (canteenStatus === 'closed' || !item.inStock) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: (canteenStatus === 'closed' || !item.inStock) ? 0.5 : 1
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className={`order-btn ${(canteenStatus === 'closed' || !item.inStock) ? 'btn-disabled' : 'btn-primary'}`}
                  onClick={() => {
                    const currentQuantity = cart.find(cartItem => cartItem.id === item.id)?.quantity || 0
                    if (currentQuantity === 0) {
                      addToCart(item, 1)
                    } else {
                      updateCartItemQuantity(item.id, currentQuantity + 1)
                    }
                  }}
                  disabled={canteenStatus === 'closed' || !item.inStock}
                  style={{ padding: '12px 14px', fontSize: '13px', marginTop: '14px', width: '100%' }}
                >
                  {canteenStatus === 'closed' ? '🔴 Closed' :
                    !item.inStock ? '⚠️ Out of Stock' :
                    cart.find(cartItem => cartItem.id === item.id)?.quantity > 0 ? '🛒 Add More' : '🛒 Add to Cart'}
                </button>
              </div>
            ))}
          </div>
        ) : viewMode === 'card' ? (
           /* Card Mode */
        <div className="menu-items-grid">
           {(menuItems
             // First filter by category
             .filter(matchesCategory)
             // Then sort
             .sort((a, b) => {
              // Primary sort: In stock items first, out of stock items last
              const aInStock = a.inStock ? 1 : 0
              const bInStock = b.inStock ? 1 : 0
              if (aInStock !== bInStock) {
                return bInStock - aInStock // In stock (1) comes before out of stock (0)
              }
              
              // Secondary sort: If search query exists, prioritize items starting with the search text
            const q = search.trim().toLowerCase()
            const nameA = String(a.name || '').toLowerCase()
            const nameB = String(b.name || '').toLowerCase()
            
            if (q) {
              const aStartsWith = nameA.startsWith(q)
              const bStartsWith = nameB.startsWith(q)
              
              // If one starts with query and other doesn't, prioritize the one that starts
              if (aStartsWith && !bStartsWith) return -1
              if (!aStartsWith && bStartsWith) return 1
            }
            
              // Tertiary sort: Alphabetically
            return nameA.localeCompare(nameB)
          })
          // Assign serial numbers based on sorted position
          .map((item, index) => ({ ...item, displayNumber: index + 1 }))
          // Then filter by search query (supports multiple serials)
          .filter(it => {
            const raw = search.trim().toLowerCase()
            if (!raw) return true
            const tokens = raw.split(/[\s,]+/).filter(Boolean)
            if (tokens.length === 0) return true
            const nameLc = String(it.name || '').toLowerCase()
            const serialStr = String(it.displayNumber)
            return tokens.some(tok => (/^\d+$/.test(tok) ? serialStr === tok : nameLc.includes(tok)))
          }))
          .map((item) => (
            <div key={item.id} className="menu-item-card" style={{
              opacity: !item.inStock ? 0.6 : 1,
              position: 'relative'
            }}>
              <div className="menu-item-image" style={{ 
                backgroundImage: `url(${item.image})`,
              }}>
                {/* Serial Number Badge */}
                <div style={{ 
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '700',
                  zIndex: 1,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                  #{item.displayNumber}
                </div>
                
                <div className="price-badge">
                  ₹{item.price}
                </div>
                {!item.inStock && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: 'rgba(239, 68, 68, 0.95)',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    zIndex: 2
                  }}>
                    🔴 OUT OF STOCK
                  </div>
                )}
              </div>
              <div className="menu-item-content">
                <h3 className="menu-item-title">
                  {item.name}
                </h3>
                <p className="menu-item-description">
                  {item.description}
                </p>
                {!item.inStock ? (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: '#991b1b',
                    fontWeight: '500',
                    fontSize: '14px'
                  }}>
                    ⚠️ Currently Unavailable
                  </div>
                ) : (
                  <>
                {/* Quantity Selector and Add to Cart */}
                <div style={{ marginTop: '12px' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    marginBottom: '8px',
                    justifyContent: 'center'
                  }}>
                    <button
                      onClick={() => {
                        const currentQuantity = cart.find(cartItem => cartItem.id === item.id)?.quantity || 0
                            if (currentQuantity > 1) {
                          updateCartItemQuantity(item.id, currentQuantity - 1)
                            } else if (currentQuantity === 1) {
                              removeFromCart(item.id)
                        }
                      }}
                      disabled={canteenStatus === 'closed'}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--card-bg)',
                        color: 'var(--text-primary)',
                        cursor: canteenStatus === 'closed' ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: canteenStatus === 'closed' ? 0.5 : 1
                      }}
                    >
                      -
                    </button>
                    
                    <span style={{ 
                      minWidth: '40px', 
                      textAlign: 'center',
                      fontWeight: '500',
                      color: 'var(--text-primary)',
                      fontSize: '16px'
                    }}>
                      {cart.find(cartItem => cartItem.id === item.id)?.quantity || 0}
                    </span>
                    
                    <button
                      onClick={() => {
                        const currentQuantity = cart.find(cartItem => cartItem.id === item.id)?.quantity || 0
                            if (currentQuantity === 0) {
                              addToCart(item, 1)
                            } else {
                        updateCartItemQuantity(item.id, currentQuantity + 1)
                            }
                      }}
                      disabled={canteenStatus === 'closed'}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--card-bg)',
                        color: 'var(--text-primary)',
                        cursor: canteenStatus === 'closed' ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: canteenStatus === 'closed' ? 0.5 : 1
                      }}
                    >
                      +
                    </button>
                  </div>
                  
                  <button 
                    type="button"
                    className={`order-btn ${canteenStatus === 'closed' ? 'btn-disabled' : 'btn-primary'}`}
                    onClick={() => {
                      const currentQuantity = cart.find(cartItem => cartItem.id === item.id)?.quantity || 0
                      if (currentQuantity === 0) {
                        addToCart(item, 1)
                      } else {
                        updateCartItemQuantity(item.id, currentQuantity + 1)
                      }
                    }}
                    disabled={canteenStatus === 'closed'}
                    style={{ width: '100%' }}
                  >
                    {canteenStatus === 'closed' ? '🔴 Canteen Closed' : 
                     cart.find(cartItem => cartItem.id === item.id)?.quantity > 0 ? 
                     '🛒 Add More' : '🛒 Add to Cart'}
                  </button>
                </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        ) : viewMode === 'button' ? (
           /* Button Mode - Simple buttons with only food names and permanent cart on right */
           <div style={{
             marginTop: '20px',
             display: 'flex',
             gap: '20px'
           }}>
             {/* Food Items Grid - Left Side */}
             <div ref={gridRef} style={{
               flex: '1',
               display: 'grid',
               gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
               gap: '10px',
               alignContent: 'start'
             }}>
             {getFilteredItems().map((item, index) => (
                <button
                   type="button"
                   key={item.id}
                   id={`po-item-btn-${index}`}
                   onClick={() => {
                     if (canteenStatus === 'closed' || !item.inStock) return
                     const currentQuantity = cart.find(cartItem => cartItem.id === item.id)?.quantity || 0
                     if (currentQuantity === 0) {
                       addToCart(item, 1)
                     } else {
                       updateCartItemQuantity(item.id, currentQuantity + 1)
                     }
                   }}
                   disabled={canteenStatus === 'closed' || !item.inStock}
                   style={{
                     padding: '10px',
                     fontSize: '14px',
                     fontWeight: '600',
                     backgroundColor: !item.inStock ? '#f3f4f6' : 
                                    cart.find(cartItem => cartItem.id === item.id)?.quantity > 0 ? '#3b82f6' : 
                                    index === selectedItemIndex ? 'var(--muted-bg)' : 'var(--panel-bg)',
                    color: !item.inStock ? '#9ca3af' :
                          cart.find(cartItem => cartItem.id === item.id)?.quantity > 0 ? '#ffffff' : 
                          index === selectedItemIndex ? 'var(--text)' : 'var(--text)',
                     border: !item.inStock ? '2px dashed #d1d5db' :
                            cart.find(cartItem => cartItem.id === item.id)?.quantity > 0 ? '2px solid #2563eb' : 
                            index === selectedItemIndex ? '2px solid #0ea5e9' : '2px solid var(--border)',
                     borderRadius: '12px',
                     cursor: (canteenStatus === 'closed' || !item.inStock) ? 'not-allowed' : 'pointer',
                     transition: 'all 0.2s',
                     display: 'flex',
                     flexDirection: 'column',
                     alignItems: 'center',
                     gap: '6px',
                     position: 'relative',
                     opacity: !item.inStock ? 0.5 : 1,
                     minHeight: '64px',
                     justifyContent: 'center',
                     textAlign: 'center',
                     wordBreak: 'break-word',
                     boxShadow: cart.find(cartItem => cartItem.id === item.id)?.quantity > 0 ? 
                               '0 4px 12px rgba(59, 130, 246, 0.3)' : 
                               index === selectedItemIndex ? '0 4px 12px rgba(14, 165, 233, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.05)'
                   }}
                   onMouseEnter={(e) => {
                     if (canteenStatus !== 'closed' && item.inStock && !cart.find(cartItem => cartItem.id === item.id)?.quantity) {
                       e.currentTarget.style.backgroundColor = 'var(--muted-bg)'
                       e.currentTarget.style.borderColor = '#3b82f6'
                     }
                   }}
                   onMouseLeave={(e) => {
                     if (canteenStatus !== 'closed' && item.inStock && !cart.find(cartItem => cartItem.id === item.id)?.quantity) {
                       e.currentTarget.style.backgroundColor = 'var(--panel-bg)'
                       e.currentTarget.style.borderColor = 'var(--border)'
                     }
                   }}
                 >
                  {/* Serial Number Badge */}
                  <div style={{ 
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '700',
                    zIndex: 1
                  }}>
                    {index + 1}
                  </div>
                   {/* Quantity Badge */}
                   {cart.find(cartItem => cartItem.id === item.id)?.quantity > 0 && (
                     <div style={{ 
                       position: 'absolute',
                       top: '6px',
                       right: '6px',
                       backgroundColor: '#ef4444',
                       color: 'white',
                       padding: '2px 8px',
                       borderRadius: '12px',
                       fontSize: '11px',
                       fontWeight: '700',
                       zIndex: 1,
                       minWidth: '24px',
                       textAlign: 'center'
                     }}>
                       {cart.find(cartItem => cartItem.id === item.id)?.quantity}
                     </div>
                   )}
                   
                   <span style={{ 
                     fontSize: '14px',
                     lineHeight: '1.3',
                     fontWeight: '600',
                     marginTop: '6px'
                   }}>
                     {item.name}
                   </span>
                 </button>
               ))}
             </div>
             
             {/* Cart Panel - Right Side (Always Visible in Button Mode) */}
             <div style={{
               width: '350px',
               flexShrink: 0,
               backgroundColor: 'var(--panel-bg)',
               borderRadius: '12px',
               border: '2px solid var(--border)',
               display: 'flex',
               flexDirection: 'column',
               maxHeight: '600px',
               position: 'sticky',
               top: '20px',
               alignSelf: 'start'
             }}>
               {/* Cart Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '2px solid var(--border)',
                backgroundColor: 'var(--muted-bg)',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h3 style={{ 
                  margin: 0, 
                  color: 'var(--text)',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '8px',
                   fontSize: '18px',
                   fontWeight: '700'
                 }}>
                   <ShoppingCart size={20} />
                   Your Cart
                   {cart.length > 0 && (
                     <span style={{
                       backgroundColor: '#ef4444',
                       color: 'white',
                       borderRadius: '20px',
                       padding: '2px 8px',
                       fontSize: '12px',
                       fontWeight: '700',
                       marginLeft: '4px'
                     }}>
                       {getCartItemCount()}
                     </span>
                   )}
                 </h3>
                 
                 {/* Cancel Cart Button in Header */}
                 <button
                   onClick={() => {
                     setShowConfirmModal({
                       title: 'Clear Cart?',
                       message: 'This will remove all items from the cart. You cannot undo this action.',
                       confirmText: 'Clear Cart',
                       confirmStyle: 'danger',
                       onConfirm: () => {
                         clearCart()
                         setToastMessage({ type: 'success', message: 'Cart cleared!' })
                         setTimeout(() => setToastMessage(null), 2000)
                       }
                     })
                   }}
                   disabled={canteenStatus === 'closed' || cart.length === 0}
                   style={{
                     padding: '8px 16px',
                     fontSize: '14px',
                     fontWeight: '600',
                    backgroundColor: canteenStatus === 'closed' || cart.length === 0 ? '#d1d5db' : '#ef4444',
                    color: cart.length === 0 ? '#111827' : '#ffffff',
                     border: 'none',
                     borderRadius: '6px',
                     cursor: canteenStatus === 'closed' || cart.length === 0 ? 'not-allowed' : 'pointer',
                     transition: 'all 0.2s',
                     boxShadow: canteenStatus === 'closed' || cart.length === 0 ? 'none' : '0 2px 4px rgba(239, 68, 68, 0.3)',
                     display: 'flex',
                     alignItems: 'center',
                     gap: '6px',
                     opacity: cart.length === 0 ? 0.5 : 1,
                     minWidth: '80px'
                   }}
                >
                  {canteenStatus === 'closed' ? '🔴 Closed' : cart.length === 0 ? 'Empty' : 'Clear Cart'}
                 </button>
               </div>

               {/* Cart Content */}
               <div style={{
                 flex: 1,
                 padding: '16px',
                 overflowY: 'auto',
                 display: 'flex',
                 flexDirection: 'column'
               }}>
                 {cart.length === 0 ? (
                   <div style={{ 
                     textAlign: 'center', 
                     color: 'var(--text-secondary)', 
                     padding: '40px 20px',
                     display: 'flex',
                     flexDirection: 'column',
                     alignItems: 'center',
                     gap: '12px'
                   }}>
                     <ShoppingCart size={48} style={{ opacity: 0.3, color: 'var(--text-secondary)' }} />
                    <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--text)' }}>
                       Your cart is empty
                     </div>
                     <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                       Click on items to add
                     </div>
                   </div>
                 ) : (
                   <div style={{ flex: 1 }}>
                     {cart.map((item) => (
                       <div 
                         key={item.id} 
                         style={{
                           display: 'flex',
                           alignItems: 'center',
                          padding: '10px',
                          backgroundColor: 'var(--muted-bg)',
                           borderRadius: '10px',
                           marginBottom: '10px',
                           border: '1px solid var(--border)',
                           gap: '10px'
                         }}
                       >
                         <div style={{ flex: 1, minWidth: 0 }}>
                           <div style={{ 
                            fontWeight: '600', 
                            color: 'var(--text)',
                             marginBottom: '4px',
                             fontSize: '14px',
                             whiteSpace: 'nowrap',
                             overflow: 'hidden',
                             textOverflow: 'ellipsis'
                           }}>
                             {item.name}
                           </div>
                           <div style={{ 
                             fontSize: '13px', 
                             color: 'var(--text-secondary)' 
                           }}>
                             ₹{item.price} each
                           </div>
                         </div>
                         
                         <div style={{ 
                           display: 'flex', 
                           alignItems: 'center', 
                           gap: '6px',
                           flexShrink: 0
                         }}>
                          <button
                            onClick={() => {
                              if (item.quantity <= 1) {
                                removeFromCart(item.id)
                              } else {
                                updateCartItemQuantity(item.id, item.quantity - 1)
                              }
                            }}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              border: '2px solid #ef4444',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '18px',
                              fontWeight: '700',
                              transition: 'all 0.2s',
                              boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#fecaca'
                              e.target.style.borderColor = '#dc2626'
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = '#fef2f2'
                              e.target.style.borderColor = '#ef4444'
                            }}
                          >
                            -
                          </button>
                           <span style={{ 
                             fontWeight: '700', 
                             fontSize: '14px',
                            minWidth: '30px',
                            textAlign: 'center',
                            color: 'var(--text)'
                           }}>
                             {item.quantity}
                           </span>
                           <button
                             type="button"
                             onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}
                             style={{
                               width: '32px',
                               height: '32px',
                               borderRadius: '8px',
                               border: '2px solid #10b981',
                               backgroundColor: '#f0fdf4',
                               color: '#059669',
                               cursor: 'pointer',
                               display: 'flex',
                               alignItems: 'center',
                               justifyContent: 'center',
                               fontSize: '18px',
                               fontWeight: '700',
                               transition: 'all 0.2s',
                               boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                             }}
                             onMouseEnter={(e) => {
                               e.target.style.backgroundColor = '#d1fae5'
                               e.target.style.borderColor = '#059669'
                             }}
                             onMouseLeave={(e) => {
                               e.target.style.backgroundColor = '#f0fdf4'
                               e.target.style.borderColor = '#10b981'
                             }}
                           >
                             +
                           </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              border: '2px solid #dc2626',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginLeft: '6px',
                              fontSize: '18px',
                              fontWeight: '700',
                              transition: 'all 0.2s',
                              boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#fecaca'
                              e.target.style.borderColor = '#b91c1c'
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = '#fef2f2'
                              e.target.style.borderColor = '#dc2626'
                            }}
                          >
                            ×
                          </button>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </div>

               {/* Cart Footer with Checkout */}
               {cart.length > 0 && (
                 <div style={{
                  padding: '16px',
                  borderTop: '2px solid var(--border)',
                  backgroundColor: 'var(--muted-bg)',
                   borderBottomLeftRadius: '12px',
                   borderBottomRightRadius: '12px'
                 }}>
                   {/* Order Type Toggle */}
                   <div style={{
                     display: 'flex',
                     gap: '8px',
                     marginBottom: '12px'
                   }}>
                     <button
                       type="button"
                       onClick={() => setCartOrderType('dine_in')}
                       style={{
                         flex: 1,
                         padding: '8px',
                         fontSize: '13px',
                         fontWeight: '600',
                        backgroundColor: cartOrderType === 'dine_in' ? '#3b82f6' : 'var(--panel-bg)',
                        color: cartOrderType === 'dine_in' ? '#ffffff' : 'var(--text)',
                         border: cartOrderType === 'dine_in' ? '2px solid #2563eb' : '2px solid var(--border)',
                         borderRadius: '8px',
                         cursor: 'pointer',
                         transition: 'all 0.2s'
                       }}
                     >
                       🍽️ Dine In
                     </button>
                     <button
                       type="button"
                       onClick={() => setCartOrderType('takeaway')}
                       style={{
                         flex: 1,
                         padding: '8px',
                         fontSize: '13px',
                         fontWeight: '600',
                        backgroundColor: cartOrderType === 'takeaway' ? '#3b82f6' : 'var(--panel-bg)',
                        color: cartOrderType === 'takeaway' ? '#ffffff' : 'var(--text)',
                         border: cartOrderType === 'takeaway' ? '2px solid #2563eb' : '2px solid var(--border)',
                         borderRadius: '8px',
                         cursor: 'pointer',
                         transition: 'all 0.2s'
                       }}
                     >
                       📦 Takeaway
                     </button>
                   </div>

                   {/* Price Breakdown */}
                   <div style={{ marginBottom: '12px' }}>
                     <div style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                       marginBottom: '6px',
                       fontSize: '13px',
                       color: 'var(--text-secondary)'
                     }}>
                       <span>Subtotal:</span>
                       <span>₹{getCartSubtotal()}</span>
                     </div>
                     <div style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                       marginBottom: '6px',
                       fontSize: '13px',
                       color: 'var(--text-secondary)'
                     }}>
                       <span>Takeaway Charges:</span>
                       <span>₹{getTakeawaySurcharge()}</span>
                     </div>
                     <div style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                       fontSize: '16px',
                       fontWeight: '700',
                       color: 'var(--text-primary)',
                       paddingTop: '8px',
                       borderTop: '1px solid var(--border)'
                     }}>
                       <span>Total:</span>
                       <span>₹{getCartTotal()}</span>
                     </div>
                   </div>

                   
                  <button
                     type="button"
                     onClick={() => handleCheckout(cartOrderType)}
                     style={{
                      width: '100%',
                      padding: '8px',
                      marginTop: '8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      backgroundColor: processingCheckout || canteenStatus === 'closed' || cart.length === 0 ? '#9ca3af' : '#10b981',
                      color: '#ffffff',
                      border: '1px solid #059669',
                      borderRadius: '8px',
                      cursor: processingCheckout || canteenStatus === 'closed' || cart.length === 0 ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: processingCheckout ? 0.8 : 1
                     }}
                    disabled={processingCheckout || canteenStatus === 'closed' || cart.length === 0}
                   >
                    {processingCheckout ? 'Processing…' : 'Checkout'}
                   </button>
                 </div>
               )}
             </div>
           </div>
        ) : null}
        {lastToken && (
          <div className="success-message">
            <div className="success-title">
              🎉 Order Placed Successfully!
            </div>
            <div className="token-number">
              Token No: #{lastToken}
            </div>
            <div className="success-description">
              Please note this token number for order tracking
            </div>
          </div>
        )}
        <div className="instructions-section">
          <strong>Instructions:</strong> Click on any menu item to place an order for cash payment. 
          Each order will be created with a unique token number and automatically appear in the Orders panel.
        </div>
      </Card>

      {/* Processing Overlay */}
      {processingCheckout && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <style>{`
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
          <div style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--text)'
          }}>
            <div style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: '3px solid var(--border)',
              borderTopColor: '#10b981',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>Processing checkout…</div>
          </div>
        </div>
      )}
      {lastToken && (
        <Card title="Your Token">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666', fontSize: '1.1em' }}>#{lastToken}</div>
            <div className="muted">Please share this token at the counter.</div>
          </div>
        </Card>
      )}

      {/* Floating Cart Icon (Hidden in Button Mode) */}
      {viewMode !== 'button' && (
      <div 
        className="floating-cart-icon"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '40px',
          zIndex: 9999
        }}
      >
        <button
          onClick={() => setShowCart(!showCart)}
          className="cart-icon-button"
          style={{
            width: '70px',
            height: '70px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            transition: 'all 0.3s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'scale(1.1)'
            e.target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.25)'
            e.target.style.backgroundColor = '#2563eb'
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'scale(1)'
            e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
            e.target.style.backgroundColor = '#3b82f6'
          }}
        >
          <ShoppingCart size={28} />
          {getCartItemCount() > 0 && (
            <div 
              className="cart-badge"
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                backgroundColor: '#ef4444',
                color: 'white',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                border: '2px solid white'
              }}
            >
              {getCartItemCount()}
            </div>
          )}
        </button>
      </div>
      )}
      {/* Cart Side Panel (Hidden in Button Mode) */}
      {viewMode !== 'button' && (
      <AnimatePresence>
        {showCart && (
          <>
            {/* Backdrop */}
            <div
              className="cart-backdrop"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 9998
              }}
              onClick={() => setShowCart(false)}
            />
            
            {/* Side Panel */}
            <motion.div
              className="cart-side-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: '400px',
                height: '100vh',
                backgroundColor: '#ffffff',
                borderLeft: '1px solid #e5e7eb',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)'
              }}
            >
              {/* Panel Header */}
              <div 
                className="cart-header"
                style={{
                  padding: '20px',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: '#f9fafb'
                }}
              >
                <h3 style={{ 
                  margin: 0, 
                  color: '#1f2937',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '18px',
                  fontWeight: '600'
                }}>
                  <ShoppingCart size={20} />
                  Your Cart
                </h3>
                <button 
                  onClick={() => setShowCart(false)}
                  className="cart-close-btn"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#f3f4f6'
                    e.target.style.borderColor = '#9ca3af'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#ffffff'
                    e.target.style.borderColor = '#d1d5db'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Panel Content */}
              <div 
                className="cart-content"
                style={{
                  flex: 1,
                  padding: '20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#ffffff'
                }}
              >
                {cart.length === 0 ? (
                  <div 
                    className="cart-empty-state"
                    style={{ 
                      textAlign: 'center', 
                      color: '#6b7280', 
                      padding: '40px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px'
                    }}
                  >
                    <ShoppingCart size={48} style={{ opacity: 0.3, color: 'var(--text-secondary)' }} />
                    <div style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)' }}>
                      Your cart is empty
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      Add some items to get started!
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Cart Items */}
                    <div style={{ flex: 1 }}>
                      {cart.map((item) => (
                        <div 
                          key={item.id} 
                          className="cart-item"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '12px',
                            marginBottom: '12px',
                            border: '1px solid #e5e7eb',
                            gap: '12px'
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ 
                              fontWeight: '500', 
                              color: '#1f2937',
                              marginBottom: '4px',
                              fontSize: '16px',
                              wordWrap: 'break-word',
                              overflowWrap: 'break-word'
                            }}>
                              {item.name}
                            </div>
                            <div style={{ 
                              fontSize: '14px', 
                              color: '#6b7280' 
                            }}>
                              ₹{item.price} each
                            </div>
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            flexShrink: 0
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}
                                className="quantity-btn"
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  border: '1px solid #d1d5db',
                                  backgroundColor: '#ffffff',
                                  color: '#374151',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.2s ease',
                                  fontSize: '16px',
                                  fontWeight: 'bold'
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.backgroundColor = '#f3f4f6'
                                  e.target.style.borderColor = '#9ca3af'
                                  e.target.style.color = '#1f2937'
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.backgroundColor = '#ffffff'
                                  e.target.style.borderColor = '#d1d5db'
                                  e.target.style.color = '#374151'
                                }}
                              >
                                <Minus size={16} />
                              </button>
                              
                              <input
                                type="number"
                                min="0"
                                value={item.quantity}
                                onChange={(e) => {
                                  const newQuantity = parseInt(e.target.value) || 0
                                  updateCartItemQuantity(item.id, newQuantity)
                                }}
                                onBlur={(e) => {
                                  const value = e.target.value.trim()
                                  const newQuantity = parseInt(value) || 0
                                  
                                  // Only remove if quantity is explicitly 0 and not just empty
                                  if (value === '0' || (newQuantity <= 0 && value !== '')) {
                                    removeFromCart(item.id)
                                  } else if (value === '' || newQuantity < 1) {
                                    // If empty or invalid, reset to minimum quantity of 1
                                    updateCartItemQuantity(item.id, 1)
                                  }
                                }}
                                onKeyDown={(e) => {
                                  // Prevent accidental deletion on backspace when field is empty
                                  if (e.key === 'Backspace' && e.target.value === '') {
                                    e.preventDefault()
                                    e.target.value = '1'
                                    updateCartItemQuantity(item.id, 1)
                                  }
                                  // Allow Enter to confirm changes
                                  if (e.key === 'Enter') {
                                    e.target.blur()
                                  }
                                }}
                                style={{
                                  width: '50px',
                                  height: '32px',
                                  textAlign: 'center',
                                  fontWeight: '500',
                                  color: '#1f2937',
                                  fontSize: '16px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  backgroundColor: '#ffffff',
                                  outline: 'none',
                                  padding: '0 4px'
                                }}
                                onFocus={(e) => e.target.select()}
                              />
                              
                              <button
                                onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}
                                className="quantity-btn"
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  border: '1px solid #d1d5db',
                                  backgroundColor: '#ffffff',
                                  color: '#374151',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.2s ease',
                                  fontSize: '16px',
                                  fontWeight: 'bold'
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.backgroundColor = '#f3f4f6'
                                  e.target.style.borderColor = '#9ca3af'
                                  e.target.style.color = '#1f2937'
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.backgroundColor = '#ffffff'
                                  e.target.style.borderColor = '#d1d5db'
                                  e.target.style.color = '#374151'
                                }}
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                            
                            <div style={{ 
                              fontWeight: '600',
                              color: '#1f2937',
                              minWidth: '60px',
                              textAlign: 'right',
                              fontSize: '16px'
                            }}>
                              ₹{item.price * item.quantity}
                            </div>
                            
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="remove-btn"
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease',
                                marginLeft: '8px'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#dc2626'
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.backgroundColor = '#ef4444'
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Cart Footer */}
                    <div 
                      className="cart-footer"
                      style={{
                        borderTop: '1px solid #e5e7eb',
                        paddingTop: '20px',
                        marginTop: '20px'
                      }}
                    >
                      <div style={{ marginBottom: '20px' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                          marginBottom: '8px'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          {cartOrderType === 'takeaway' && cart.length > 0 ? (
                            <>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                ₹{getCartSubtotal()} + ₹{getTakeawaySurcharge()} =
                              </div>
                              <div style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', lineHeight: 1.2 }}>
                          Total: ₹{getCartTotal()}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937' }}>
                              Total: ₹{getCartTotal()}
                            </div>
                          )}
                        </div>
                        <div style={{ 
                          fontSize: '14px', 
                          color: '#6b7280' 
                        }}>
                          {getCartItemCount()} items
                        </div>
                        </div>
                        
                        {/* Takeaway Surcharge Notice */}
                        {cartOrderType === 'takeaway' && cart.length > 0 && (
                          <div style={{
                            fontSize: '12px',
                            color: '#f59e0b',
                            backgroundColor: '#fef3c7',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            border: '1px solid #fbbf24'
                          }}>
                            <span>💼</span>
                            <span>Takeaway surcharge: +₹10 per item included</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Order Type Selector */}
                      <div style={{
                        display: 'flex',
                        gap: '10px',
                        marginBottom: '12px',
                        alignItems: 'center'
                      }}>
                        <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>Order Type:</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="orderType"
                            value="dine_in"
                            checked={cartOrderType === 'dine_in'}
                            onChange={() => setCartOrderType('dine_in')}
                          />
                          <span>🍽️ Dine In</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="orderType"
                            value="takeaway"
                            checked={cartOrderType === 'takeaway'}
                            onChange={() => setCartOrderType('takeaway')}
                          />
                          <span>🥡 Takeaway</span>
                        </label>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                        <button
                          onClick={() => {
                            setShowConfirmModal({
                              title: 'Clear Cart?',
                              message: 'This will remove all items from the cart. You cannot undo this action.',
                              confirmText: 'Clear Cart',
                              confirmStyle: 'danger',
                              onConfirm: () => {
                                setCart([])
                                setToastMessage({ type: 'success', message: 'Cart cleared!' })
                                setTimeout(() => setToastMessage(null), 2000)
                              }
                            })
                          }}
                          className="clear-cart-btn"
                          style={{ 
                            width: '100%',
                            padding: '10px 16px',
                            fontSize: '14px',
                            fontWeight: '500',
                            backgroundColor: '#ffffff',
                            color: '#dc2626',
                            border: '1px solid #dc2626',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#fef2f2'
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = '#ffffff'
                          }}
                        >
                          <X size={16} />
                          Clear Cart
                        </button>

                      <button
                        onClick={() => {
                          if (processingCheckout || canteenStatus === 'closed' || cart.length === 0) return
                          handleCheckout(cartOrderType)
                        }}
                        className="checkout-btn"
                        disabled={processingCheckout || canteenStatus === 'closed' || cart.length === 0}
                        style={{ 
                          width: '100%',
                          padding: '12px 16px',
                          fontSize: '16px',
                          fontWeight: '600',
                          backgroundColor: processingCheckout || canteenStatus === 'closed' || cart.length === 0 ? '#9ca3af' : '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: processingCheckout || canteenStatus === 'closed' || cart.length === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.2s ease',
                          opacity: processingCheckout ? 0.85 : 1
                        }}
                      >
                        {processingCheckout ? 'Processing…' : canteenStatus === 'closed' ? 'Canteen Closed' : 'Place Order'}
                      </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      )}
      {/* Local Toast (website-only) - Top Center */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            style={{
              position: 'fixed',
              top: 16,
              left: 0,
              right: 0,
              margin: '0 auto',
              zIndex: 10000,
              background: toastMessage.type === 'success' 
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: 'white',
              padding: '12px 16px',
              borderRadius: 10,
              boxShadow: '0 14px 30px rgba(0,0,0,0.22)',
              fontWeight: 700,
              maxWidth: 520,
              width: 'calc(100% - 32px)',
              textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.15)',
              backdropFilter: 'blur(6px)'
            }}
          >
            {toastMessage.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Modal (professional, native style) */}
      <AnimatePresence>
        {showConfirmModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmModal(null)}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 10000,
                backdropFilter: 'blur(2px)'
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#ffffff',
                color: '#111827',
                borderRadius: 12,
                width: '90%',
                maxWidth: 420,
                padding: 20,
                zIndex: 10001,
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  backgroundColor: showConfirmModal.confirmStyle === 'danger' ? '#fee2e2' : '#eff6ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <AlertCircle size={20} style={{ color: showConfirmModal.confirmStyle === 'danger' ? '#dc2626' : '#2563eb' }} />
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{showConfirmModal.title || 'Are you sure?'}</h3>
              </div>
              <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#4b5563' }}>
                {showConfirmModal.message || 'Please confirm your action.'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setShowConfirmModal(null)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    try { showConfirmModal.onConfirm && showConfirmModal.onConfirm() } finally { setShowConfirmModal(null) }
                  }}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: showConfirmModal.confirmStyle === 'danger' ? '#ef4444' : '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  {showConfirmModal.confirmText || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      
    </div>
  )
}
function OrdersTable({ withTitle = true, orders = [], orderItems = [], onUpdateStatus = () => {}, onCancel = () => {}, idHeader = 'Order ID', updatingIds = {}, selectMode = false, selectedOrderIds = new Set(), onToggleSelect = () => {}, onToggleSelectAll = () => {} }) {
  // Live ticking 'now' for elapsed timers
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => {
    const intervalId = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(intervalId)
  }, [])

  const formatElapsed = (startTs) => {
    const startMs = startTs ? new Date(startTs).getTime() : 0
    const elapsed = Math.max(0, Math.floor(((nowMs || Date.now()) - (isFinite(startMs) ? startMs : 0)) / 1000))
    const hours = Math.floor(elapsed / 3600)
    const minutes = Math.floor((elapsed % 3600) / 60)
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}`
    return `${minutes}m`
  }

  // Get order items for each order
  const getOrderItemsForOrder = (orderId) => {
    return orderItems.filter(item => item.order_id === orderId)
  }

  // Get order type display text
  // order_type is a boolean: false = Dine In, true = Takeaway
  const getOrderTypeText = (orderType) => {
    // Handle boolean values from database
    if (typeof orderType === 'boolean') {
      return orderType ? '🥡 Takeaway' : '🍽️ Dine In'
    }
    // Handle legacy string values for backwards compatibility
    if (orderType === 'takeaway') return '🥡 Takeaway'
    if (orderType === 'dine_in') return '🍽️ Dine In'
    // Default to Dine In
    return '🍽️ Dine In'
  }

  const displayedOrders = orders

  return (
    <Card title={withTitle ? 'Orders' : undefined}>
      <table className="table orders-table">
        <thead>
          <tr>
            {selectMode && (
              <th style={{ width: '3%', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={displayedOrders.length > 0 && displayedOrders.every(o => selectedOrderIds.has(o.id))}
                  onChange={(e) => onToggleSelectAll(displayedOrders, e.target.checked)}
                />
              </th>
            )}
            <th style={{ width: '7%' }}>{idHeader}</th>
            <th style={{ width: '24%' }}>Items</th>
            <th style={{ width: '6%', textAlign: 'left' }}>Quantity</th>
            <th style={{ width: '9%' }}>Total</th>
            <th style={{ width: '11%', textAlign: 'center' }}>Status</th>
            <th style={{ width: '8%', textAlign: 'center' }}>Type</th>
            <th style={{ width: '10%', textAlign: 'center' }}>Placed By</th>
            <th style={{ width: '22%', textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayedOrders.map((o) => {
            const itemsForOrder = getOrderItemsForOrder(o.id)
            const effectiveItemsForOrder = (itemsForOrder && itemsForOrder.length > 0)
              ? itemsForOrder
              : [{ food_items: { name: o.item_name, price: o.total_amount || 0 }, quantity: 1 }]
            const hasCartItems = effectiveItemsForOrder.length > 0
            
            return (
              <tr key={o.id}>
                {selectMode && (
                  <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.has(o.id)}
                      onChange={() => onToggleSelect(o)}
                    />
                  </td>
                )}
                <td style={{ verticalAlign: 'middle' }}>
                  <span 
                    className="dark:!text-white"
                    style={{ fontFamily: 'monospace', fontWeight: '800' }}
                  >
                    {(o.token_no || o.order_token) ? ('#' + (o.token_no || o.order_token)) : 'Not available'}
                  </span>
                </td>
                <td style={{ position: 'relative', verticalAlign: 'middle' }}>
                  {hasCartItems ? (
                    <div className="order-items-cell" style={{ minWidth: '200px', maxWidth: '300px' }}>
                            {effectiveItemsForOrder.map((item, index) => {
                              return (
                          <div key={index} style={{ 
                            marginBottom: index < itemsForOrder.length - 1 ? '4px' : '0',
                            fontSize: '14px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                                  <strong>{item.food_items?.name || item.item_name || item.name || 'Unknown Item'}</strong>
                                </div>
                              )
                            })}
                    </div>
                  ) : (
                    <div>
                      <strong>{o.item_name || 'Unknown Item'}</strong>
                    </div>
                  )}
                </td>
                <td style={{ verticalAlign: 'middle' }}>
                  {hasCartItems ? (
                    <div style={{ minWidth: '40px' }}>
                      {effectiveItemsForOrder.map((item, index) => (
                        <div key={index} style={{ marginBottom: index < itemsForOrder.length - 1 ? '4px' : '0', fontSize: '14px' }}>
                          {item.quantity || 1}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px' }}>1</div>
                  )}
                </td>
                <td style={{ verticalAlign: 'middle' }}>{o.total_amount != null ? `₹${o.total_amount}` : '-'}</td>
                
                {/* Status Column with ETA */}
                <td style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div>
                {normStatus(o.status) === 'PENDING' && <span className="badge pending">PENDING</span>}
                {normStatus(o.status) === 'PREPARING' && <span className="badge preparing">PREPARING</span>}
                {normStatus(o.status) === 'READY' && <span className="badge ready">READY</span>}
                    </div>
                    <div title={o.created_at ? `Started: ${new Date(o.created_at).toLocaleString()}` : ''} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                      <Clock4 size={14} />
                      <span>{formatElapsed(o.created_at)}</span>
                    </div>
                  </div>
              </td>
                
                {/* Type Column */}
                <td style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>
                    {getOrderTypeText(o.order_type)}
                  </span>
                </td>
               <td style={{ verticalAlign: 'middle' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', justifyContent: 'center' }}>
                   {isWebsiteCounter(o.user_id) ? (
                     <UserCheck className="w-5 h-5 text-gray-700 dark:text-white" />
                   ) : (
                     <GraduationCap className="w-5 h-5 text-gray-700 dark:text-white" />
                   )}
                 </div>
               </td>
              <td style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                <div className="actions" style={{ justifyContent: 'center' }}>
                {updatingIds[o.id] ? (
                  <button className="btn" disabled style={{ minWidth: '140px' }}><span className="spinner" style={{ marginRight: 6 }} />Updating...</button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {normStatus(o.status) === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn" onClick={() => onUpdateStatus(o.id, 'PREPARING')} style={{ minWidth: '110px' }}>Mark Preparing</button>
                        <button 
                          className="btn" 
                          onClick={() => onCancel(o.id)}
                          title="Cancel order"
                          aria-label="Cancel order"
                          style={{ 
                            backgroundColor: '#ef4444', 
                            color: 'white',
                            border: 'none',
                            width: 36,
                            height: 36,
                            minWidth: 36,
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                    {normStatus(o.status) === 'PREPARING' && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn" onClick={() => onUpdateStatus(o.id, 'READY')} style={{ minWidth: '110px' }}>Mark Ready</button>
                        <button 
                          className="btn" 
                          onClick={() => onCancel(o.id)}
                          title="Cancel order"
                          aria-label="Cancel order"
                          style={{ 
                            backgroundColor: '#ef4444', 
                            color: 'white',
                            border: 'none',
                            width: 36,
                            height: 36,
                            minWidth: 36,
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                    {normStatus(o.status) === 'READY' && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn" onClick={() => onUpdateStatus(o.id, 'DELIVERED')} style={{ minWidth: '120px' }}>Mark Delivered</button>
                        <button 
                          className="btn" 
                          onClick={() => onCancel(o.id)}
                          title="Cancel order"
                          aria-label="Cancel order"
                          style={{ 
                            backgroundColor: '#ef4444', 
                            color: 'white',
                            border: 'none',
                            width: 36,
                            height: 36,
                            minWidth: 36,
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
                </div>
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
function OrdersPage({ orders, deliveredOrders
  = [], activity = [], onUpdateStatus, onRevert, onCancel, onCancelOrder, view = 'live', pictureMode = false, updatingIds = {} }) {
  console.log('🔍 OrdersPage received view:', view)
  const isLive = view === 'live'
  const [foodItems, setFoodItems] = useState([])
  const orderItems = useMemo(() => {
    if (!orders || orders.length === 0) return []

    const byId = new Map()
    const byName = new Map()

    for (const item of foodItems || []) {
      const idCandidates = [
        item?.id,
        item?.item_id,
        item?.code,
        item?.slug
      ]
        .map((v) => (v != null ? String(v).toLowerCase() : null))
        .filter(Boolean)
      const nameCandidate = (item?.name || item?.item_name || '')
        .toLowerCase()
        .trim()

      for (const key of idCandidates) {
        if (!byId.has(key)) {
          byId.set(key, item)
        }
      }

      if (nameCandidate && !byName.has(nameCandidate)) {
        byName.set(nameCandidate, item)
      }
    }

    return orders.map((order) => {
      const orderIdKeys = [
        order?.food_item_id,
        order?.foodItemId,
        order?.item_id,
        order?.itemId,
        order?.item
      ]
        .map((v) => (v != null ? String(v).toLowerCase() : null))
        .filter(Boolean)

      let matchedFoodItem = null
      for (const key of orderIdKeys) {
        if (byId.has(key)) {
          matchedFoodItem = byId.get(key)
          break
        }
      }

      if (!matchedFoodItem) {
        const nameKey = (order?.item_name || '')
          .toLowerCase()
          .trim()
        if (nameKey && byName.has(nameKey)) {
          matchedFoodItem = byName.get(nameKey)
        }
      }

      const quantityRaw = order?.quantity != null ? Number(order.quantity) : 1
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1
      const totalAmount =
        order?.total_amount != null && !Number.isNaN(Number(order.total_amount))
          ? Number(order.total_amount)
          : null
      const pricePerUnit =
        totalAmount != null && quantity
          ? Number((totalAmount / quantity).toFixed(2))
          : totalAmount

      return {
        order_id: order?.id,
        item_name: order?.item_name,
        quantity,
        price_per_unit: Number.isFinite(pricePerUnit) ? pricePerUnit : null,
        total_price: totalAmount,
        food_items: matchedFoodItem
          ? {
              name: matchedFoodItem?.name ?? matchedFoodItem?.item_name ?? null,
              image_url: matchedFoodItem?.image_url ?? null,
              price:
                matchedFoodItem?.price != null && !Number.isNaN(Number(matchedFoodItem.price))
                  ? Number(matchedFoodItem.price)
                  : null,
            }
          : null,
      }
    })
  }, [orders, foodItems])
  const [showBulkCancel, setShowBulkCancel] = useState(false)
  const [bulkActionMode, setBulkActionMode] = useState('cancel') // 'cancel' or 'deliver'
  
  const [bulkCancelTokens, setBulkCancelTokens] = useState('')
  const [bulkCancelLoading, setBulkCancelLoading] = useState(false)
  const [bulkCancelMessage, setBulkCancelMessage] = useState({ text: '', type: '' })
  const [showBulkCancelConfirm, setShowBulkCancelConfirm] = useState(false)
  const [bulkCancelOrders, setBulkCancelOrders] = useState([])
  const [tokenSearch, setTokenSearch] = useState('')
  const tokenSearchRef = useRef(null)
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set())

  const normalizedTokenSearch = tokenSearch.trim()
  const displayedOrders = normalizedTokenSearch
    ? orders.filter(o => String(o.token_no || o.order_token || '').includes(normalizedTokenSearch))
    : orders
  const filteredDeliveredOrders = normalizedTokenSearch
    ? deliveredOrders.filter(o => String(o.token_no || o.order_token || '').includes(normalizedTokenSearch))
    : deliveredOrders
  const isDarkTheme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  
  // Listen for bulk cancel button click from header
  useEffect(() => {
    const handleBulkCancelClick = () => {
      if (isLive) {
        setShowBulkCancel(true)
      }
    }
    
    window.addEventListener('openBulkCancel', handleBulkCancelClick)
    
    return () => {
      window.removeEventListener('openBulkCancel', handleBulkCancelClick)
    }
  }, [isLive])

  // Close Bulk Update on Escape
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        setShowBulkCancel(false)
        setShowBulkCancelConfirm(false)
      }
    }
    if (showBulkCancel || showBulkCancelConfirm) {
      window.addEventListener('keydown', onEsc)
    }
    return () => window.removeEventListener('keydown', onEsc)
  }, [showBulkCancel, showBulkCancelConfirm])

  // Listen for 'S' key to focus search input
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only trigger if 'S' is pressed and no input/textarea is focused
      if (e.key.toLowerCase() === 's' && 
          document.activeElement.tagName !== 'INPUT' && 
          document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault()
        if (tokenSearchRef.current) {
          tokenSearchRef.current.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
  
  const selectedOrdersList = orders.filter(o => selectedOrderIds.has(o.id))

  const toggleSelectOrder = (order) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (next.has(order.id)) {
        next.delete(order.id)
      } else {
        next.add(order.id)
      }
      return next
    })
  }

  const toggleSelectAllVisible = (visibleOrders, checked) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (checked) {
        visibleOrders.forEach(o => next.add(o.id))
      } else {
        visibleOrders.forEach(o => next.delete(o.id))
      }
      return next
    })
  }

  // Helper function to get the next status and button text for Picture Mode
  const getNextStatusInfo = (currentStatus) => {
    const status = normStatus(currentStatus)
    switch (status) {
      case 'PENDING':
        return { nextStatus: 'PREPARING', buttonText: 'Start Preparing', buttonClass: 'btn-primary' }
      case 'PREPARING':
        return { nextStatus: 'READY', buttonText: 'Mark Ready', buttonClass: 'btn-success' }
      case 'READY':
        return { nextStatus: 'DELIVERED', buttonText: 'Mark Delivered', buttonClass: 'btn-primary' }
      default:
        return null
    }
  }
  
  // Fetch food_items to enrich order metadata
  useEffect(() => {
    let isActive = true

    const fetchFoodItems = async () => {
      try {
        const pageSize = 1000
        let from = 0
        let allFoodItems = []

        while (true) {
          const to = from + pageSize - 1
          const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .range(from, to)
          if (error) throw error
          const batch = data || []
          allFoodItems = allFoodItems.concat(batch)
          if (batch.length < pageSize) break
          from += pageSize
        }

        if (isActive) {
          setFoodItems(allFoodItems)
        }
      } catch (e) {
        console.error('Failed to fetch data for orders:', e)
        if (isActive) {
          setFoodItems([])
        }
      }
    }

    fetchFoodItems()

    return () => {
      isActive = false
    }
  }, [])
  
  const tokenFor = (orderId) => {
    try {
      const found = orders.find(o => o.id === orderId) || deliveredOrders.find(o => o.id === orderId)
      const t = found && (found.token_no || found.order_token)
      return t ? ('#' + t) : 'Not available'
    } catch (_) { return 'Not available' }
  }
  
  // Get grouped order items for an order
  const getOrderItemsForOrder = (orderId) => {
    return orderItems.filter(item => item.order_id === orderId)
  }

  // Get order type display text
  // order_type is a boolean: false = Dine In, true = Takeaway
  const getOrderTypeText = (orderType) => {
    // Handle boolean values from database
    if (typeof orderType === 'boolean') {
      return orderType ? '🥡 Takeaway' : '🍽️ Dine In'
    }
    // Handle legacy string values for backwards compatibility
    if (orderType === 'takeaway') return '🥡 Takeaway'
    if (orderType === 'dine_in') return '🍽️ Dine In'
    // Default to Dine In
    return '🍽️ Dine In'
  }

  const getImageForOrder = (order) => {
    // For new cart-based orders, prefer derived order item metadata
    const orderItemsForOrder = getOrderItemsForOrder(order.id)
    if (orderItemsForOrder.length > 0) {
      const firstItem = orderItemsForOrder[0]
      if (firstItem.food_items && firstItem.food_items.image_url) {
        return firstItem.food_items.image_url
      }
    }

    // Fallback to old method for legacy orders
    const itemName = (order.item_name || '').toLowerCase()
    const matchingItem = foodItems.find(item => {
      const dbName = (item.name || item.item_name || '').toLowerCase()
      return dbName === itemName || dbName.includes(itemName) || itemName.includes(dbName)
    })
    
    if (matchingItem && matchingItem.image_url) {
      return matchingItem.image_url
    }
    
    // Fallback to hardcoded images if no match found
    if (itemName.includes('samosa')) {
      return 'https://as2.ftcdn.net/v2/jpg/15/85/73/65/1000_F_1585736532_NFMq8z0vAjbker6w9vuzoF8FmsxVRGPI.jpg'
    } else if (itemName.includes('biryani')) {
      return 'https://as1.ftcdn.net/v2/jpg/04/59/27/88/1000_F_459278894_92eSlejnR7NSwJRCbVyy9ZZibSmjbF8q.jpg'
    } else if (itemName.includes('dosa')) {
      return 'https://as2.ftcdn.net/v2/jpg/14/45/94/59/1000_F_1445945944_eBUM7ot1AWezNkqknKsRImNvLvFbmr7z.jpg'
    }
    
    return 'https://via.placeholder.com/300?text=Food'
  }

  // Handle bulk action (cancel or deliver) orders by token numbers
  const handleBulkAction = async (actionMode) => {
    // Use the passed actionMode parameter instead of state
    const mode = actionMode || bulkActionMode
    
    // Prefer selected orders from table; fallback to manual tokens if any
    const selectedTokens = orders
      .filter(o => selectedOrderIds.has(o.id))
      .map(o => String(o.token_no || o.order_token))
      .filter(Boolean)
    const tokensSource = selectedTokens.length > 0 ? selectedTokens.join(',') : bulkCancelTokens
    if (!tokensSource.trim()) {
      setBulkCancelMessage({ text: 'Please select orders from the table', type: 'error' })
      return
    }

    // For cancel action, show custom confirmation modal
    if (mode === 'cancel') {
      // Parse token numbers first to get orders
      const tokenArray = tokensSource
        .split(/[,\s\n]+/)
        .map(t => t.trim().replace(/^#/, '')) // Remove # if present
        .filter(t => t.length > 0)

      if (tokenArray.length === 0) {
        setBulkCancelMessage({ text: 'No valid token numbers found', type: 'error' })
        return
      }

      // Find all orders with matching tokens
      const ordersToProcess = orders.filter(order => {
        const orderToken = order.token_no || order.order_token
        return orderToken && tokenArray.includes(String(orderToken))
      })

      if (ordersToProcess.length === 0) {
        setBulkCancelMessage({ 
          text: `No orders found with token numbers: ${tokenArray.join(', ')}`, 
          type: 'error' 
        })
        return
      }

      // Show custom confirmation modal
      console.log('📋 Showing confirmation modal for orders:', ordersToProcess)
      setBulkCancelOrders(ordersToProcess)
      setShowBulkCancelConfirm(true)
      return
    }

    setBulkCancelLoading(true)
    setBulkCancelMessage({ text: '', type: '' })

    try {
      // Parse token numbers from input (comma, space, or newline separated)
      const tokenArray = tokensSource
        .split(/[,\s\n]+/)
        .map(t => t.trim().replace(/^#/, '')) // Remove # if present
        .filter(t => t.length > 0)

      if (tokenArray.length === 0) {
        setBulkCancelMessage({ text: 'No valid token numbers found', type: 'error' })
        setBulkCancelLoading(false)
        return
      }

      console.log(`🔍 Bulk ${mode === 'cancel' ? 'Cancel' : 'Mark Delivered'}: Looking for orders with tokens:`, tokenArray)

      // Find all orders with matching tokens
      const ordersToProcess = orders.filter(order => {
        const orderToken = order.token_no || order.order_token
        return orderToken && tokenArray.includes(String(orderToken))
      })

      if (ordersToProcess.length === 0) {
        setBulkCancelMessage({ 
          text: `No orders found with token numbers: ${tokenArray.join(', ')}`, 
          type: 'error' 
        })
        setBulkCancelLoading(false)
        return
      }

      console.log(`✅ Found ${ordersToProcess.length} orders to ${mode}`)

      // Process each order
      let successCount = 0
      let failedCount = 0
      const failedTokens = []

      for (const order of ordersToProcess) {
        try {
          const orderToken = order.token_no || order.order_token
          console.log(`${mode === 'cancel' ? 'Cancelling' : 'Marking delivered'} order with token #${orderToken}`)
          
          if (mode === 'cancel') {
            // Perform the actual cancellation (confirmation already shown above)
            const orderToken = order.token_no || order.order_token
            
            // Get order details
            const { data: orderData, error: orderFetchError } = await supabase
              .from('orders')
              .select('item_name, status, id')
              .eq('id', order.id)
              .single()

            if (orderFetchError) {
              throw new Error(`Failed to fetch order: ${orderFetchError.message}`)
            }

            // Update order status to cancelled
            const { error: updateError } = await supabase
              .from('orders')
              .update({ 
                status: 'cancelled',
                updated_at: new Date().toISOString()
              })
              .eq('id', order.id)
            
            if (updateError) {
              throw new Error(`Failed to cancel order: ${updateError.message}`)
            }

            // Restore stock
            if (orderData.item_name) {
              const { data: currentStock } = await supabase
                .from('food_items')
                .select('available_quantity')
                .eq('name', orderData.item_name)
                .single()
              
              if (currentStock) {
                await supabase
                  .from('food_items')
                  .update({
                    available_quantity: currentStock.available_quantity + 1,
                    is_available: true,
                    updated_at: new Date().toISOString()
                  })
                  .eq('name', orderData.item_name)
              }
            }
          } else {
            // Mark as delivered
            await onUpdateStatus(order.id, 'DELIVERED')
          }
          successCount++
        } catch (error) {
          console.error(`Failed to ${mode === 'cancel' ? 'cancel' : 'mark delivered'} order ${order.id}:`, error)
          failedCount++
          failedTokens.push(order.token_no || order.order_token)
        }
      }

      // Show results
      if (successCount === ordersToProcess.length) {
        const actionText = mode === 'cancel' ? 'cancelled' : 'marked as delivered'
        setBulkCancelMessage({ 
          text: `✅ Successfully ${actionText} ${successCount} order(s)`, 
          type: 'success' 
        })
        setBulkCancelTokens('') // Clear input on success
        
        // Close modal after 2 seconds
        setTimeout(() => {
          setShowBulkCancel(false)
          setBulkCancelMessage({ text: '', type: '' })
        }, 2000)
      } else {
        const actionText = mode === 'cancel' ? 'Cancelled' : 'Marked delivered'
        setBulkCancelMessage({ 
          text: `⚠️ ${actionText} ${successCount} order(s). Failed: ${failedCount} (Tokens: ${failedTokens.join(', ')})`, 
          type: 'warning' 
        })
      }

    } catch (error) {
      console.error(`❌ Bulk ${mode} error:`, error)
      setBulkCancelMessage({ 
        text: `Error: ${error.message}`, 
        type: 'error' 
      })
    } finally {
      setBulkCancelLoading(false)
    }
  }

  // Handle bulk cancel confirmation
  const handleBulkCancelConfirm = async () => {
    setShowBulkCancelConfirm(false)
    setBulkCancelLoading(true)
    setBulkCancelMessage({ text: '', type: '' })

    try {
      let successCount = 0
      let failedCount = 0
      const failedTokens = []

      for (const order of bulkCancelOrders) {
        try {
          const orderToken = order.token_no || order.order_token
          console.log(`Cancelling order with token #${orderToken}`)
          
          // Get order details
          const { data: orderData, error: orderFetchError } = await supabase
            .from('orders')
            .select('item_name, status, id')
            .eq('id', order.id)
            .single()

          if (orderFetchError) {
            throw new Error(`Failed to fetch order: ${orderFetchError.message}`)
          }

          // Update order status to cancelled
          const { error: updateError } = await supabase
            .from('orders')
            .update({ 
              status: 'cancelled',
              updated_at: new Date().toISOString()
            })
            .eq('id', order.id)
          
          if (updateError) {
            throw new Error(`Failed to cancel order: ${updateError.message}`)
          }

          // Restore stock
          if (orderData.item_name) {
            const { data: currentStock } = await supabase
              .from('food_items')
              .select('available_quantity')
              .eq('name', orderData.item_name)
              .single()
            
            if (currentStock) {
              await supabase
                .from('food_items')
                .update({
                  available_quantity: currentStock.available_quantity + 1,
                  is_available: true,
                  updated_at: new Date().toISOString()
                })
                .eq('name', orderData.item_name)
            }
          }
          
          successCount++
        } catch (error) {
          console.error(`Failed to cancel order ${order.id}:`, error)
          failedCount++
          failedTokens.push(order.token_no || order.order_token)
        }
      }

      // Show results
      if (successCount === bulkCancelOrders.length) {
        setBulkCancelMessage({ 
          text: `✅ Successfully cancelled ${successCount} order(s)`, 
          type: 'success' 
        })
        setBulkCancelTokens('') // Clear input on success
        
        // Close modal after 2 seconds
        setTimeout(() => {
          setShowBulkCancel(false)
          setBulkCancelMessage({ text: '', type: '' })
        }, 2000)
      } else {
        setBulkCancelMessage({ 
          text: `⚠️ Cancelled ${successCount} order(s). Failed: ${failedCount} (Tokens: ${failedTokens.join(', ')})`, 
          type: 'warning' 
        })
      }

    } catch (error) {
      console.error('❌ Bulk cancel error:', error)
      setBulkCancelMessage({ 
        text: `Error: ${error.message}`, 
        type: 'error' 
      })
    } finally {
      setBulkCancelLoading(false)
    }
  }
  return (
    <div className="home-dashboard">
      {view !== 'activity' && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '0 4px',
            marginBottom: pictureMode && isLive ? 12 : 16,
          }}
        >
          <input
            ref={tokenSearchRef}
            value={tokenSearch}
            onChange={(e) => setTokenSearch(e.target.value)}
            placeholder="Search token number (press S)"
            style={{
              width: 'min(320px, 100%)',
              padding: '8px 14px',
              borderRadius: 10,
              border: `1px solid ${isDarkTheme ? '#374151' : '#d1d5db'}`,
              backgroundColor: isDarkTheme ? '#0f172a' : '#ffffff',
              color: isDarkTheme ? '#e5e7eb' : '#111827',
              fontSize: 13,
              boxShadow: isDarkTheme
                ? '0 1px 2px rgba(15, 23, 42, 0.35)'
                : '0 1px 2px rgba(148, 163, 184, 0.25)',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = isDarkTheme ? '#60a5fa' : '#2563eb'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = isDarkTheme ? '#374151' : '#d1d5db'
            }}
          />
        </div>
      )}

      {view === 'activity' ? (
        <Card title={undefined}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Item Name</th>
                <th style={{ width: '15%', textAlign: 'center' }}>Token No</th>
                <th style={{ width: '20%', textAlign: 'center' }}>From → To</th>
                <th style={{ width: '20%', textAlign: 'center' }}>At</th>
                <th style={{ width: '20%', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activity.slice(0, 20).map((e, idx) => {
                // Check if action is within 5 minutes (300,000 milliseconds)
                const fiveMinutes = 5 * 60 * 1000
                const isWithinFiveMinutes = e.ts && (Date.now() - e.ts < fiveMinutes)
                
                return (
                  <tr key={idx}>
                    <td style={{ verticalAlign: 'middle' }}>
                      <strong>{e.itemName || 'Order Item'}</strong>
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666' }}>
                        {tokenFor(e.orderId)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <span style={{ whiteSpace: 'nowrap' }}>{e.from} → {e.to}</span>
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: '13px' }}>
                      {e.at}
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {isWithinFiveMinutes ? (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => onRevert(e)}
                          style={{ minWidth: '80px', margin: '0 auto' }}
                        >
                          Revert
                        </button>
                      ) : (
                        <span style={{ 
                          fontSize: '12px', 
                          color: '#9ca3af', 
                          fontStyle: 'italic',
                          whiteSpace: 'nowrap'
                        }}>
                          Expired
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      ) : isLive ? (
        pictureMode ? (
          <Card title={undefined}>
            <div className="cards-grid">
              {displayedOrders.length === 0 ? (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    padding: '32px 0',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: 14,
                  }}
                >
                  No live orders match that token.
                </div>
              ) : (
                displayedOrders.map((o) => {
                  const itemsForOrder = getOrderItemsForOrder(o.id)
                  const effectiveItemsForOrder =
                    itemsForOrder && itemsForOrder.length > 0
                      ? itemsForOrder
                      : [{ food_items: { name: o.item_name, price: o.total_amount || 0, image_url: null }, quantity: 1 }]
                  const statusBadges = (
                    <div style={{ marginBottom: 12 }}>
                      {normStatus(o.status) === 'PENDING' && <span className="badge pending">PENDING</span>}
                      {normStatus(o.status) === 'PREPARING' && <span className="badge preparing">PREPARING</span>}
                      {normStatus(o.status) === 'READY' && <span className="badge ready">READY</span>}
                      {normStatus(o.status) === 'DELIVERED' && <span className="badge ready">DELIVERED</span>}
                    </div>
                  )
                  const renderActionButtons = () => {
                    if (updatingIds && updatingIds[o.id]) {
                      return (
                        <button className="btn" disabled style={{ minWidth: '140px' }}>
                          <span className="spinner" style={{ marginRight: 6 }} />
                          Updating...
                        </button>
                      )
                    }
                    const statusInfo = getNextStatusInfo(o.status)
                    if (!statusInfo) return null
                    return (
                      <>
                        <button
                          className={`btn ${statusInfo.buttonClass}`}
                          onClick={() => onUpdateStatus(o.id, statusInfo.nextStatus)}
                          style={{ minWidth: '140px' }}
                        >
                          {statusInfo.buttonText}
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => onCancel(o.id)}
                          title="Cancel order"
                          aria-label="Cancel order"
                          style={{ width: 36, height: 36, minWidth: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
                        >
                          <X size={16} />
                        </button>
                      </>
                    )
                  }
                  const gridSpan = Math.max(1, Math.min(3, effectiveItemsForOrder.length || 1))
                  if (effectiveItemsForOrder.length > 1) {
                    return (
                      <div
                        key={o.id}
                        className="order-card"
                        style={{ gridColumn: `span ${gridSpan}` }}
                      >
                        <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#111827', fontSize: '1.2em', marginBottom: 8 }}>
                          {(o.token_no || o.order_token) ? ('#' + (o.token_no || o.order_token)) : 'Not available'}
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          {isWebsiteCounter(o.user_id) ? (
                            <span style={{ backgroundColor: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '500' }}>🧑‍💻 Counter</span>
                          ) : (
                            <span style={{ backgroundColor: '#6b7280', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '500' }}>📱 App</span>
                          )}
                        </div>
                        <div className="pm-items">
                          {effectiveItemsForOrder.map((item, idx) => {
                            const itemImage = item.food_items?.image_url || getImageForOrder({ item_name: item.food_items?.name })
                            return (
                              <div key={idx} className="pm-item" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <img
                                  src={itemImage}
                                  alt={item.food_items?.name || 'Item'}
                                  style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                                  onError={(e) => {
                                    const target = e.currentTarget
                                    if (target.src !== 'https://via.placeholder.com/300?text=Food') {
                                      target.src = 'https://via.placeholder.com/300?text=Food'
                                    }
                                  }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="pm-item-name" style={{ fontSize: '13px', lineHeight: '1.3' }}>
                                    {(item.food_items?.name || 'Unknown Item')} ×{item.quantity || 1}
                                  </div>
                                  <div className="pm-item-meta">₹{item.food_items?.price || item.price || 0}</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {statusBadges}
                        <div className="actions" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, width: '100%' }}>
                          {renderActionButtons()}
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={o.id} className="order-card">
                      <div className="avatar" style={{ width: '100px', height: '100px' }}>
                        <img
                          src={getImageForOrder(o)}
                          alt={o.item_name || 'Order Item'}
                          loading="lazy"
                          style={{ objectFit: 'cover', width: '100%', height: '100%', transition: 'opacity 0.2s ease-in-out', backgroundColor: '#f3f4f6' }}
                          onLoad={(e) => { e.currentTarget.style.opacity = '1' }}
                          onError={(e) => {
                            const target = e.currentTarget
                            if (target.src !== 'https://via.placeholder.com/300?text=Food') {
                              target.style.opacity = '0.5'
                              setTimeout(() => {
                                target.src = 'https://via.placeholder.com/300?text=Food'
                                target.style.opacity = '1'
                              }, 100)
                            }
                          }}
                        />
                      </div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#111827', fontSize: '0.95em', marginBottom: 4 }}>
                        {(o.token_no || o.order_token) ? ('#' + (o.token_no || o.order_token)) : 'Not available'}
                      </div>
                      <div className="pm-item-name">{o.item_name}</div>
                      <div style={{ margin: '8px 0' }}>
                        {isWebsiteCounter(o.user_id) ? (
                          <span style={{ backgroundColor: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '500' }}>🧑‍💻 Counter</span>
                        ) : (
                          <span style={{ backgroundColor: '#6b7280', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '500' }}>📱 App</span>
                        )}
                      </div>
                      {statusBadges}
                      <div className="actions" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
                        {renderActionButtons()}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
        ) : (
          <OrdersTable
            withTitle={false}
            idHeader="Token No"
            orders={displayedOrders}
            orderItems={orderItems}
            onUpdateStatus={onUpdateStatus}
            onCancel={onCancel}
            updatingIds={updatingIds}
            selectMode={showBulkCancel}
            selectedOrderIds={selectedOrderIds}
            onToggleSelect={toggleSelectOrder}
            onToggleSelectAll={toggleSelectAllVisible}
          />
        )
      ) : (
        <Card title={undefined}>
          <table className="table past-table">
            <thead>
              <tr>
                <th style={{ width: '12%', textAlign: 'center' }}>Token No</th>
                <th style={{ width: '20%' }}>Item Name</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Price</th>
                <th style={{ width: '10%', textAlign: 'center' }}>ETA</th>
                <th style={{ width: '24%', textAlign: 'center' }}>Delivered At</th>
                <th style={{ width: '12%', textAlign: 'center' }}>Placed By</th>
                <th style={{ width: '12%', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeliveredOrders.map((o) => {
                const orderDate = o.created_at ? new Date(o.created_at) : null
                const orderDeliveredDate = o.delivered_at ? new Date(o.delivered_at) : orderDate
                const itemsForOrder = getOrderItemsForOrder(o.id)
                const hasCartItems = itemsForOrder.length > 0
                
                return (
                  <tr key={o.id}>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#666' }}>
                        {(o.token_no || o.order_token) ? ('#' + (o.token_no || o.order_token)) : 'N/A'}
                      </span>
                    </td>
                    <td style={{ position: 'relative', verticalAlign: 'middle' }}>
                      {hasCartItems ? (
                        <div className="order-items-cell" style={{ minWidth: '200px', maxWidth: '300px' }}>
                                {itemsForOrder.map((item, index) => {
                                  return (
                              <div key={index} style={{ 
                                marginBottom: index < itemsForOrder.length - 1 ? '4px' : '0',
                                fontSize: '14px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                      <strong>{item.food_items?.name || 'Unknown Item'}</strong>
                                    </div>
                                  )
                                })}
                        </div>
                      ) : (
                        <strong>{o.item_name || 'Unknown Item'}</strong>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                      {o.total_amount != null ? `₹${o.total_amount}` : '-'}
                    </td>
                    {/* ETA (duration from created_at to delivered_at/updated_at) */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: '13px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {(() => {
                        const start = orderDate ? orderDate.getTime() : null
                        const end = o.delivered_at ? new Date(o.delivered_at).getTime() : (o.updated_at ? new Date(o.updated_at).getTime() : null)
                        if (!start || !end || !isFinite(start) || !isFinite(end) || end < start) return '-'
                        const secs = Math.floor((end - start) / 1000)
                        const h = Math.floor(secs / 3600)
                        const m = Math.floor((secs % 3600) / 60)
                        const s = secs % 60
                        return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`
                      })()}
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {orderDeliveredDate ? orderDeliveredDate.toLocaleString() : '-'}
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {isWebsiteCounter(o.user_id) ? (
                        <span style={{ 
                          backgroundColor: '#3b82f6', 
                          color: 'white', 
                          padding: '4px 8px', 
                          borderRadius: '4px', 
                          fontSize: '12px',
                          fontWeight: '500',
                          whiteSpace: 'nowrap'
                        }}>
                          Counter
                        </span>
                      ) : (
                        <span style={{ 
                          backgroundColor: '#6b7280', 
                          color: 'white', 
                          padding: '4px 8px', 
                          borderRadius: '4px', 
                          fontSize: '12px',
                          fontWeight: '500',
                          whiteSpace: 'nowrap'
                        }}>
                          App
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <span className="badge ready">DELIVERED</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
      {/* Bulk Cancel Modal - Portal Version */}
      <AnimatePresence mode="wait">
        {showBulkCancel && (
          <>
            {createPortal(
              <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ 
          position: 'fixed', 
              top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 999999,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: '20px',
              pointerEvents: 'none',
              backgroundColor: 'rgba(0,0,0,0.4)'
            }}
          >
          {/* Modal */}
            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              width: '400px',
              height: 'fit-content',
              maxHeight: '80vh',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              zIndex: 1000000,
              marginTop: '20px',
              pointerEvents: 'auto'
            }}
            className="dark:!bg-gray-800"
          >
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <button
                  onClick={() => setShowBulkCancel(false)}
                  disabled={bulkCancelLoading}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '12px',
                    backgroundColor: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '16px',
                    border: 'none',
                    cursor: bulkCancelLoading ? 'not-allowed' : 'pointer',
                    opacity: bulkCancelLoading ? 0.5 : 1,
                    transition: 'all 0.2s'
                  }}
                  title="Close"
                  onMouseEnter={(e) => {
                    if (!bulkCancelLoading) {
                      e.target.style.backgroundColor = '#fecaca'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!bulkCancelLoading) {
                      e.target.style.backgroundColor = '#fee2e2'
                    }
                  }}
                >
                  <X size={38} style={{ color: '#dc2626' }} />
                </button>
                <div style={{ flex: 1 }}>
                  <h3 
                    className="dark:!text-white"
                    style={{ 
                      margin: 0, 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: '#111827' 
                    }}
                  >
                    Bulk Order Actions
                  </h3>
                </div>
              </div>



              {/* Description */}
              <p 
                className="dark:!text-gray-300"
                style={{ 
                  margin: '0 0 16px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  lineHeight: '1.5'
                }}
              >
                Select orders directly in the table using the checkboxes, then choose an action.
              </p>
              {/* Selection Summary */}
              <div style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#f3f4f6' }} className="dark:!bg-gray-700">
                <span className="dark:!text-gray-200" style={{ fontSize: '14px' }}>Selected orders: <strong>{Array.from(selectedOrderIds).length}</strong></span>
              </div>

              {/* Message */}
              {bulkCancelMessage.text && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    backgroundColor: 
                      bulkCancelMessage.type === 'success' ? '#d1fae5' :
                      bulkCancelMessage.type === 'error' ? '#fee2e2' :
                      '#fff3cd',
                    color: 
                      bulkCancelMessage.type === 'success' ? '#065f46' :
                      bulkCancelMessage.type === 'error' ? '#991b1b' :
                      '#92400e',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  {bulkCancelMessage.text}
                </motion.div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Close Button */}
                <button
                  onClick={() => setShowBulkCancel(false)}
                  disabled={bulkCancelLoading}
                  style={{
                    width: '100%',
                    padding: '20px 24px',
                    fontSize: '18px',
                    fontWeight: '700',
                    lineHeight: '1',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: bulkCancelLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    height: '64px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  className="dark:!bg-gray-700 dark:!text-gray-200 bulk-close-btn"
                  onMouseEnter={(e) => {
                    if (!bulkCancelLoading) {
                      e.target.style.backgroundColor = '#e5e7eb'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!bulkCancelLoading) {
                      e.target.style.backgroundColor = '#f3f4f6'
                    }
                  }}
                >
                  Close
                </button>

                {/* Action Buttons Row */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  {/* Mark Delivered Button */}
                <button
                    onClick={() => {
                      setBulkActionMode('deliver')
                      handleBulkAction('deliver')
                    }}
                  disabled={bulkCancelLoading || Array.from(selectedOrderIds).length === 0}
                  style={{
                      flex: 1,
                      padding: '12px 20px',
                    fontSize: '14px',
                      fontWeight: '600',
                      backgroundColor: bulkCancelLoading || Array.from(selectedOrderIds).length === 0 ? '#9ca3af' : '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: bulkCancelLoading || Array.from(selectedOrderIds).length === 0 ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => {
                      if (!bulkCancelLoading && Array.from(selectedOrderIds).length > 0) {
                        e.target.style.backgroundColor = '#059669'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!bulkCancelLoading && Array.from(selectedOrderIds).length > 0) {
                        e.target.style.backgroundColor = '#10b981'
                      }
                    }}
                  >
                    {bulkCancelLoading && bulkActionMode === 'deliver' ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Marking...
                      </>
                    ) : (
                      <>
                        <CircleCheckBig size={18} />
                        Mark Delivered
                      </>
                    )}
                  </button>

                  {/* Cancel Orders Button */}
                  <button
                    onClick={() => {
                      setBulkActionMode('cancel')
                      handleBulkAction('cancel')
                    }}
                    disabled={bulkCancelLoading || Array.from(selectedOrderIds).length === 0}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      fontSize: '14px',
                      fontWeight: '600',
                    backgroundColor: bulkCancelLoading || Array.from(selectedOrderIds).length === 0 ? '#9ca3af' : '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: bulkCancelLoading || Array.from(selectedOrderIds).length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                      justifyContent: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    if (!bulkCancelLoading && Array.from(selectedOrderIds).length > 0) {
                      e.target.style.backgroundColor = '#dc2626'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!bulkCancelLoading && Array.from(selectedOrderIds).length > 0) {
                      e.target.style.backgroundColor = '#ef4444'
                    }
                  }}
                >
                    {bulkCancelLoading && bulkActionMode === 'cancel' ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                        <X size={18} />
                      Cancel Orders
                    </>
                  )}
                </button>
              </div>
          </div>
            </motion.div>
          </motion.div>,
        document.body
      )}
          </>
        )}
      </AnimatePresence>

      {/* Bulk Cancel Confirmation Modal */}
      {showBulkCancelConfirm && createPortal(
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              backgroundColor: 'rgba(0, 0, 0, 0.6)', 
              zIndex: 9999999,
              backdropFilter: 'blur(4px)'
            }}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ 
                type: 'spring',
                stiffness: 300,
                damping: 25
              }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                zIndex: 99999999,
                maxWidth: '450px',
                width: '90%',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
              }} 
              className="dark:!bg-gray-800"
            >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertCircle size={24} style={{ color: '#dc2626' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '600', color: '#111827' }} className="dark:text-white">
                  Cancel Orders?
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', lineHeight: '1.5' }} className="dark:text-gray-300">
                  Are you sure you want to cancel these orders?
                </p>
              </div>
            </div>

            {/* Order List */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ 
                maxHeight: '200px', 
                overflowY: 'auto',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                padding: '8px 12px'
              }}>
                {bulkCancelOrders.map((order, index) => (
                  <div key={order.id} style={{ 
                    display: 'inline-block',
                    margin: '4px 4px 4px 0',
                    padding: '6px 12px',
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#111827',
                    border: '1px solid #e5e7eb'
                  }}>
                    {order.item_name}
                  </div>
                ))}
              </div>
            </div>

            {/* Warning Message */}
            <div style={{
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}>
              <AlertCircle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
              <p style={{ margin: 0, fontSize: '14px', color: '#92400e', lineHeight: '1.5' }}>
                This will mark the orders as cancelled and the customer will need to place a new order.
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBulkCancelConfirm(false)}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#e5e7eb'
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#f3f4f6'
                }}
              >
                Keep Orders
              </button>
              <button
                onClick={handleBulkCancelConfirm}
                disabled={bulkCancelLoading}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: bulkCancelLoading ? '#d1d5db' : '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: bulkCancelLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  if (!bulkCancelLoading) {
                    e.target.style.backgroundColor = '#dc2626'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!bulkCancelLoading) {
                    e.target.style.backgroundColor = '#ef4444'
                  }
                }}
              >
                {bulkCancelLoading ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <X size={16} />
                    <span>Cancel Orders</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      , document.body)}
    </div>
  )
}
function InventoryPage() {
  // Only the features requested: add, remove, mark out of stock / in stock
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ id: '', name: '', removeItemName: '' })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | in | out
  const [isAddItemActive, setIsAddItemActive] = useState(false)
  const [showAddItemPanel, setShowAddItemPanel] = useState(false)
  const [addItemForm, setAddItemForm] = useState({
    name: '',
    cost: '',
    description: '',
    category_id: '',
    image: null,
    serialNumber: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [idField, setIdField] = useState('id')
  const [availabilityField, setAvailabilityField] = useState('available_quantity')
  const [editingPrice, setEditingPrice] = useState(null)
  const [editingQuantity, setEditingQuantity] = useState(null)
  const [showToast, setShowToast] = useState({ show: false, message: '', type: 'success' })
  const [stockFilter, setStockFilter] = useState('all') // all | in-stock | low-stock | very-low | out-of-stock
  const [showRemovedItemsPanel, setShowRemovedItemsPanel] = useState(false)
  const [itemNotFoundError, setItemNotFoundError] = useState(null) // { itemName: string }
  const [editingItem, setEditingItem] = useState(null)
  const [showEditItemPanel, setShowEditItemPanel] = useState(false)
  const [editItemForm, setEditItemForm] = useState({
    name: '',
    cost: '',
    description: '',
    category_id: '',
    image: null,
    serialNumber: ''
  })
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  
  // Unified input bar state
  const [unifiedInput, setUnifiedInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [confirmAction, setConfirmAction] = useState(null) // { item, action: 'edit' | 'remove' }
  const [confirmRemove, setConfirmRemove] = useState(null) // { itemId, itemName }
  const [markInDialog, setMarkInDialog] = useState(null) // { itemId, itemName, qty }

  // Fetch categories from database
  const fetchCategories = async () => {
    try {
      setLoadingCategories(true)
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name')
      
      if (error) {
        console.error('Error fetching categories:', error)
        return
      }
      
      setCategories(data || [])
      console.log('✅ Loaded categories:', data)
    } catch (error) {
      console.error('Error fetching categories:', error)
    } finally {
      setLoadingCategories(false)
    }
  }

  // Fetch items function - moved to component level so it can be called from multiple places
  const fetchItems = async () => {
    try {
      const pageSize = 1000
      let from = 0
      let all = []
      while (true) {
        const to = from + pageSize - 1
        const { data, error } = await supabase
          .from('food_items')
          .select('*')
          .range(from, to)
        if (error) throw error
        const batch = data || []
        all = all.concat(batch)
        if (batch.length < pageSize) break
        from += pageSize
      }
      
      // Filter out inactive items (is_active = false)
      all = all.filter(item => item.is_active !== false)
      
      // Detect backend id and availability field from sample row
      const sample = all[0] || {}
      const idCandidates = ['id', 'item_id', 'slug', 'code']
      const availCandidates = ['available_quantity', 'in_stock', 'available', 'is_available', 'stock', 'status']
      const detectedIdField = idCandidates.find(k => Object.prototype.hasOwnProperty.call(sample, k)) || 'id'
      const detectedAvailField = availCandidates.find(k => Object.prototype.hasOwnProperty.call(sample, k)) || 'in_stock'
      
      setIdField(detectedIdField)
      setAvailabilityField(detectedAvailField)
      
      // Map backend rows to local shape with quantity information
      const mapped = all.map((r) => {
        const id = r[detectedIdField] ?? String(Math.random()).slice(2)
        const name = r.name ?? r.item_name ?? r.title ?? r.label ?? 'Item'
        const price = r.price ?? r.cost ?? 0
        const availableQuantity = r.available_quantity ?? r.quantity ?? r.stock ?? 0
        const categoryIdRaw = r.category_id ?? r.categoryId ?? r.category ?? null
        const categoryId = categoryIdRaw != null ? String(categoryIdRaw) : null
        const categoryName = r.category_name ?? r.categoryName ?? null
        const inStock = (
          (typeof availableQuantity === 'number' ? availableQuantity > 0 : undefined) ??
          r.in_stock ?? r.available ?? r.is_available ?? (typeof r.stock === 'number' ? r.stock > 0 : undefined) ??
          (typeof r.status === 'string' ? String(r.status).toLowerCase() === 'in' : undefined) ?? true
        )
        return { 
          id, 
          name, 
          price,
          availableQuantity,
          inStock: !!inStock,
          categoryId,
          category_id: categoryId, // maintain compatibility with downstream code
          categoryName: categoryName ?? null,
          image_url: r.image_url,
          description: r.description,
          originalData: r
        }
      })
      
      setItems(mapped)
      } catch (error) {
        console.error('Error fetching items:', error)
      }
    }

  // Handle when an item is restored from removed items panel
  const handleItemRestored = () => {
    // Refresh the main inventory items list
    fetchItems()
  }

  // Check if an item exists in the current items list
  const findExistingItem = (itemName) => {
    if (!itemName) return null
    const found = items.find(item => 
      item.name.toLowerCase().trim() === itemName.toLowerCase().trim()
    )
    console.log('Searching for:', itemName, 'Found:', found, 'Items:', items.map(i => i.name))
    return found
  }

  // Get search suggestions based on unified input
  const categoryLookup = useMemo(() => {
    const map = new Map()
    for (const category of categories || []) {
      const key = category?.id != null ? String(category.id) : null
      if (key) {
        map.set(key, category.name || 'Uncategorized')
      }
    }
    return map
  }, [categories])

  const categoryCounts = useMemo(() => {
    return items.reduce((acc, item) => {
      const key = item?.categoryId != null ? String(item.categoryId) : 'uncategorized'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, /** @type {Record<string, number>} */ ({}))
  }, [items])

  useEffect(() => {
    if (categoryFilter === 'all' || categoryFilter === 'uncategorized') return
    const stillExists = items.some(item => String(item.categoryId) === categoryFilter)
    if (!stillExists) {
      setCategoryFilter('all')
    }
  }, [items, categoryFilter])

  const getSearchSuggestions = (query) => {
    if (!query.trim()) return []
    const queryLower = query.toLowerCase().trim()
    return items.filter(item => 
      item.name.toLowerCase().includes(queryLower)
    ).slice(0, 5) // Limit to 5 suggestions
  }

  // Handle unified input change
  const handleUnifiedInputChange = (value) => {
    setUnifiedInput(value)
    setItemNotFoundError(null) // Clear error when typing
    
    // Update suggestions
    const newSuggestions = getSearchSuggestions(value)
    setSuggestions(newSuggestions)
    setSelectedSuggestionIndex(-1)
  }

  // Handle unified input submit
  const handleUnifiedInputSubmit = () => {
    if (!unifiedInput.trim()) return
    
    const trimmedName = unifiedInput.trim()
    const existingItem = findExistingItem(trimmedName)
    
    if (existingItem) {
      // Existing item - show custom confirmation dialog
      setConfirmAction({ item: existingItem })
    } else {
      // New item - open add panel
      setAddItemForm({ ...addItemForm, name: trimmedName })
      setShowAddItemPanel(true)
      // Clear input and suggestions
      setUnifiedInput('')
      setSuggestions([])
    }
  }
  
  // Handle action confirmation
  const handleConfirmAction = (action) => {
    if (!confirmAction) return
    
    if (action === 'edit') {
      handleEditItem(confirmAction.item)
      // Clear everything
      setConfirmAction(null)
      setUnifiedInput('')
      setSuggestions([])
    } else if (action === 'remove') {
      // Show remove confirmation dialog
      setConfirmRemove({ itemId: confirmAction.item.id, itemName: confirmAction.item.name })
      setConfirmAction(null)
    }
  }
  
  // Handle remove confirmation
  const handleConfirmRemove = async () => {
    if (!confirmRemove) return
    
    await deleteItem(confirmRemove.itemId)
    setConfirmRemove(null)
    setUnifiedInput('')
    setSuggestions([])
  }

  // Handle suggestion click
  const handleSuggestionClick = (item) => {
    // Fill the input with the selected suggestion
    setUnifiedInput(item.name)
    setSuggestions([])
    setSelectedSuggestionIndex(-1)
  }

  // Handle dynamic button click (legacy - no longer used)
  const handleDynamicButtonClick = () => {
    const trimmedName = form.name.trim()
    if (!trimmedName) return

    const existingItem = findExistingItem(trimmedName)
    console.log('Button clicked for:', trimmedName, 'Existing item:', existingItem)
    
    if (existingItem) {
      // Item exists - remove it
      console.log('Removing item:', existingItem)
      deleteItem(existingItem.id)
      setForm({ id: '', name: '', removeItemName: '' }) // Clear the input
    } else {
      // Item doesn't exist - add it (open side panel)
      console.log('Adding new item:', trimmedName)
      setAddItemForm({ ...addItemForm, name: trimmedName })
      setShowAddItemPanel(true)
      setIsAddItemActive(false)
    }
  }

  // Filter items based on stock category
  const getFilteredItems = () => {
    if (stockFilter === 'all') return items
    
    return items.filter(item => {
      switch (stockFilter) {
        case 'in-stock':
          return item.inStock && item.availableQuantity > 20
        case 'low-stock':
          return item.inStock && item.availableQuantity <= 20 && item.availableQuantity > 5
        case 'very-low':
          return item.inStock && item.availableQuantity <= 5 && item.availableQuantity > 0
        case 'out-of-stock':
          return !item.inStock || item.availableQuantity === 0
        default:
          return true
      }
    })
  }

  // Create bucket if it doesn't exist
  const createBucketIfNeeded = async () => {
    try {
      console.log('🔍 Checking if food_images bucket exists...')
      
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
      
      if (bucketsError) {
        console.error('❌ Error listing buckets:', bucketsError)
        return false
      }
      
      const foodImagesBucket = buckets.find(bucket => bucket.name === 'food_images')
      
      if (!foodImagesBucket) {
        console.log('📦 food_images bucket not found, attempting to create...')
        
        // Try to create the bucket using SQL
        const { error: createError } = await supabase.rpc('create_food_images_bucket')
        
        if (createError) {
          console.log('⚠️ RPC method failed, trying direct SQL...')
          
          // Fallback: Direct SQL approach
          const { error: sqlError } = await supabase
            .from('storage.buckets')
            .insert([{
              id: 'food_images',
              name: 'food_images',
              public: true,
              file_size_limit: 52428800, // 50MB
              allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
            }])
          
          if (sqlError) {
            console.error('❌ Failed to create bucket:', sqlError)
            return false
          }
        }
        
        console.log('✅ food_images bucket created successfully!')
        return true
      } else {
        console.log('✅ food_images bucket already exists')
        return true
      }
      
    } catch (error) {
      console.error('❌ Error creating bucket:', error)
      return false
    }
  }

  // Test storage connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        console.log('🧪 Testing Supabase Storage connection...')
        
        // First try to create bucket if needed
        const bucketExists = await createBucketIfNeeded()
        
        if (!bucketExists) {
          console.warn('⚠️ Could not ensure food_images bucket exists')
          return
        }
        
        // List buckets to verify
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
        
        if (bucketsError) {
          console.error('❌ Error listing buckets:', bucketsError)
          return
        }
        
        console.log('📋 Available buckets:', buckets.map(b => b.name))
        
        const foodImagesBucket = buckets.find(bucket => bucket.name === 'food_images')
        if (foodImagesBucket) {
          console.log('✅ food_images bucket ready for use!')
          
          // Test if we can list files in the bucket
          const { data: files, error: filesError } = await supabase.storage
            .from('food_images')
            .list()
          
          if (filesError) {
            console.warn('⚠️ Could not list files in bucket:', filesError.message)
          } else {
            console.log('📁 Files in food_images bucket:', files.length)
          }
        }
        
      } catch (error) {
        console.error('❌ Storage connection test failed:', error)
      }
    }
    
    testConnection()
  }, [])

  // Fetch all items from Supabase table `food_items` on component mount
  useEffect(() => {
    fetchItems()
    fetchCategories()
  }, [])

  const addItem = () => {
    if (!form.name) return
    const generatedId = 'local-' + Math.random().toString(36).slice(2, 10)
    setItems((prev) => [...prev, { id: generatedId, name: form.name, inStock: true, _local: true }])
    setForm({ id: '', name: '', removeItemName: '' })
  }

  // Fallback function for direct Supabase upload (when API server is not available)
  const handleDirectSupabaseUpload = async () => {
    console.log('🔄 Using direct Supabase upload fallback...')
    
    let imageUrl = null
    let imageUploadSuccess = false

    // Upload image to Supabase Storage if provided
    if (addItemForm.image) {
      try {
        console.log('🚀 Uploading image to Supabase Storage...')
        console.log('📎 Image file details:', {
          name: addItemForm.image.name,
          size: addItemForm.image.size,
          type: addItemForm.image.type
        })
        
        // Generate unique filename
        const timestamp = Date.now()
        const fileExt = addItemForm.image.name.split('.').pop().toLowerCase()
        const sanitizedName = addItemForm.name.replace(/[^a-zA-Z0-9]/g, '_')
        const fileName = `items/${timestamp}-${sanitizedName}.${fileExt}`
        
        console.log('📁 Generated filename:', fileName)
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('images_food')
          .upload(fileName, addItemForm.image, {
            cacheControl: '3600',
            upsert: false,
            contentType: addItemForm.image.type
          })

        if (uploadError) {
          console.error('❌ Upload error:', uploadError)
          console.error('❌ Upload error details:', {
            message: uploadError.message,
            statusCode: uploadError.statusCode,
            error: uploadError.error
          })
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        console.log('✅ Upload successful:', uploadData)

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('images_food')
          .getPublicUrl(fileName)

        imageUrl = urlData.publicUrl
        imageUploadSuccess = true
        console.log('🔗 Public URL generated:', imageUrl)
        
      } catch (uploadError) {
        console.error('❌ Image upload failed:', uploadError)
        console.error('❌ Upload error details:', uploadError)
        // Continue without image - don't throw error
      }
    } else {
      console.log('ℹ️ No image provided for upload')
    }

    // Prepare item data
    const itemData = {
      name: addItemForm.name.trim(),
      price: parseFloat(addItemForm.cost),
      available_quantity: 100,
      is_active: true
    }

    if (addItemForm.description.trim()) {
      itemData.description = addItemForm.description.trim()
    }
    if (addItemForm.category_id.trim()) {
      itemData.category_id = addItemForm.category_id.trim()
    }
    if (imageUrl) {
      itemData.image_url = imageUrl
    }
    if (addItemForm.serialNumber) {
      itemData.serial_number = parseInt(addItemForm.serialNumber)
    }

    // Insert into database
    console.log('📝 Inserting item data:', itemData)
    
    const { data: insertData, error: insertError } = await supabase
      .from('food_items')
      .insert([itemData])
      .select()

    if (insertError) {
      console.error('❌ Database insert error:', insertError)
      console.error('❌ Database error details:', {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code
      })
      throw new Error(`Database error: ${insertError.message}`)
    }

    console.log('✅ Item inserted successfully:', insertData)

    // Show success message
    const successMessage = imageUploadSuccess 
      ? `Item "${addItemForm.name}" added successfully with image!`
      : `Item "${addItemForm.name}" added successfully!`
    
    setShowToast({ 
      show: true, 
      message: successMessage, 
      type: 'success' 
    })
    
    // Reset form and close panel
    setAddItemForm({ name: '', cost: '', description: '', category_id: '', image: null, serialNumber: '' })
    setShowAddItemPanel(false)
    setForm({ id: '', name: '', removeItemName: '' })
    setSubmitError('')
    
    // Refresh items list
    fetchItems()
    
    // Refresh menu items in Place Order panel
    if (globalRefreshMenuItems) {
      globalRefreshMenuItems()
    }
  }

  // START IMAGE UPLOAD
  // Handle add item panel
  const handleAddItemSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError('')

    try {
      // Validate required fields
      if (!addItemForm.name.trim()) {
        throw new Error('Item name is required')
      }
      if (!addItemForm.cost || parseFloat(addItemForm.cost) <= 0) {
        throw new Error('Valid cost is required')
      }

      console.log('🚀 Creating FormData for API request...')

      // Create FormData for API request
      const formData = new FormData()
      formData.append('name', addItemForm.name.trim())
      formData.append('price', addItemForm.cost)
      formData.append('description', addItemForm.description.trim())
      formData.append('category_id', addItemForm.category_id.trim())
      
      if (addItemForm.serialNumber) {
        formData.append('serial_number', addItemForm.serialNumber)
      }
      
      if (addItemForm.image) {
        formData.append('image', addItemForm.image)
        console.log('📎 Added image file to FormData:', addItemForm.image.name)
      }

      console.log('📤 Sending request to /api/items...')

      // Send to API route
      let response, result
      
      try {
        response = await fetch('/api/items', {
          method: 'POST',
          body: formData
        })

        console.log('📡 Response status:', response.status)
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()))

        // Check if response is JSON
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text()
          console.error('❌ Non-JSON response:', text)
          throw new Error(`Server returned non-JSON response (${response.status}): ${text.substring(0, 200)}`)
        }

        try {
          result = await response.json()
        } catch (jsonError) {
          console.error('❌ JSON parsing error:', jsonError)
          const text = await response.text()
          console.error('❌ Raw response:', text)
          throw new Error(`Invalid JSON response: ${jsonError.message}`)
        }

        console.log('📋 Parsed response:', result)

        if (!response.ok) {
          throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`)
        }

        if (!result.success) {
          throw new Error(result.error || 'API request failed')
        }

        console.log('✅ API response:', result)

      } catch (fetchError) {
        console.warn('⚠️ API server not available, using direct Supabase upload:', fetchError.message)
        
        // Fallback to direct Supabase upload
        await handleDirectSupabaseUpload()
        return // Exit early since fallback handles everything
      }

      // Show success message
      setShowToast({ 
        show: true, 
        message: result.message, 
        type: 'success' 
      })
      
      // Reset form and close panel only after success
      setAddItemForm({ name: '', cost: '', description: '', category_id: '', image: null, serialNumber: '' })
      setShowAddItemPanel(false)
      setForm({ id: '', name: '', removeItemName: '' })
      setSubmitError('') // Clear any previous errors
      
      // Refresh items list
      fetchItems()
      
      // Refresh menu items in Place Order panel
      if (globalRefreshMenuItems) {
        globalRefreshMenuItems()
      }
      
    } catch (e) {
      console.error('❌ Failed to add item:', e)
      const errorMessage = e.message || 'Failed to add item'
      setSubmitError(errorMessage)
      
      // Show error alert so user can see it even if panel closes
      alert(`❌ Error: ${errorMessage}`)
      
      // Keep panel open so user can see the error and try again
      // Don't close the panel on error
    } finally {
      setIsSubmitting(false)
    }
  }
  // END IMAGE UPLOAD

  const closeAddItemPanel = () => {
    setShowAddItemPanel(false)
    setAddItemForm({ name: '', cost: '', description: '', category_id: '', image: null, serialNumber: '' })
    setSubmitError('')
    setIsSubmitting(false)
  }
  // Edit item functions
  const handleEditItem = (item) => {
    setEditingItem(item)
    setEditItemForm({
      name: item.name || '',
      cost: item.price || '',
      description: item.description || '',
      category_id: item.category_id || item.categoryId || '',
      image: null, // Don't pre-load the image, let user choose to upload new one
      serialNumber: item.serial_number || item.serialNumber || ''
    })
    setShowEditItemPanel(true)
  }

  const closeEditItemPanel = () => {
    setShowEditItemPanel(false)
    setEditingItem(null)
    setEditItemForm({ name: '', cost: '', description: '', category_id: '', image: null, serialNumber: '' })
    setSubmitError('')
    setIsSubmitting(false)
  }

  // Handle edit item submission
  const handleEditItemSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError('')

    try {
      // Validate required fields
      if (!editItemForm.name.trim()) {
        throw new Error('Item name is required')
      }
      if (!editItemForm.cost || parseFloat(editItemForm.cost) <= 0) {
        throw new Error('Valid cost is required')
      }

      console.log('🚀 Updating item:', editingItem.name)

      // Create FormData for API request
      const formData = new FormData()
      formData.append('name', editItemForm.name.trim())
      formData.append('price', editItemForm.cost)
      formData.append('description', editItemForm.description.trim())
      formData.append('category_id', editItemForm.category_id.trim())
      formData.append('id', editingItem.id) // Add item ID for update
      
      if (editItemForm.serialNumber) {
        formData.append('serial_number', editItemForm.serialNumber)
      }
      
      if (editItemForm.image) {
        formData.append('image', editItemForm.image)
        console.log('📎 Added new image file to FormData:', editItemForm.image.name)
      }

      console.log('📤 Sending update request to /api/items...')

      // Send to API route
      let response, result
      
      try {
        response = await fetch('/api/items', {
          method: 'PUT', // Use PUT for updates
          body: formData
        })

        console.log('📡 Response status:', response.status)

        // Check if response is JSON
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text()
          console.error('❌ Non-JSON response:', text)
          throw new Error(`Server returned non-JSON response (${response.status}): ${text.substring(0, 200)}`)
        }

        try {
          result = await response.json()
        } catch (jsonError) {
          console.error('❌ JSON parsing error:', jsonError)
          const text = await response.text()
          console.error('❌ Raw response:', text)
          throw new Error(`Invalid JSON response: ${jsonError.message}`)
        }

        console.log('📋 Parsed response:', result)

        if (!result.success) {
          throw new Error(result.error || 'Update failed')
        }

        console.log('✅ Item updated successfully via API:', result.data)

        // Show success message
        const successMessage = editItemForm.image 
          ? `Item "${editItemForm.name}" updated successfully with new image!`
          : `Item "${editItemForm.name}" updated successfully!`
        
        setShowToast({ 
          show: true, 
          message: successMessage, 
          type: 'success' 
        })

      } catch (apiError) {
        console.warn('⚠️ API update failed, trying direct Supabase update:', apiError)
        
        // Fallback to direct Supabase update
        await handleDirectSupabaseUpdate()
      }

      // Close panel and refresh items
      closeEditItemPanel()
      fetchItems()
      
      // Refresh menu items in Place Order panel
      if (globalRefreshMenuItems) {
        globalRefreshMenuItems()
      }

    } catch (error) {
      console.error('❌ Edit item failed:', error)
      setSubmitError(error.message)
      setShowToast({ 
        show: true, 
        message: `Update failed: ${error.message}`, 
        type: 'error' 
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Fallback function for direct Supabase update (when API server is not available)
  const handleDirectSupabaseUpdate = async () => {
    console.log('🔄 Using direct Supabase update fallback...')
    
    let imageUrl = editingItem.image_url // Keep existing image URL by default
    let imageUploadSuccess = false

    // Upload new image to Supabase Storage if provided
    if (editItemForm.image) {
      try {
        console.log('🚀 Uploading new image to Supabase Storage...')
        console.log('📎 Image file details:', {
          name: editItemForm.image.name,
          size: editItemForm.image.size,
          type: editItemForm.image.type
        })
        
        // Generate unique filename
        const timestamp = Date.now()
        const fileExt = editItemForm.image.name.split('.').pop().toLowerCase()
        const sanitizedName = editItemForm.name.replace(/[^a-zA-Z0-9]/g, '_')
        const fileName = `items/${timestamp}-${sanitizedName}.${fileExt}`
        
        console.log('📁 Generated filename:', fileName)
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('images_food')
          .upload(fileName, editItemForm.image, {
            cacheControl: '3600',
            upsert: false,
            contentType: editItemForm.image.type
          })

        if (uploadError) {
          console.error('❌ Upload error:', uploadError)
          console.error('❌ Upload error details:', {
            message: uploadError.message,
            statusCode: uploadError.statusCode,
            error: uploadError.error
          })
          throw new Error(`Image upload failed: ${uploadError.message}`)
        }

        console.log('✅ Image uploaded successfully:', uploadData)

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('images_food')
          .getPublicUrl(fileName)
        
        imageUrl = publicUrlData.publicUrl
        imageUploadSuccess = true
        console.log('✅ Public URL generated:', imageUrl)

      } catch (uploadError) {
        console.error('❌ Image upload failed:', uploadError)
        throw new Error(`Image upload failed: ${uploadError.message}`)
      }
    }

    // Update item in database
    const itemData = {
      name: editItemForm.name.trim(),
      price: parseFloat(editItemForm.cost),
      description: editItemForm.description?.trim() || null,
      image_url: imageUrl,
      updated_at: new Date().toISOString()
    }
    
    // Add serial number if provided
    if (editItemForm.serialNumber) {
      itemData.serial_number = parseInt(editItemForm.serialNumber)
    }

    console.log('📝 Updating item data in food_items:', itemData)
    
    const { data: updateData, error: updateError } = await supabase
      .from('food_items')
      .update(itemData)
      .eq('id', editingItem.id)
      .select()

    if (updateError) {
      console.error('❌ Database update error:', updateError)
      console.error('❌ Database error details:', {
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code
      })
      throw new Error(`Database error: ${updateError.message}`)
    }

    console.log('✅ Item updated successfully:', updateData)

    // Show success message
    const successMessage = imageUploadSuccess 
      ? `Item "${editItemForm.name}" updated successfully with new image!`
      : `Item "${editItemForm.name}" updated successfully!`
    
    setShowToast({ 
      show: true, 
      message: successMessage, 
      type: 'success' 
    })
  }

  // Handle escape key and outside click
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && showAddItemPanel) {
        closeAddItemPanel()
      }
      if (e.key === 'Escape' && showEditItemPanel) {
        closeEditItemPanel()
      }
    }

    if (showAddItemPanel || showEditItemPanel) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [showAddItemPanel, showEditItemPanel])

  const toggleStock = async (id, inStock) => {
    // Optimistic update
    const prev = items
    const target = items.find((it) => it.id === id)
    
    let newQuantity = target?.availableQuantity || 0
    // If marking In, we expect the dialog to supply quantity separately
    
    setItems((p) => p.map((it) => (it.id === id ? { ...it, inStock, availableQuantity: newQuantity } : it)))
    
    try {
      if (target && target._local) {
        // Local-only item: skip backend update
        return
      }
      
      // Build update payload based on detected availability field
      let update = {}
      if (availabilityField === 'stock') {
        update[availabilityField] = newQuantity
      } else if (availabilityField === 'status') {
        update[availabilityField] = inStock ? 'in' : 'out'
      } else if (availabilityField === 'available_quantity') {
        update[availabilityField] = newQuantity
      } else {
        update[availabilityField] = !!inStock
      }
      
      console.log('📦 Updating stock status:', { id, inStock, newQuantity, update, field: availabilityField })
      
      const { data, error } = await supabase
        .from('food_items')
        .update(update)
        .eq(idField, id)
        .select()
      
      if (error) throw error
      
      console.log('✅ Stock status updated successfully:', data)
      
      // Show success message
      setShowToast({ 
        show: true, 
        message: `Item marked as ${inStock ? `In Stock (Qty: ${newQuantity})` : 'Out of Stock'}`, 
        type: 'success' 
      })
      setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
      
      // Refresh menu items in Place Order panel
      if (globalRefreshMenuItems) {
        globalRefreshMenuItems()
      }
      
    } catch (e) {
      console.error('❌ Failed to update stock in Supabase:', e)
      // Rollback on error
      setItems(prev)
      setShowToast({ 
        show: true, 
        message: `Failed to update stock: ${e.message}`, 
        type: 'error' 
      })
      setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
    }
  }
  const updateQuantity = async (id, newQuantity) => {
    // Validate input - only positive numbers and zero allowed
    if (newQuantity < 0 || isNaN(newQuantity)) {
      setShowToast({ show: true, message: 'Quantity must be a positive number or zero', type: 'error' })
      setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
      return
    }

    // Optimistic update
    const prev = items
    setItems((p) => p.map((it) => (it.id === id ? { ...it, availableQuantity: newQuantity, inStock: newQuantity > 0 } : it)))
    
    try {
      const target = items.find((it) => it.id === id)
      if (target && target._local) {
        // Local-only item: skip backend update
        setShowToast({ show: true, message: 'Quantity updated successfully', type: 'success' })
        setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
        return
      }
      
      // Update both quantity and availability status
      const updateData = {
        available_quantity: newQuantity,
        is_available: newQuantity > 0 // Set to false if quantity is 0, true otherwise
      }
      
      const { error } = await supabase
        .from('food_items')
        .update(updateData)
        .eq(idField, id)
      
      if (error) throw error
      
      const message = newQuantity === 0 
        ? 'Quantity updated to 0 (marked unavailable)' 
        : 'Quantity updated successfully'
      setShowToast({ show: true, message, type: 'success' })
      setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
      
      // Refresh menu items to reflect availability change
      if (globalRefreshMenuItems) globalRefreshMenuItems()
    } catch (e) {
      console.error('Failed to update quantity in Supabase:', e)
      // Rollback on error
      setItems(prev)
      setShowToast({ show: true, message: 'Error updating quantity', type: 'error' })
      setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
    }
  }

  const updatePrice = async (id, newPrice) => {
    // Validate input - only positive numbers and zero allowed
    if (newPrice < 0 || isNaN(newPrice)) {
      setShowToast({ show: true, message: 'Price must be a positive number or zero', type: 'error' })
      setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
      return
    }

    // Optimistic update
    const prev = items
    setItems((p) => p.map((it) => (it.id === id ? { ...it, price: newPrice } : it)))
    
    try {
      const target = items.find((it) => it.id === id)
      if (target && target._local) {
        // Local-only item: skip backend update
        setShowToast({ show: true, message: 'Price updated successfully', type: 'success' })
        setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
        return
      }
      
      const { error } = await supabase
        .from('food_items')
        .update({ price: newPrice })
        .eq(idField, id)
      
      if (error) throw error
      
      setShowToast({ show: true, message: 'Price updated successfully', type: 'success' })
      setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
    } catch (e) {
      console.error('Failed to update price in Supabase:', e)
      // Rollback on error
      setItems(prev)
      setShowToast({ show: true, message: 'Error updating price', type: 'error' })
      setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
    }
  }

  const deleteItem = async (id) => {
    // Soft delete - mark as inactive instead of deleting
    const prev = items
    setItems((prev) => prev.filter((it) => it.id !== id))
    
    try {
      const target = items.find((it) => it.id === id)
      if (target && target._local) {
        // Local-only item: already removed from UI, nothing to do
        return
      }
      
      console.log('🗑️ Attempting to soft delete item:', { id, idField, target })
      
      // Soft delete: Set is_active = false instead of deleting
      const { data, error } = await supabase
        .from('food_items')
        .update({ 
          is_active: false
        })
        .eq(idField, id)
        .select()
      
      if (error) {
        console.error('❌ Error from Supabase:', error)
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        setItems(prev)
        alert(`Failed to remove item.\n\nError: ${error.message}\n\nDetails: ${error.details || 'Check console for more info'}`)
        return
      }
      
      console.log('✅ Item soft deleted successfully:', data)
      
      // Show success message
      setShowToast({ show: true, message: `Item moved to Removed Items`, type: 'success' })
      setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
      
      // Refresh menu items in Place Order panel
      if (globalRefreshMenuItems) {
        globalRefreshMenuItems()
      }
      
    } catch (e) {
      console.error('❌ Exception during soft delete:', e)
      // Rollback on error - restore the item
      setItems(prev)
      alert(`Failed to remove item.\n\nError: ${e.message || 'Unknown error'}`)
    }
  }

  // Derived list based on current search, filter, and stock filter
  const displayedItems = getFilteredItems().filter((i) => {
    const q = search.trim().toLowerCase()
    const matchesSearch = q ? String(i.name || '').toLowerCase().includes(q) : true
    const matchesFilter = filter==='all' || (filter==='in' ? i.inStock : !i.inStock)
    const matchesCategory = categoryFilter === 'all'
      ? true
      : categoryFilter === 'uncategorized'
        ? !i.categoryId
        : String(i.categoryId) === categoryFilter
    return matchesSearch && matchesFilter && matchesCategory
  }).sort((a, b) => {
    const q = search.trim().toLowerCase()
    const nameA = String(a.name || '').toLowerCase()
    const nameB = String(b.name || '').toLowerCase()
    const categoryNameA = categoryLookup.get(a?.categoryId != null ? String(a.categoryId) : '') || a.categoryName || 'Uncategorized'
    const categoryNameB = categoryLookup.get(b?.categoryId != null ? String(b.categoryId) : '') || b.categoryName || 'Uncategorized'

    if (categoryNameA !== categoryNameB) {
      return categoryNameA.localeCompare(categoryNameB)
    }
    
    // Primary sort: by stock quantity (ascending - low stock first)
    const stockA = a.availableQuantity || 0
    const stockB = b.availableQuantity || 0
    if (stockA !== stockB) {
      return stockA - stockB
    }
    
    // Secondary sort: If search query exists, prioritize items starting with the search text
    if (q) {
      const aStartsWith = nameA.startsWith(q)
      const bStartsWith = nameB.startsWith(q)
      
      // If one starts with query and other doesn't, prioritize the one that starts
      if (aStartsWith && !bStartsWith) return -1
      if (!aStartsWith && bStartsWith) return 1
      
      // If both start or both don't start, sort alphabetically
      if (aStartsWith === bStartsWith) {
        return nameA.localeCompare(nameB)
      }
    }
    
    // Tertiary sort: alphabetically by name
    return nameA.localeCompare(nameB)
  })
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div 
          style={{
            backgroundColor: stockFilter === 'all' ? '#e2e8f0' : '#f8fafc',
            border: stockFilter === 'all' ? '2px solid #64748b' : '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: stockFilter === 'all' ? 'scale(1.02)' : 'scale(1)',
            boxShadow: stockFilter === 'all' ? '0 4px 12px rgba(100, 116, 139, 0.3)' : 'none'
          }}
          onClick={() => setStockFilter('all')}
        >
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>{items.length}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Total</div>
        </div>
        <div 
          style={{
            backgroundColor: stockFilter === 'in-stock' ? '#bbf7d0' : '#f0fdf4',
            border: stockFilter === 'in-stock' ? '2px solid #16a34a' : '1px solid #bbf7d0',
          borderRadius: '8px',
          padding: '12px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: stockFilter === 'in-stock' ? 'scale(1.02)' : 'scale(1)',
            boxShadow: stockFilter === 'in-stock' ? '0 4px 12px rgba(22, 163, 74, 0.3)' : 'none'
          }}
          onClick={() => setStockFilter(stockFilter === 'in-stock' ? 'all' : 'in-stock')}
        >
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#166534' }}>{items.filter(i => i.inStock && i.availableQuantity > 20).length}</div>
          <div style={{ fontSize: '12px', color: '#16a34a' }}>In Stock</div>
        </div>
        <div 
          style={{
            backgroundColor: stockFilter === 'low-stock' ? '#fef3c7' : '#fefce8',
            border: stockFilter === 'low-stock' ? '2px solid #ca8a04' : '1px solid #fde047',
          borderRadius: '8px',
          padding: '12px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: stockFilter === 'low-stock' ? 'scale(1.02)' : 'scale(1)',
            boxShadow: stockFilter === 'low-stock' ? '0 4px 12px rgba(202, 138, 4, 0.3)' : 'none'
          }}
          onClick={() => setStockFilter(stockFilter === 'low-stock' ? 'all' : 'low-stock')}
        >
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#a16207' }}>{items.filter(i => i.inStock && i.availableQuantity <= 20 && i.availableQuantity > 5).length}</div>
          <div style={{ fontSize: '12px', color: '#ca8a04' }}>Low Stock</div>
        </div>
        <div 
          style={{
            backgroundColor: stockFilter === 'very-low' ? '#fecaca' : '#fef2f2',
            border: stockFilter === 'very-low' ? '2px solid #dc2626' : '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '12px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: stockFilter === 'very-low' ? 'scale(1.02)' : 'scale(1)',
            boxShadow: stockFilter === 'very-low' ? '0 4px 12px rgba(220, 38, 38, 0.3)' : 'none'
          }}
          onClick={() => setStockFilter(stockFilter === 'very-low' ? 'all' : 'very-low')}
        >
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#991b1b' }}>{items.filter(i => i.inStock && i.availableQuantity <= 5 && i.availableQuantity > 0).length}</div>
          <div style={{ fontSize: '12px', color: '#dc2626' }}>Very Low</div>
        </div>
        <div 
          style={{
            backgroundColor: stockFilter === 'out-of-stock' ? '#e2e8f0' : '#f1f5f9',
            border: stockFilter === 'out-of-stock' ? '2px solid #64748b' : '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '12px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: stockFilter === 'out-of-stock' ? 'scale(1.02)' : 'scale(1)',
            boxShadow: stockFilter === 'out-of-stock' ? '0 4px 12px rgba(100, 116, 139, 0.3)' : 'none'
          }}
          onClick={() => setStockFilter(stockFilter === 'out-of-stock' ? 'all' : 'out-of-stock')}
        >
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#475569' }}>{items.filter(i => !i.inStock || i.availableQuantity === 0).length}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Out of Stock</div>
        </div>
      </div>

      

      <Card 
        title="Inventory Controls"
        titleAction={
          <button
            onClick={() => setShowRemovedItemsPanel(true)}
            className="btn btn-secondary"
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Trash2 size={16} />
            Removed Items
          </button>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '16px', alignItems: 'start', justifyContent: 'flex-start' }}>
          {/* Search Bar */}
          <div style={{ position: 'relative' }}>
            <input 
              className="search-input" 
              placeholder="Search food items..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              style={{ width: '350px' }}
            />
          </div>

          {/* Unified Input Bar */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input 
                className="search-input" 
                placeholder="Manage Food Items"
                value={unifiedInput} 
                onChange={(e) => handleUnifiedInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // If a suggestion is highlighted, fill the input with it
                    if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
                      const selectedItem = suggestions[selectedSuggestionIndex]
                      setUnifiedInput(selectedItem.name)
                      setSuggestions([])
                      setSelectedSuggestionIndex(-1)
                    } else {
                      // Submit the typed text
                      handleUnifiedInputSubmit()
                    }
                    e.preventDefault()
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedSuggestionIndex(prev => 
                      prev < suggestions.length - 1 ? prev + 1 : prev
                    )
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
                  } else if (e.key === 'Escape') {
                    setSuggestions([])
                    setSelectedSuggestionIndex(-1)
                  }
                }}
                style={{ 
                  width: '400px',
                  paddingLeft: '16px',
                  paddingRight: '16px',
                  fontSize: '15px'
                }}
              />
              
              {/* Suggestions Dropdown */}
              {suggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  marginTop: '4px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  zIndex: 1000
                }}>
                  {suggestions.map((item, index) => (
                    <div
                      key={item.id}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleSuggestionClick(item)
                      }}
                      style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        backgroundColor: selectedSuggestionIndex === index ? '#f3f4f6' : 'white',
                        borderBottom: index < suggestions.length - 1 ? '1px solid #e5e7eb' : 'none'
                      }}
                      onMouseEnter={() => setSelectedSuggestionIndex(index)}
                    >
                      <div style={{ fontWeight: '500', color: '#111827' }}>{item.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>₹{item.price}</div>
            </div>
                  ))}
                </div>
              )}
          </div>

            {/* Action Buttons */}
            {unifiedInput.trim() && (
              <div style={{ 
                display: 'flex', 
                gap: '8px',
                marginLeft: '8px'
              }}>
                {findExistingItem(unifiedInput.trim()) ? (
                  <>
                    <button
                      onClick={handleUnifiedInputSubmit}
                      style={{ 
                        width: '75px', 
                        height: '36px', 
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'white',
                        backgroundColor: '#3b82f6',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#2563eb'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
                    >
                      Edit
                    </button>
                    <button
                onClick={() => {
                        const item = findExistingItem(unifiedInput.trim())
                        if (item) {
                          setConfirmRemove({ itemId: item.id, itemName: item.name })
                        }
                      }}
                      style={{ 
                        width: '85px', 
                        height: '36px', 
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'white',
                        backgroundColor: '#ef4444',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#dc2626'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#ef4444'}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleUnifiedInputSubmit}
                    style={{ 
                      width: '100px', 
                      height: '36px', 
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'white',
                      backgroundColor: '#10b981',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#059669'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#10b981'}
                  >
                    Add Item
                  </button>
                )}
            </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Inventory Items">
        {categories.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '12px',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Categories:</span>
            <button
              onClick={() => setCategoryFilter('all')}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 500,
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: categoryFilter === 'all' ? '#2563eb' : 'var(--muted-bg)',
                color: categoryFilter === 'all' ? '#ffffff' : 'var(--text)',
                transition: 'all 0.2s ease',
                boxShadow: categoryFilter === 'all' ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none',
              }}
            >
              All ({items.length})
            </button>
            {(() => {
              const uncategorizedCount = categoryCounts['uncategorized'] || 0
              if (!uncategorizedCount) return null
              return (
                <button
                  onClick={() => setCategoryFilter(categoryFilter === 'uncategorized' ? 'all' : 'uncategorized')}
                  style={{
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: categoryFilter === 'uncategorized' ? '#2563eb' : 'var(--muted-bg)',
                    color: categoryFilter === 'uncategorized' ? '#ffffff' : 'var(--text)',
                    transition: 'all 0.2s ease',
                    boxShadow: categoryFilter === 'uncategorized' ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none',
                  }}
                >
                  Uncategorized ({uncategorizedCount})
                </button>
              )
            })()}
            {categories
              .map((category) => {
                const key = category?.id != null ? String(category.id) : null
                const count = key ? (categoryCounts[key] || 0) : 0
                return { category, key, count }
              })
              .filter(({ count }) => count > 0)
              .sort((a, b) => (a.category?.name || '').localeCompare(b.category?.name || ''))
              .map(({ category, key, count }) => (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: categoryFilter === key ? '#2563eb' : 'var(--muted-bg)',
                    color: categoryFilter === key ? '#ffffff' : 'var(--text)',
                    transition: 'all 0.2s ease',
                    boxShadow: categoryFilter === key ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none',
                  }}
                >
                  {category.name} ({count})
                </button>
              ))}
          </div>
        )}
        {stockFilter !== 'all' && (
          <div style={{ 
            marginBottom: '12px', 
            padding: '8px 12px', 
            backgroundColor: '#f0f9ff', 
            border: '1px solid #0ea5e9', 
            borderRadius: '6px',
            fontSize: '14px',
            color: '#0369a1'
          }}>
            <strong>🔍 Filter Active:</strong> Showing {stockFilter === 'in-stock' ? 'In Stock' : 
                                                      stockFilter === 'low-stock' ? 'Low Stock' : 
                                                      stockFilter === 'very-low' ? 'Very Low' : 
                                                      'Out of Stock'} items only
            <button 
              onClick={() => setStockFilter('all')}
              style={{ 
                marginLeft: '8px', 
                padding: '2px 8px', 
                fontSize: '12px', 
                backgroundColor: '#0ea5e9', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px', 
                cursor: 'pointer' 
              }}
            >
              Clear Filter
            </button>
          </div>
        )}
        <table className="table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>Image</th>
                <th style={{ width: '25%' }}>Item Name</th>
                <th style={{ width: '12%', textAlign: 'right' }}>Price</th>
                <th style={{ width: '12%', textAlign: 'center' }}>Quantity</th>
                <th style={{ width: '15%', textAlign: 'center' }}>Stock Status</th>
                <th style={{ width: '200px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
              {displayedItems.map((it) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px' }}>
                    <div style={{ 
                      width: '40px', 
                      height: '40px', 
                      borderRadius: '8px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      margin: '0 auto'
                    }}>
                      {it.image_url ? (
                        <img 
                          src={it.image_url} 
                          alt={it.name}
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover' 
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <div style={{ 
                        display: it.image_url ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        fontSize: '20px',
                        color: '#6b7280'
                      }}>
                        📷
                      </div>
                    </div>
                  </td>
                  <td style={{ verticalAlign: 'middle' }}>
                    <strong>{it.name}</strong>
                  </td>
                <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                  {editingPrice === it.id ? (
                    <input
                      type="number"
                      className="price-input"
                      value={it.price}
                      onChange={(e) => setItems(items.map(item => 
                        item.id === it.id ? { ...item, price: Number(e.target.value) } : item
                      ))}
                      onBlur={() => {
                        updatePrice(it.id, it.price)
                        setEditingPrice(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updatePrice(it.id, it.price)
                          setEditingPrice(null)
                        } else if (e.key === 'Escape') {
                          setEditingPrice(null)
                        }
                      }}
                      min="0"
                      step="0.01"
                      autoFocus
                      style={{ MozAppearance: 'textfield' }}
                    />
                  ) : (
                    <span 
                      className="price-cell"
                      onClick={() => setEditingPrice(it.id)}
                    >
                      ₹{it.price}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  {editingQuantity === it.id ? (
                    <input
                      type="number"
                      className="quantity-input"
                      value={it.availableQuantity}
                      onChange={(e) => setItems(items.map(item => 
                        item.id === it.id ? { ...item, availableQuantity: Number(e.target.value) } : item
                      ))}
                      onBlur={() => {
                        updateQuantity(it.id, it.availableQuantity)
                        setEditingQuantity(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateQuantity(it.id, it.availableQuantity)
                          setEditingQuantity(null)
                        } else if (e.key === 'Escape') {
                          setEditingQuantity(null)
                        }
                      }}
                      min="0"
                      autoFocus
                    />
                  ) : (
                    <span 
                      className="quantity-cell"
                      onClick={() => setEditingQuantity(it.id)}
                      style={{
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s ease',
                        display: 'inline-block',
                        minWidth: '40px',
                        textAlign: 'center',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: it.availableQuantity > 20 ? '#10b981' : it.availableQuantity > 5 ? '#f59e0b' : it.availableQuantity > 0 ? '#ef4444' : '#6b7280'
                      }}
                    >
                      {it.availableQuantity}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  <span className="stock-status-badge" style={{
                    backgroundColor: it.availableQuantity > 20 ? '#dcfce7' : it.availableQuantity > 5 ? '#fef3c7' : it.availableQuantity > 0 ? '#fee2e2' : '#f3f4f6',
                    color: it.availableQuantity > 20 ? '#166534' : it.availableQuantity > 5 ? '#92400e' : it.availableQuantity > 0 ? '#991b1b' : '#6b7280'
                  }}>
                    {it.availableQuantity > 20 ? '🟢 In Stock' : it.availableQuantity > 5 ? '🟡 Low Stock' : it.availableQuantity > 0 ? '🟠 Very Low' : '🔴 Out of Stock'}
                  </span>
                </td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap' }}>
                    {it.inStock ? (
                      <button 
                        className="btn" 
                        onClick={() => toggleStock(it.id, false)}
                        style={{
                          padding: '10px 16px',
                          fontSize: '14px',
                          minWidth: '100px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Mark Out
                      </button>
                    ) : (
                      <button 
                        className="btn" 
                        onClick={() => setMarkInDialog({ itemId: it.id, itemName: it.name, qty: '' })}
                        style={{
                          padding: '10px 16px',
                          fontSize: '14px',
                          minWidth: '100px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Mark In
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mark In Quantity Dialog */}
      {markInDialog && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999999, display: 'grid', placeItems: 'center' }}
          onClick={() => setMarkInDialog(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--panel-bg)', border: '1px solid var(--border)', borderRadius: 12, width: 360, padding: 16 }}
            className="dark:!bg-gray-800"
          >
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Mark In</h3>
            <p style={{ margin: '8px 0 12px 0', fontSize: 14, color: 'var(--text)' }}>Enter quantity for "{markInDialog.itemName}"</p>
            <style>{`
              .no-spin::-webkit-outer-spin-button, .no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
              .no-spin { -moz-appearance: textfield; appearance: textfield; }
            `}</style>
            <input 
              type="number"
              min="0"
              value={markInDialog.qty}
              onChange={(e) => setMarkInDialog({ ...markInDialog, qty: e.target.value })}
              className="form-input no-spin"
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, MozAppearance: 'textfield' }}
              placeholder="Enter Quantity"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') {
                const q = parseInt(markInDialog.qty)
                if (!Number.isFinite(q) || q < 0) return
                updateQuantity(markInDialog.itemId, q)
                setMarkInDialog(null)
              }}}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => setMarkInDialog(null)} style={{ background: '#e5e7eb', color: '#111827' }}>Cancel</button>
              <button 
                className="btn"
                onClick={() => {
                  const q = parseInt(markInDialog.qty)
                  if (!Number.isFinite(q) || q < 0) return
                  updateQuantity(markInDialog.itemId, q)
                  setMarkInDialog(null)
                }}
                style={{ background: '#10b981', color: '#ffffff' }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Add Item Panel */}
      {showAddItemPanel && (
        <div className="add-item-panel-overlay" onClick={closeAddItemPanel}>
          <motion.div 
            className="add-item-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="add-item-panel-header">
              <h3>Add New Item</h3>
              <button 
                className="add-item-panel-close"
                onClick={closeAddItemPanel}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddItemSubmit} className="add-item-form">
              <div className="form-group">
                <label htmlFor="item-name">Item Name *</label>
                <input
                  id="item-name"
                  type="text"
                  className="form-input"
                  value={addItemForm.name}
                  onChange={(e) => setAddItemForm({ ...addItemForm, name: e.target.value })}
                  placeholder="Enter item name"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="item-cost">Cost (₹) *</label>
                <input
                  id="item-cost"
                  type="number"
                  className="form-input"
                  value={addItemForm.cost}
                  onChange={(e) => setAddItemForm({ ...addItemForm, cost: e.target.value })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="item-description">Description</label>
                <textarea
                  id="item-description"
                  className="form-textarea"
                  value={addItemForm.description}
                  onChange={(e) => setAddItemForm({ ...addItemForm, description: e.target.value })}
                  placeholder="Enter item description (optional)"
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label htmlFor="item-category">Category</label>
                <select
                  id="item-category"
                  className="form-input"
                  value={addItemForm.category_id}
                  onChange={(e) => setAddItemForm({ ...addItemForm, category_id: e.target.value })}
                  disabled={loadingCategories}
                  style={{ cursor: loadingCategories ? 'wait' : 'pointer' }}
                >
                  <option value="">Select a category...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {loadingCategories && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    Loading categories...
                  </div>
                )}
                {!loadingCategories && categories.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                    No categories found. Please add categories first.
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="item-serial">Serial Number (Display Order)</label>
                <input
                  id="item-serial"
                  type="number"
                  className="form-input"
                  value={addItemForm.serialNumber}
                  onChange={(e) => setAddItemForm({ ...addItemForm, serialNumber: e.target.value })}
                  placeholder="e.g., 1, 2, 3..."
                  min="1"
                  step="1"
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Controls the display order in Place Order panel (lower numbers appear first)
                </div>
              </div>

              <div className="form-group">
                <label>Image Upload (Optional)</label>
                <ImageUpload
                  value={addItemForm.image}
                  onChange={(file) => setAddItemForm({ ...addItemForm, image: file })}
                  disabled={isSubmitting}
                />
                
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={async () => {
                      console.log('=== TESTING SUPABASE STORAGE CONNECTION ===')
                      try {
                        // Test 1: List buckets
                        console.log('🔍 Step 1: Testing bucket access...')
                        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
                        
                        if (bucketsError) {
                          console.error('❌ Bucket list failed:', bucketsError)
                          alert(`❌ Bucket access failed: ${bucketsError.message}`)
                          return
                        }
                        
                        console.log('✅ Available buckets:', buckets.map(b => b.name))
                        const foodImagesBucket = buckets.find(b => b.name === 'food_images')
                        
                        if (!foodImagesBucket) {
                          console.log('📦 food_images bucket not found, attempting to create...')
                          
                          // Try to create the bucket
                          try {
                            const { data: createData, error: createError } = await supabase.storage.createBucket('food_images', {
                              public: true,
                              fileSizeLimit: 52428800, // 50MB
                              allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
                            })
                            
                            if (createError) {
                              console.error('❌ Failed to create bucket:', createError)
                              alert(`❌ Cannot create bucket automatically: ${createError.message}\n\nPlease create it manually in Supabase Dashboard:\n1. Go to Storage\n2. Click "New bucket"\n3. Name: food_images\n4. Check "Public bucket"\n5. Click "Create bucket"`)
                              return
                            }
                            
                            console.log('✅ Bucket created successfully:', createData)
                            alert('✅ food_images bucket created successfully!\n\nNow setting up permissions...')
                            
                            // Try to set up policies
                            try {
                              const policies = [
                                `CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'food_images')`,
                                `CREATE POLICY "Public Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'food_images')`,
                                `CREATE POLICY "Public Update" ON storage.objects FOR UPDATE USING (bucket_id = 'food_images')`,
                                `CREATE POLICY "Public Delete" ON storage.objects FOR DELETE USING (bucket_id = 'food_images')`
                              ]
                              
                              // Note: We can't execute SQL directly from the client, so we'll inform the user
                              alert('✅ Bucket created! Now you need to set up permissions:\n\n1. Go to Supabase Dashboard → SQL Editor\n2. Run these commands:\n\n' + policies.join('\n\n') + '\n\n3. Then test storage access again!')
                              return
                              
                            } catch (policyError) {
                              console.error('❌ Policy setup failed:', policyError)
                              alert('✅ Bucket created but policy setup failed. Please set up permissions manually in Supabase Dashboard.')
                              return
                            }
                            
                          } catch (createError) {
                            console.error('❌ Bucket creation failed:', createError)
                            alert(`❌ Failed to create bucket: ${createError.message}\n\nPlease create it manually in Supabase Dashboard.`)
                            return
                          }
                        }
                        
                        console.log('✅ food_images bucket found:', foodImagesBucket)
                        
                        // Test 2: Try to list files in bucket
                        console.log('🔍 Step 2: Testing file listing...')
                        const { data: files, error: filesError } = await supabase.storage
                          .from('food_images')
                          .list()
                        
                        if (filesError) {
                          console.error('❌ File listing failed:', filesError)
                          alert(`❌ Cannot access files in bucket: ${filesError.message}\n\nThis is likely a permissions issue. Check bucket policies.`)
                          return
                        }
                        
                        console.log('✅ Files in bucket:', files.length)
                        
                        // Test 3: Try to upload a small test file
                        console.log('🔍 Step 3: Testing upload permissions...')
                        const testFile = new File(['test'], 'test.txt', { type: 'text/plain' })
                        const { data: uploadData, error: uploadError } = await supabase.storage
                          .from('food_images')
                          .upload(`test_${Date.now()}.txt`, testFile)
                        
                        if (uploadError) {
                          console.error('❌ Upload test failed:', uploadError)
                          alert(`❌ Upload test failed: ${uploadError.message}\n\nBucket exists but upload permissions are missing.`)
                          return
                        }
                        
                        console.log('✅ Upload test successful:', uploadData)
                        
                        // Clean up test file
                        await supabase.storage
                          .from('food_images')
                          .remove([uploadData.path])
                        
                        alert(`✅ Storage test successful!\n\n- Buckets: ${buckets.length} found\n- food_images bucket: ✅ Accessible\n- File listing: ✅ Working\n- Upload: ✅ Working\n\nYour storage is ready!`)
                        
                      } catch (e) {
                        console.error('❌ Storage test error:', e)
                        alert(`❌ Storage test error: ${e.message}`)
                      }
                    }}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    Test Storage Access
                  </button>
                  
                  {addItemForm.image && (
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      onClick={() => {
                        setAddItemForm({ ...addItemForm, image: null })
                        document.getElementById('item-image').value = ''
                      }}
                      style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#ef4444', color: 'white' }}
                    >
                      Remove Image
                    </button>
                  )}
                  
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => {
                      const sqlCommands = `
-- Copy and paste these SQL commands in your Supabase SQL Editor:

-- 1. Create storage policies for food_images bucket
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT USING (bucket_id = 'food_images');

CREATE POLICY "Public Upload" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'food_images');

CREATE POLICY "Public Update" ON storage.objects
FOR UPDATE USING (bucket_id = 'food_images');

CREATE POLICY "Public Delete" ON storage.objects
FOR DELETE USING (bucket_id = 'food_images');

-- 2. If the above fails, try this alternative:
INSERT INTO storage.policies (id, bucket_id, name, definition, check_expression)
VALUES 
  ('food_images_select', 'food_images', 'Public Access', 'bucket_id = ''food_images''', 'bucket_id = ''food_images'''),
  ('food_images_insert', 'food_images', 'Public Upload', 'bucket_id = ''food_images''', 'bucket_id = ''food_images'''),
  ('food_images_update', 'food_images', 'Public Update', 'bucket_id = ''food_images''', 'bucket_id = ''food_images'''),
  ('food_images_delete', 'food_images', 'Public Delete', 'bucket_id = ''food_images''', 'bucket_id = ''food_images''')
ON CONFLICT (id) DO NOTHING;
                      `
                      
                      // Copy to clipboard
                      navigator.clipboard.writeText(sqlCommands).then(() => {
                        alert('📋 SQL commands copied to clipboard!\n\n1. Go to Supabase Dashboard → SQL Editor\n2. Paste and run the commands\n3. Test storage access again')
                      }).catch(() => {
                        alert('📋 SQL Commands:\n\n' + sqlCommands + '\n\nCopy these and run in Supabase SQL Editor')
                      })
                    }}
                    style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white' }}
                  >
                    Fix Permissions
                  </button>
                </div>
              </div>

              {submitError && (
                <div className="form-error" style={{
                  backgroundColor: '#fef2f2',
                  border: '2px solid #fecaca',
                  borderRadius: '8px',
                  padding: '12px',
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={20} style={{ color: '#dc2626' }} />
                  <div>
                    <div style={{ fontWeight: '600', color: '#dc2626', marginBottom: '4px' }}>
                      ❌ Upload Failed
                    </div>
                    <div style={{ color: '#991b1b', fontSize: '14px' }}>
                      {submitError}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>
                      Check the browser console (F12) for more details
                    </div>
                    <button 
                      type="button"
                      onClick={() => setSubmitError('')}
                      style={{
                        marginTop: '8px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Clear Error & Try Again
                    </button>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeAddItemPanel}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Add Item
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Item Panel */}
      {showEditItemPanel && (
        <div className="add-item-panel-overlay" onClick={closeEditItemPanel}>
          <motion.div 
            className="add-item-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="add-item-panel-header">
              <h3>Edit Item</h3>
              <button 
                className="add-item-panel-close"
                onClick={closeEditItemPanel}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditItemSubmit} className="add-item-form">
              <div className="form-group">
                <label htmlFor="edit-item-name">Item Name *</label>
                <input
                  id="edit-item-name"
                  type="text"
                  className="form-input"
                  value={editItemForm.name}
                  onChange={(e) => setEditItemForm({ ...editItemForm, name: e.target.value })}
                  placeholder="Enter item name"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-item-cost">Cost (₹) *</label>
                <input
                  id="edit-item-cost"
                  type="number"
                  className="form-input"
                  value={editItemForm.cost}
                  onChange={(e) => setEditItemForm({ ...editItemForm, cost: e.target.value })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-item-description">Description</label>
                <textarea
                  id="edit-item-description"
                  className="form-textarea"
                  value={editItemForm.description}
                  onChange={(e) => setEditItemForm({ ...editItemForm, description: e.target.value })}
                  placeholder="Enter item description (optional)"
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-item-category">Category</label>
                <select
                  id="edit-item-category"
                  className="form-input"
                  value={editItemForm.category_id}
                  onChange={(e) => setEditItemForm({ ...editItemForm, category_id: e.target.value })}
                  disabled={loadingCategories}
                  style={{ cursor: loadingCategories ? 'wait' : 'pointer' }}
                >
                  <option value="">Select a category...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {loadingCategories && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    Loading categories...
                  </div>
                )}
                {!loadingCategories && categories.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                    No categories found. Please add categories first.
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="edit-item-serial">Serial Number (Display Order)</label>
                <input
                  id="edit-item-serial"
                  type="number"
                  className="form-input"
                  value={editItemForm.serialNumber}
                  onChange={(e) => setEditItemForm({ ...editItemForm, serialNumber: e.target.value })}
                  placeholder="e.g., 1, 2, 3..."
                  min="1"
                  step="1"
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Controls the display order in Place Order panel (lower numbers appear first)
                </div>
              </div>

              <div className="form-group">
                <label>Current Image</label>
                {editingItem?.image_url && (
                  <div style={{ marginBottom: '10px' }}>
                    <img 
                      src={editingItem.image_url} 
                      alt={editingItem.name}
                      style={{ 
                        width: '100px', 
                        height: '100px', 
                        objectFit: 'cover', 
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb'
                      }}
                    />
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      Current image
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>New Image Upload (Optional)</label>
                <ImageUpload
                  value={editItemForm.image}
                  onChange={(file) => setEditItemForm({ ...editItemForm, image: file })}
                  disabled={isSubmitting}
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Upload a new image to replace the current one, or leave empty to keep current image
                </div>
              </div>

              {submitError && (
                <div className="form-error" style={{
                  backgroundColor: '#fef2f2',
                  border: '2px solid #fecaca',
                  borderRadius: '8px',
                  padding: '12px',
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={20} style={{ color: '#dc2626' }} />
                  <div>
                    <div style={{ fontWeight: '600', color: '#dc2626', marginBottom: '4px' }}>
                      ❌ Update Failed
                    </div>
                    <div style={{ color: '#991b1b', fontSize: '14px' }}>
                      {submitError}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>
                      Check the browser console (F12) for more details
                    </div>
                  </div>
                </div>
              )}

              <div className="form-actions" style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={closeEditItemPanel}
                  disabled={isSubmitting}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={isSubmitting}
                  style={{ flex: 1 }}
                >
                  {isSubmitting ? 'Updating...' : 'Update Item'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast.show && (
          <motion.div
            className="fixed bottom-4 right-4 z-50"
            style={{ pointerEvents: 'none' }}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ duration: 0.3 }}
          >
            <div
              className={`px-6 py-3 rounded-lg shadow-lg text-white ${
                showToast.type === 'success' 
                  ? 'bg-green-500' 
                  : 'bg-red-500'
              }`}
              style={{ pointerEvents: 'auto' }}
            >
              {showToast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Removed Items Panel */}
      <RemovedItemsPanel
        isOpen={showRemovedItemsPanel}
        onClose={() => setShowRemovedItemsPanel(false)}
        onItemRestored={handleItemRestored}
      />
      {/* Item Not Found Error Modal */}
      <AnimatePresence>
        {itemNotFoundError && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setItemNotFoundError(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                zIndex: 99998,
                backdropFilter: 'blur(4px)'
              }}
            />
            
            {/* Error Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                zIndex: 99999,
                maxWidth: '450px',
                width: '90%',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
              }}
              className="dark:!bg-gray-800"
            >
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '16px'
                }}>
                  <AlertCircle size={24} style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <h3 
                    className="dark:!text-white"
                    style={{ 
                      margin: 0, 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: '#111827' 
                    }}
                  >
                    Item Not Found
                  </h3>
                </div>
              </div>

              {/* Message */}
              <p 
                className="dark:!text-gray-300"
                style={{ 
                  margin: '0 0 24px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  lineHeight: '1.5'
                }}
              >
                The item <strong style={{ color: '#111827' }} className="dark:!text-white">"{itemNotFoundError.itemName}"</strong> was not found in the inventory. 
                Please check the spelling and try again.
              </p>

              {/* Info Note */}
              <div style={{
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}>
                <AlertCircle size={16} style={{ color: '#0284c7', marginTop: '2px', flexShrink: 0 }} />
                <p style={{ 
                  margin: 0, 
                  fontSize: '13px', 
                  color: '#075985',
                  lineHeight: '1.4'
                }}>
                  Tip: Item names are case-insensitive. Make sure you're using the exact name as it appears in the inventory list.
                </p>
              </div>

              {/* Action Button */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setItemNotFoundError(null)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#2563eb'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#3b82f6'
                  }}
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit/Remove Confirmation Dialog */}
      <AnimatePresence>
        {confirmAction && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmAction(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                zIndex: 99998,
                backdropFilter: 'blur(4px)'
              }}
            />
            
            {/* Confirmation Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                zIndex: 99999,
                maxWidth: '450px',
                width: '90%',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
              }}
              className="dark:!bg-gray-800"
            >
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '16px'
                }}>
                  <AlertCircle size={24} style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <h3 
                    className="dark:!text-white"
                    style={{ 
                      margin: 0, 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: '#111827' 
                    }}
                  >
                    Item Already Exists
                  </h3>
                </div>
              </div>

              {/* Message */}
              <p 
                className="dark:!text-gray-300"
                style={{ 
                  margin: '0 0 24px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  lineHeight: '1.5'
                }}
              >
                The item <strong style={{ color: '#111827' }} className="dark:!text-white">"{confirmAction.item.name}"</strong> already exists in your inventory.
                What would you like to do?
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmAction(null)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#e5e7eb'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#f3f4f6'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConfirmAction('remove')}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#dc2626'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#ef4444'
                  }}
                >
                  <X size={16} />
                  Remove
                </button>
                <button
                  onClick={() => handleConfirmAction('edit')}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#2563eb'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#3b82f6'
                  }}
                >
                  <Save size={16} />
                  Edit
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Remove Item Confirmation Dialog */}
      <AnimatePresence>
        {confirmRemove && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmRemove(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                zIndex: 99998,
                backdropFilter: 'blur(4px)'
              }}
            />
            
            {/* Confirmation Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                zIndex: 99999,
                maxWidth: '450px',
                width: '90%',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
              }}
              className="dark:!bg-gray-800"
            >
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '16px'
                }}>
                  <AlertCircle size={24} style={{ color: '#dc2626' }} />
                </div>
                <div>
                  <h3 
                    className="dark:!text-white"
                    style={{ 
                      margin: 0, 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: '#111827' 
                    }}
                  >
                    Remove Item?
                  </h3>
                </div>
              </div>

              {/* Message */}
              <p 
                className="dark:!text-gray-300"
                style={{ 
                  margin: '0 0 24px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  lineHeight: '1.5'
                }}
              >
                Are you sure you want to remove <strong style={{ color: '#111827' }} className="dark:!text-white">"{confirmRemove.itemName}"</strong> from your active inventory? 
                The item will be moved to the Removed Items list and can be restored later.
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmRemove(null)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#e5e7eb'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#f3f4f6'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRemove}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#dc2626'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#ef4444'
                  }}
                >
                  <X size={16} />
                  Remove Item
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
function ReportsPage() {
  const [from, setFrom] = useState(() => new Date(Date.now()-24*60*60*1000).toISOString().slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [itemsMap, setItemsMap] = useState({}) // maps food_items id/item_id -> name
  // Build rows dynamically from delivered orders only
  const [dataDelivered, setDataDelivered] = useState([])
  
  // Fetch delivered orders from backend if window variable is empty
  useEffect(() => {
    const fetchDeliveredOrders = async () => {
      try {
        if (window.__IARE_DELIVERED__ && window.__IARE_DELIVERED__.length > 0) {
          setDataDelivered(window.__IARE_DELIVERED__)
          console.log('📊 Reports: Using window.__IARE_DELIVERED__ data')
        } else {
          console.log('📊 Reports: Fetching delivered orders from Supabase...')
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'DELIVERED')
            .order('created_at', { ascending: false })
          
          if (error) throw error
          setDataDelivered(data || [])
          console.log('📊 Reports: Fetched', data?.length || 0, 'delivered orders from Supabase')
        }
      } catch (e) {
        console.error('❌ Reports: Failed to fetch delivered orders:', e)
        setDataDelivered([])
      }
    }
    
    fetchDeliveredOrders()
  }, [])
  
  const toValidMs = (ts) => {
    const d = new Date(ts)
    return isNaN(d) ? null : d.getTime()
  }
  // Fetch food_items to resolve item names from backend
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const pageSize = 1000
        let fromIdx = 0
        let all = []
        while (true) {
          const toIdx = fromIdx + pageSize - 1
          const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .range(fromIdx, toIdx)
          if (error) throw error
          const batch = data || []
          all = all.concat(batch)
          if (batch.length < pageSize) break
          fromIdx += pageSize
        }
        const map = {}
        for (const r of all) {
          const name = r.name ?? r.item_name
          if (!name) continue
          if (r.id) map[r.id] = name
          if (r.item_id) map[r.item_id] = name
          if (r.code) map[r.code] = name
          if (r.slug) map[r.slug] = name
        }
        setItemsMap(map)
      } catch (e) {
        // ignore failures; will fallback to existing fields
      }
    }
    fetchItems()
  }, [])
  const rows = dataDelivered.map(o => {
    const receivedRaw = o.createdAt ?? o.created_at ?? o.receivedAt ?? o.received_at
    const deliveredRaw = o.deliveredAt ?? o.delivered_at ?? o.updated_at ?? o.created_at ?? o.createdAt
    // Enhanced token extraction - try multiple possible field names
    const token = o.token_no ?? o.order_token ?? o.token ?? o.token_number ?? o.id ?? null
    
    const resolvedItem = (
      o.item_name ??
      itemsMap[o.item_id] ?? itemsMap[o.itemId] ?? itemsMap[o.item] ??
      o.items ?? 'Item'
    )
    // Get the total amount from delivered order - prioritize total_amount, then price
    const totalAmount = o.total_amount || o.price || 0
    return {
      id: o.id,
      item: resolvedItem,
      qty: 1,
      total: totalAmount,
      total_amount: totalAmount, // Ensure we have this for revenue calculation
      price: totalAmount, // Fallback for price display
      status: o.status,
      receivedTs: toValidMs(receivedRaw),
      deliveredTs: toValidMs(deliveredRaw),
      token,
    }
  })

  const fmt = (ms) => {
    if (!ms) return ''
    const d = new Date(ms)
    return isNaN(d) ? '' : d.toISOString().slice(0,10)
  }
  const filtered = rows.filter(r => {
    if (!r.deliveredTs) return false
    const d = fmt(r.deliveredTs)
    return d && d >= from && d <= to
  })
  const displayRows = [...filtered].sort((a,b) => b.deliveredTs - a.deliveredTs).slice(0, 5)
  const totals = filtered.reduce((acc, r) => {
    acc.orders += 1
    // Calculate revenue from delivered items - use total_amount, total, or price
    const itemRevenue = r.total_amount || r.total || r.price || 0
    acc.revenue += Number(itemRevenue) || 0
    acc.items += 1
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, { orders: 0, revenue: 0, items: 0, PENDING: 0, PREPARING: 0, READY: 0 })

  const exportCsv = () => {
    const header = ['Order Token', 'Item', 'Total', 'Received At', 'Delivered At']
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"'
    const isoNoMs = (ms) => {
      if (!ms) return ''
      const d = new Date(ms)
      if (isNaN(d)) return ''
      return d.toISOString().replace(/\.\d{3}Z$/, '')
    }
    const lines = filtered.map(r => [
      esc(r.token ? ('#' + r.token) : ''),
      esc(r.item),
      esc(r.total_amount || r.total || r.price || 0),
      esc(isoNoMs(r.receivedTs)),
      esc(isoNoMs(r.deliveredTs))
    ].join(','))
    const summary = ["", esc('Total Revenue'), esc(totals.revenue)].join(',')
    const csv = [header.join(','), ...lines, '', summary].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const esc = (v) => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const isoNoMs = (ms) => {
      if (!ms) return ''
      const d = new Date(ms)
      if (isNaN(d)) return ''
      return d.toISOString().replace(/\.\d{3}Z$/, '')
    }
    const rowsHtml = filtered.map(r => `
      <tr>
        <td>${esc(r.token ? ('#' + r.token) : '')}</td>
        <td>${esc(r.item)}</td>
        <td>${esc(r.total_amount || r.total || r.price || 0)}</td>
        <td class="text">${esc(isoNoMs(r.receivedTs))}</td>
        <td class="text">${esc(isoNoMs(r.deliveredTs))}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
      <style>
        table{border-collapse:collapse}
        td,th{border:1px solid #ccc;padding:6px}
        .text{mso-number-format:'\\@';}
        col.id{width:120px} col.item{width:260px} col.total{width:90px}
        col.recv{width:180px} col.delv{width:180px}
      </style></head><body>
      <table>
        <colgroup>
          <col class="id"/>
          <col class="item"/>
          <col class="total"/>
          <col class="recv"/>
          <col class="delv"/>
        </colgroup>
        <thead><tr>
          <th>Order ID</th><th>Item</th><th>Total</th><th>Received At</th><th>Delivered At</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td></td><td>Total Revenue</td><td class="text">${totals.revenue}</td><td></td><td></td></tr></tfoot>
      </table></body></html>`
    const blob = new Blob(["\ufeff", html], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports_${from}_to_${to}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="grid-2">
        <Card title={undefined}>
          <div className="filters">
            <div className="field" style={{minWidth: 220}}>
              <label className="label">From</label>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field" style={{minWidth: 220}}>
              <label className="label">To</label>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn" onClick={exportCsv}>Export CSV</button>
              <button className="btn" onClick={exportExcel}>Export Excel</button>
            </div>
          </div>
        </Card>
        <Card title="Status Breakdown">
          <div className="badges">
            <span className="badge pending">PENDING: {totals.PENDING}</span>
            <span className="badge preparing">PREPARING: {totals.PREPARING}</span>
            <span className="badge ready">READY: {totals.READY}</span>
          </div>
        </Card>
      </div>

      <div className="grid-3">
        <Card title="Total Orders">
          <div className="stat-value">{totals.orders}</div>
          <div className="stat-label">Received</div>
        </Card>
        <Card title="Revenue">
          <div className="stat-value">₹{totals.revenue}</div>
          <div className="stat-label">Total</div>
        </Card>
        <Card title="Delivered Items">
          <div className="stat-value">{totals.items}</div>
        </Card>
      </div>

      <Card title="Orders (latest 5 delivered)">
        <table className="table">
          <thead>
            <tr>
              <th>Order Token</th>
              <th>Item</th>
              <th>Total</th>
              <th>Received</th>
              <th>Delivered</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.id}>
                <td>{r.token ? ('#' + r.token) : ''}</td>
                <td>{r.item}</td>
                <td>₹{r.total_amount || r.total || r.price || 0}</td>
                <td>{new Date(r.receivedTs).toLocaleString()}</td>
                <td>{new Date(r.deliveredTs).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

const TELUGU_DAY_ABBREVIATIONS = ['ఆది', 'సోమ', 'మంగళ', 'బుధ', 'గురు', 'శుక్ర', 'శని']

const FESTIVAL_CALENDAR = [
  { month: 0, day: 14, name: 'Sankranti', reduction: 0.4 },
  { month: 2, day: 8, name: 'Maha Shivaratri', reduction: 0.35 },
  { month: 2, day: 31, name: 'Ugadi', reduction: 0.3 },
  { month: 7, day: 15, name: 'Independence Day', reduction: 0.2 },
  { month: 9, day: 24, name: 'Dussehra', reduction: 0.5 },
  { month: 10, day: 1, name: 'Diwali', reduction: 0.45 },
  { month: 11, day: 25, name: 'Christmas', reduction: 0.25 }
]

const hyderabadFoodPreferences = {
  seasonal: {
    summer: {
      Buttermilk: 1.25,
      'Curd Rice': 1.2,
      'Lemon Rice': 1.15
    },
    monsoon: {
      Pakoda: 1.35,
      'Masala Chai': 1.2,
      Samosa: 1.15
    },
    winter: {
      Tea: 1.2,
      'Vegetable Soup': 1.25,
      Upma: 1.1
    },
    default: {}
  }
}

const getFestivalInfo = (date) => {
  const match = FESTIVAL_CALENDAR.find(
    (festival) => festival.month === date.getMonth() && festival.day === date.getDate()
  )
  return match ? { ...match } : null
}

const getCurrentSeason = (date = new Date()) => {
  const month = date.getMonth()
  if (month >= 3 && month <= 5) return 'summer'
  if (month >= 6 && month <= 8) return 'monsoon'
  return 'winter'
}

const getTeluguDate = (date) => {
  try {
    return {
      day: TELUGU_DAY_ABBREVIATIONS[date.getDay()],
      month: date.toLocaleDateString('te-IN', { month: 'long' }),
      year: date.getFullYear()
    }
  } catch (_) {
    return {
      day: TELUGU_DAY_ABBREVIATIONS[date.getDay()],
      month: date.toLocaleDateString('en-IN', { month: 'long' }),
      year: date.getFullYear()
    }
  }
}

function AIPredictionsPage() {
  const FEATURE_ENABLED = import.meta?.env?.VITE_ENABLE_AI_PREDICTIONS !== 'false'

  const [predictions, setPredictions] = useState(null)
  const [language, setLanguage] = useState('english')
  const [predictionPeriod, setPredictionPeriod] = useState('tomorrow')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [ordersData, setOrdersData] = useState([])
  const [foodItems, setFoodItems] = useState([])
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => new Date())

  const teluguDays = TELUGU_DAY_ABBREVIATIONS

  // Generate AI predictions based on historical data
  const generatePredictions = (orders, items) => {
    if (!orders || orders.length === 0) {
      setPredictions(null)
      return
    }
    console.log('🤖 AI Predictions: Generating predictions...')
    
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 7)
    const lastMonth = new Date(today)
    lastMonth.setDate(lastMonth.getDate() - 30)

    // Filter orders by time periods
    const todayOrders = orders.filter(o => new Date(o.created_at) >= today)
    const yesterdayOrders = orders.filter(o => {
      const orderDate = new Date(o.created_at)
      return orderDate >= yesterday && orderDate < today
    })
    const weekOrders = orders.filter(o => new Date(o.created_at) >= lastWeek)
    const monthOrders = orders.filter(o => new Date(o.created_at) >= lastMonth)

    // Calculate trends
    const todayCount = todayOrders.length
    const yesterdayCount = yesterdayOrders.length
    const weekAvg = weekOrders.length / 7
    const monthAvg = monthOrders.length / 30

    // Calculate item popularity
    const itemStats = {}
    orders.forEach(order => {
      const itemName = order.item_name
      if (!itemStats[itemName]) {
        itemStats[itemName] = {
          totalOrders: 0,
          totalRevenue: 0,
          avgPrice: 0,
          lastOrdered: null
        }
      }
      itemStats[itemName].totalOrders++
      itemStats[itemName].totalRevenue += (order.total_amount || order.price || 0)
      itemStats[itemName].avgPrice = itemStats[itemName].totalRevenue / itemStats[itemName].totalOrders
      
      const orderDate = new Date(order.created_at)
      if (!itemStats[itemName].lastOrdered || orderDate > itemStats[itemName].lastOrdered) {
        itemStats[itemName].lastOrdered = orderDate
      }
    })

    // Sort items by popularity
    const popularItems = Object.entries(itemStats)
      .sort(([,a], [,b]) => b.totalOrders - a.totalOrders)
      .slice(0, 10)

    // Calculate hourly patterns
    const hourlyStats = {}
    orders.forEach(order => {
      const hour = new Date(order.created_at).getHours()
      if (!hourlyStats[hour]) hourlyStats[hour] = 0
      hourlyStats[hour]++
    })

    const peakHours = Object.entries(hourlyStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => `${hour}:00`)

    // Enhanced prediction logic with Hyderabad factors
    const currentSeason = getCurrentSeason(today)
    const teluguDate = getTeluguDate(today)
    const festival = getFestivalInfo(today)
    
    // Calculate predictions for different periods
    const predictions = {}
    
    // Tomorrow prediction
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowFestival = getFestivalInfo(tomorrow)
    const tomorrowSeason = getCurrentSeason(tomorrow)
    
    // Day after tomorrow prediction
    const dayAfterTomorrow = new Date(today)
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
    const dayAfterFestival = getFestivalInfo(dayAfterTomorrow)
    const dayAfterSeason = getCurrentSeason(dayAfterTomorrow)
    
    // Weekly prediction (next 7 days)
    const weeklyPredictions = []
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(today)
      futureDate.setDate(today.getDate() + i)
      const futureFestival = getFestivalInfo(futureDate)
      const futureSeason = getCurrentSeason(futureDate)
      const isWeekend = futureDate.getDay() === 0 || futureDate.getDay() === 6
      
      let basePrediction = weekAvg
      
      // Apply weekend effects (Telangana college population patterns)
      if (isWeekend) {
        if (futureDate.getDay() === 0) {
          // Sunday is holiday - no orders expected
          basePrediction = 0
        } else {
          // Saturday: 20-30% lower demand for non-veg items in Telangana colleges
          // Apply blended average reduction (25% lower overall demand)
          basePrediction *= 0.75
        }
      }
      
      // Apply festival effects (non-veg reduction)
      if (futureFestival) {
        // Apply non-veg reduction factor
        basePrediction *= (1 - futureFestival.reduction + 0.3) // 30% base demand remains
      }
      
      // Apply seasonal factors
      const seasonalFactors =
        hyderabadFoodPreferences.seasonal[futureSeason] ||
        hyderabadFoodPreferences.seasonal.default ||
        {}
      const avgSeasonalBoost = Object.values(seasonalFactors).reduce((a, b) => a + b, 0) / Math.max(Object.keys(seasonalFactors).length, 1)
      basePrediction *= (avgSeasonalBoost || 1.0)
      
      weeklyPredictions.push({
        date: futureDate,
        day: teluguDays[futureDate.getDay()],
        predicted: Math.round(basePrediction),
        festival: futureFestival,
        season: futureSeason,
        isWeekend,
        isHoliday: futureDate.getDay() === 0 // Sunday is college holiday
      })
    }
    
    const predictedTomorrow = weeklyPredictions[0].predicted
    const predictedDayAfter = weeklyPredictions[1].predicted
    const weeklyAverage = Math.round(weeklyPredictions.reduce((sum, day) => sum + day.predicted, 0) / 7)

    // Generate recommendations
    const recommendations = []
    
    // Low stock recommendations
    items.forEach(item => {
      const quantity = item.available_quantity || item.stock || 0
      const popularity = itemStats[item.name]?.totalOrders || 0
      
      if (quantity <= 5 && popularity > 0) {
        recommendations.push({
          type: 'low_stock',
          priority: 'high',
          message: `${item.name} is running low (${quantity} left) but is popular (${popularity} orders)`,
          action: 'Restock immediately'
        })
      } else if (quantity <= 10 && popularity > 5) {
        recommendations.push({
          type: 'low_stock',
          priority: 'medium',
          message: `${item.name} has ${quantity} units left and moderate demand`,
          action: 'Consider restocking soon'
        })
      }
    })

    // Popular item recommendations
    if (popularItems.length > 0) {
      recommendations.push({
        type: 'popular_item',
        priority: 'medium',
        message: `${popularItems[0][0]} is your most popular item (${popularItems[0][1].totalOrders} orders)`,
        action: 'Ensure adequate stock'
      })
    }

    // Peak hour recommendations
    if (peakHours.length > 0) {
      recommendations.push({
        type: 'peak_hours',
        priority: 'low',
        message: `Peak ordering hours: ${peakHours.join(', ')}`,
        action: 'Prepare extra staff during these hours'
      })
    }

    // Festival recommendations (non-veg reduction)
    if (tomorrowFestival) {
      recommendations.push({
        type: 'festival_nonveg_reduction',
        priority: 'high',
        message: `Tomorrow is ${tomorrowFestival.name} - Non-veg consumption will be ${Math.round(tomorrowFestival.reduction * 100)}% lower`,
        action: `Reduce non-veg items by ${Math.round(tomorrowFestival.reduction * 100)}%. Focus on vegetarian options like Dosa, Idli, Sambar, Curd Rice`
      })
    }

    // Seasonal recommendations
    const seasonalItems =
      hyderabadFoodPreferences.seasonal[currentSeason] ||
      hyderabadFoodPreferences.seasonal.default ||
      {}
    const topSeasonalItem = Object.entries(seasonalItems).sort(([,a], [,b]) => b - a)[0]
    if (topSeasonalItem && topSeasonalItem[1] > 1.2) {
      recommendations.push({
        type: 'seasonal_boost',
        priority: 'medium',
        message: `Current season (${currentSeason}) favors ${topSeasonalItem[0]} - demand is ${Math.round(topSeasonalItem[1] * 100)}% higher`,
        action: `Increase ${topSeasonalItem[0]} preparation for seasonal demand`
      })
    }

    // Weekend recommendations (Telangana college patterns)
    const sundayPrediction = weeklyPredictions.find(day => day.isHoliday)
    const saturdayPrediction = weeklyPredictions.find(day => day.isWeekend && !day.isHoliday)
    
    if (sundayPrediction) {
      recommendations.push({
        type: 'holiday_planning',
        priority: 'medium',
        message: `Sunday is college holiday - no orders expected (0 orders)`,
        action: 'College closed on Sunday. Focus on maintenance and preparation for Monday'
      })
    }
    
    if (saturdayPrediction) {
      recommendations.push({
        type: 'saturday_pattern',
        priority: 'medium',
        message: `Saturday shows 25% lower demand due to Telangana college non-veg consumption patterns`,
        action: 'Reduce non-veg items by 20-30%. Focus on vegetarian options and lighter meals'
      })
    }

    // Revenue predictions
    const totalRevenue = orders.reduce(
      (sum, order) => sum + (Number(order.total_amount ?? order.price ?? 0) || 0),
      0
    )
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0
    const predictedRevenue = predictedTomorrow * avgOrderValue
    const predictedRevenueDayAfter = predictedDayAfter * avgOrderValue
    const predictedWeeklyRevenue = weeklyAverage * 7 * avgOrderValue

    setPredictions({
      summary: {
        todayOrders: todayCount,
        yesterdayOrders: yesterdayCount,
        weekAverage: Math.round(weekAvg),
        monthAverage: Math.round(monthAvg),
        predictedTomorrow: predictedTomorrow,
        predictedDayAfter: predictedDayAfter,
        weeklyAverage: weeklyAverage,
        predictedRevenue: Math.round(predictedRevenue),
        predictedRevenueDayAfter: Math.round(predictedRevenueDayAfter),
        predictedWeeklyRevenue: Math.round(predictedWeeklyRevenue),
        totalItems: items.length,
        totalOrders: orders.length
      },
      popularItems: popularItems.slice(0, 5),
      peakHours,
      recommendations,
      itemStats,
      weeklyPredictions,
      teluguDate,
      currentSeason,
      festival,
      lastUpdated: new Date()
    })

    console.log('🤖 AI Predictions: Generated predictions successfully')
  }

  const fetchOrdersData = async ({ showSpinner = false, silent = false } = {}) => {
    if (showSpinner) {
      setIsLoading(true)
    }

    try {
      const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })

      if (ordersError) throw ordersError

      const { data: items, error: itemsError } = await supabase
        .from('food_items')
        .select('*')
        .order('name', { ascending: true })

      if (itemsError) throw itemsError

      const normalizedOrders = orders ?? []
      const normalizedItems = items ?? []

      setOrdersData(normalizedOrders)
      setFoodItems(normalizedItems)
      generatePredictions(normalizedOrders, normalizedItems)
      setLastUpdated(new Date())

      console.log('🤖 AI Predictions: data refreshed', {
        orders: normalizedOrders.length,
        items: normalizedItems.length
      })
    } catch (error) {
      console.error('❌ AI Predictions: Failed to fetch data', error)
      if (!silent) {
        alert('Failed to fetch AI predictions data')
      }
    } finally {
      if (showSpinner) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchOrdersData({ showSpinner: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh every hour
  useEffect(() => {
    if (!autoRefresh) {
      return
    }

    fetchOrdersData({ silent: true })

    const interval = setInterval(() => {
      console.log('🤖 AI Predictions: Auto-refreshing data...')
      fetchOrdersData({ silent: true })
    }, 60 * 60 * 1000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh])

  // Calendar navigation functions
  const navigateMonth = (direction) => {
    const newMonth = new Date(currentMonth)
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1)
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1)
    }
    setCurrentMonth(newMonth)
  }

  // Generate predictions for any month (not just current week)
  const generateMonthlyPredictions = (orders, items, targetMonth) => {
    const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1)
    const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0)
    const daysInMonth = monthEnd.getDate()
    
    const monthlyPredictions = []
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), day)
      const festival = getFestivalInfo(date)
      const isWeekend = date.getDay() === 0 || date.getDay() === 6
      const isHoliday = date.getDay() === 0
      
      // Calculate base prediction (simplified - use historical average)
      const weekAvg = orders.length > 0 ? orders.length / 30 : 10 // Fallback to 10 if no data
      let basePrediction = weekAvg
      
      // Apply weekend effects
      if (isWeekend) {
        if (isHoliday) {
          basePrediction = 0
        } else {
          basePrediction *= 0.75 // Saturday reduction
        }
      }
      
      // Apply festival effects
      if (festival) {
        basePrediction *= (1 - festival.reduction + 0.3)
      }
      
      monthlyPredictions.push({
        date: date,
        day: teluguDays[date.getDay()],
        predicted: Math.round(basePrediction),
        festival: festival,
        season: getCurrentSeason(date),
        isWeekend,
        isHoliday
      })
    }
    
    return monthlyPredictions
  }

  const renderSelectedDayDetails = () => {
    if (!predictions) return null

    const monthlyPredictions = generateMonthlyPredictions(ordersData, foodItems, currentMonth)
    const selectedDay = monthlyPredictions.find(
      (day) => day.date.toDateString() === selectedDate.toDateString()
    )

    if (!selectedDay) return null

    return (
      <div
        style={{
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          border: '1px solid #e5e7eb'
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>
          {language === 'telugu' ? 'ఎంచుకున్న రోజు వివరాలు' : 'Selected Day Details'}
        </h3>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
            {selectedDay.date.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
          {language === 'telugu' && (
            <div style={{ fontSize: '16px', color: '#6b7280', marginTop: '4px' }}>
              {selectedDay.day}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            marginBottom: '16px'
          }}
        >
          <div
            style={{
              padding: '12px',
              backgroundColor: selectedDay.isHoliday ? '#fef2f2' : '#ffffff',
              borderRadius: '8px',
              border: `1px solid ${selectedDay.isHoliday ? '#fca5a5' : '#e5e7eb'}`
            }}
          >
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              {language === 'telugu' ? 'అంచనా ఆర్డర్లు' : 'Predicted Orders'}
            </div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: selectedDay.isHoliday ? '#dc2626' : '#16a34a'
              }}
            >
              {selectedDay.predicted}
            </div>
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}
          >
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              {language === 'telugu' ? 'రోజు రకం' : 'Day Type'}
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600' }}>
              {selectedDay.isHoliday
                ? '🏫 Holiday'
                : selectedDay.isWeekend
                  ? '🥩 Saturday (Less Non-veg)'
                  : '📅 Weekday'}
            </div>
          </div>
        </div>

        {selectedDay.festival && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#fef3c7',
              borderRadius: '8px',
              border: '1px solid #fde047',
              marginBottom: '16px'
            }}
          >
            <div style={{ fontSize: '12px', color: '#d97706', marginBottom: '4px' }}>
              🕉️ {language === 'telugu' ? 'పండుగ' : 'Festival'}
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#d97706', marginBottom: '4px' }}>
              {selectedDay.festival.name}
            </div>
            <div style={{ fontSize: '14px', color: '#d97706' }}>
              Non-veg reduction: {Math.round(selectedDay.festival.reduction * 100)}%
            </div>
          </div>
        )}

        <div
          style={{
            padding: '12px',
            backgroundColor: '#f0fdf4',
            borderRadius: '8px',
            border: '1px solid #bbf7d0'
          }}
        >
          <div style={{ fontSize: '12px', color: '#16a34a', marginBottom: '4px' }}>
            💡 {language === 'telugu' ? 'సిఫార్సులు' : 'Recommendations'}
          </div>
          <div style={{ fontSize: '14px', color: '#16a34a' }}>
            {selectedDay.isHoliday
              ? language === 'telugu'
                ? 'కాలేజీ మూసివేయబడింది. నిర్వహణపై దృష్టి పెట్టండి'
                : 'College closed. Focus on maintenance'
              : language === 'telugu'
                ? 'సాధారణ రోజు - సాధారణ సిబ్బంది మరియు స్టాక్'
                : 'Normal day - regular staff and stock'}
          </div>
        </div>
      </div>
    )
  }

  // Manual refresh - fetch fresh data from backend
  const handleRefresh = async () => {
    console.log('🔄 Manual refresh triggered - fetching fresh data from backend')
    await fetchOrdersData({ showSpinner: true })
  }
  
  // Show Coming Soon banner if feature is disabled
  if (!FEATURE_ENABLED) {
    return (
      <div className="home-dashboard">
        <div className="card coming-soon-card">
          <div className="coming-soon-content">
            <div className="coming-soon-icon">🤖</div>
            <h1 className="coming-soon-title">AI Predictions</h1>
            <p className="coming-soon-description">
              Get intelligent insights and predictions about your canteen operations powered by advanced AI algorithms.
            </p>
            
            <div className="coming-soon-status">
              <div className="status-indicator">
                <span style={{ marginRight: '8px' }}>🚧</span>
                Coming Soon
              </div>
            </div>

            <div className="features-preview">
              <h3 className="features-title">Planned Features:</h3>
              <div className="features-list">
                <div className="feature-item">
                  <span>📈</span>
                  <span>Order volume predictions for tomorrow and next week</span>
                </div>
                <div className="feature-item">
                  <span>💰</span>
                  <span>Revenue forecasting based on historical data</span>
                </div>
                <div className="feature-item">
                  <span>🔥</span>
                  <span>Popular items analysis and recommendations</span>
                </div>
                <div className="feature-item">
                  <span>⏰</span>
                  <span>Peak hours identification for better staffing</span>
                </div>
                <div className="feature-item">
                  <span>📊</span>
                  <span>Trend analysis with seasonal adjustments</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* Header with refresh controls */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0 }}>🤖 AI Predictions & Analytics - Hyderabad</h2>
            <p style={{ margin: '8px 0 0 0', color: '#666', fontSize: '14px' }}>
              {lastUpdated ? `Last updated: ${lastUpdated.toLocaleString()}` : 'No data loaded yet'}
            </p>
            {predictions && (
              <div style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#059669' }}>
                📅 {predictions.teluguDate.day}, {predictions.teluguDate.month} {predictions.teluguDate.year}
                {predictions.festival && ` • 🎉 ${predictions.festival}`}
                {predictions.currentSeason && ` • 🌤️ ${predictions.currentSeason} season`}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '14px' }}>Language:</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="english">English</option>
                <option value="telugu">తెలుగు</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '14px' }}>Period:</label>
              <select
                value={predictionPeriod}
                onChange={(e) => setPredictionPeriod(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="tomorrow">Tomorrow</option>
                <option value="day_after">Day After</option>
                <option value="week">Weekly</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh (1hr)
            </label>
            <button
              className="btn"
              onClick={handleRefresh}
              disabled={isLoading}
              style={{ minWidth: '100px' }}
            >
              {isLoading ? 'Loading...' : 'Refresh Now'}
            </button>
          </div>
        </div>
      </Card>

      {isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: '18px', marginBottom: '8px' }}>🤖</div>
            <div>Loading AI predictions...</div>
          </div>
        </Card>
      )}

      {predictions && (
        <>
          {/* Summary Statistics */}
          <Card title="📊 Hyderabad Food Analytics & Predictions">
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '16px' 
            }}>
              <div style={{ 
                backgroundColor: '#f0f9ff', 
                padding: '16px', 
                borderRadius: '8px', 
                border: '1px solid #0ea5e9' 
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0369a1' }}>
                  {predictions.summary.todayOrders}
          </div>
                <div style={{ fontSize: '14px', color: '#0369a1' }}>
                  {language === 'telugu' ? 'ఈరోజు ఆర్డర్లు' : 'Orders Today'}
          </div>
          </div>
              
              <div style={{ 
                backgroundColor: '#f0fdf4', 
                padding: '16px', 
                borderRadius: '8px', 
                border: '1px solid #22c55e' 
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#15803d' }}>
                  {predictionPeriod === 'tomorrow' ? predictions.summary.predictedTomorrow :
                   predictionPeriod === 'day_after' ? predictions.summary.predictedDayAfter :
                   predictions.summary.weeklyAverage}
                </div>
                <div style={{ fontSize: '14px', color: '#15803d' }}>
                  {language === 'telugu' ? 
                    (predictionPeriod === 'tomorrow' ? 'రేపటి అంచనా' :
                     predictionPeriod === 'day_after' ? 'మరుసటి రోజు అంచనా' :
                     'వారపు సగటు') :
                    (predictionPeriod === 'tomorrow' ? 'Predicted Tomorrow' :
                     predictionPeriod === 'day_after' ? 'Day After Tomorrow' :
                     'Weekly Average')}
                </div>
          </div>

              <div style={{ 
                backgroundColor: '#fef3c7', 
                padding: '16px', 
                borderRadius: '8px', 
                border: '1px solid #f59e0b' 
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>
                  ₹{predictionPeriod === 'tomorrow' ? predictions.summary.predictedRevenue :
                     predictionPeriod === 'day_after' ? predictions.summary.predictedRevenueDayAfter :
                     predictions.summary.predictedWeeklyRevenue}
                </div>
                <div style={{ fontSize: '14px', color: '#d97706' }}>
                  {language === 'telugu' ? 
                    (predictionPeriod === 'tomorrow' ? 'రేపటి ఆదాయం' :
                     predictionPeriod === 'day_after' ? 'మరుసటి రోజు ఆదాయం' :
                     'వారపు ఆదాయం') :
                    (predictionPeriod === 'tomorrow' ? 'Predicted Revenue' :
                     predictionPeriod === 'day_after' ? 'Day After Revenue' :
                     'Weekly Revenue')}
                </div>
              </div>
              
              <div style={{ 
                backgroundColor: '#f3e8ff', 
                padding: '16px', 
                borderRadius: '8px', 
                border: '1px solid #a855f7' 
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7c3aed' }}>
                  {predictions.summary.weekAverage}
                </div>
                <div style={{ fontSize: '14px', color: '#7c3aed' }}>
                  {language === 'telugu' ? 'వారపు సగటు' : 'Weekly Average'}
                </div>
              </div>
        </div>
      </Card>

          {/* Popular Items */}
          <Card title="🔥 Most Popular Items">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Total Orders</th>
                  <th>Avg Price</th>
                  <th>Total Revenue</th>
                  <th>Last Ordered</th>
                </tr>
              </thead>
              <tbody>
                {predictions.popularItems.map(([itemName, stats], index) => (
                  <tr key={itemName}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                          backgroundColor: index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : '#cd7c2f',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          #{index + 1}
                        </span>
                        {itemName}
                      </div>
                    </td>
                    <td>{stats.totalOrders}</td>
                    <td>₹{Math.round(stats.avgPrice)}</td>
                    <td>₹{Math.round(stats.totalRevenue)}</td>
                    <td>{stats.lastOrdered ? new Date(stats.lastOrdered).toLocaleDateString() : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Functional Calendar Widget */}
          <Card title="📅 Calendar View">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Calendar Widget */}
              <div style={{
                backgroundColor: '#1f2937',
                borderRadius: '12px',
                padding: '16px',
                color: 'white',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                {/* Calendar Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid #374151'
                }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
                      {selectedDate.toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        day: 'numeric', 
                        month: 'long' 
                      })}
                    </div>
                    {language === 'telugu' && (
                      <div style={{ fontSize: '14px', color: '#9ca3af', marginTop: '2px' }}>
                        {teluguDays[selectedDate.getDay()]}
                      </div>
                    )}
                  </div>
                  <div style={{ 
                    width: '24px', 
                    height: '24px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    backgroundColor: '#374151'
                  }}>
                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>▼</span>
                  </div>
                </div>

                {/* Month/Year Selector */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'white' }}>
                    {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => navigateMonth('prev')}
                      style={{
                        width: '24px',
                        height: '24px',
                        border: 'none',
                        backgroundColor: '#374151',
                        color: '#9ca3af',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ▲
                    </button>
                    <button 
                      onClick={() => navigateMonth('next')}
                      style={{
                        width: '24px',
                        height: '24px',
                        border: 'none',
                        backgroundColor: '#374151',
                        color: '#9ca3af',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ▼
                    </button>
                  </div>
                </div>

                {/* Day Headers */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '2px',
                  marginBottom: '8px'
                }}>
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                    <div key={day} style={{
                      padding: '8px 4px',
                      textAlign: 'center',
                      fontSize: '12px',
                      color: '#9ca3af',
                      fontWeight: '500'
                    }}>
                      {language === 'telugu' ? 
                        (day === 'Su' ? 'ఆ' : day === 'Mo' ? 'సో' : day === 'Tu' ? 'మం' : 
                         day === 'We' ? 'బు' : day === 'Th' ? 'గు' : day === 'Fr' ? 'శు' : 'శ') :
                        day
                      }
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '2px'
                }}>
                  {(() => {
                    const targetMonth = currentMonth.getMonth()
                    const targetYear = currentMonth.getFullYear()
                    const firstDay = new Date(targetYear, targetMonth, 1)
                    const startDate = new Date(firstDay)
                    startDate.setDate(startDate.getDate() - firstDay.getDay())
                    
                    const calendarDays = []
                    for (let i = 0; i < 42; i++) {
                      const date = new Date(startDate)
                      date.setDate(startDate.getDate() + i)
                      calendarDays.push(date)
                    }

                    // Generate monthly predictions for the current month
                    const monthlyPredictions = predictions ? 
                      generateMonthlyPredictions(ordersData, foodItems, currentMonth) : []

                    return calendarDays.map((date, index) => {
                      const isCurrentMonth = date.getMonth() === targetMonth
                      const isToday = date.toDateString() === new Date().toDateString()
                      const isSelected = date.toDateString() === selectedDate.toDateString()
                      
                      // Find prediction for this date
                      const prediction = monthlyPredictions.find(day => 
                        day.date.toDateString() === date.toDateString()
                      )
                      
                      const isHoliday = date.getDay() === 0 // Sunday
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6
                      const festival = getFestivalInfo(date)

                      return (
                        <div
                          key={index}
                          onClick={() => setSelectedDate(date)}
                          style={{
                            padding: '8px 4px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            borderRadius: '6px',
                            backgroundColor: isSelected ? '#3b82f6' : 
                                           isToday ? '#f59e0b' : 
                                           isHoliday ? '#ef4444' : 
                                           isWeekend ? '#8b5cf6' : 
                                           festival ? '#f97316' : 'transparent',
                            color: isSelected ? 'white' : 
                                   isCurrentMonth ? 'white' : '#6b7280',
                            fontSize: '14px',
                            fontWeight: isToday ? 'bold' : 'normal',
                            transition: 'all 0.2s ease',
                            position: 'relative'
                          }}
                        >
                          <div style={{ marginBottom: '2px' }}>
                            {date.getDate()}
                          </div>
                          {prediction && (
                            <div style={{
                              fontSize: '10px',
                              fontWeight: 'bold',
                              color: isSelected ? 'white' : 
                                     isHoliday ? '#fca5a5' : 
                                     isWeekend ? '#c4b5fd' : 
                                     festival ? '#fed7aa' : '#10b981'
                            }}>
                              {prediction.predicted}
                            </div>
                          )}
                          {festival && (
                            <div style={{
                              position: 'absolute',
                              top: '2px',
                              right: '2px',
                              width: '6px',
                              height: '6px',
                              backgroundColor: '#f59e0b',
                              borderRadius: '50%'
                            }}></div>
                          )}
                          {isWeekend && !isHoliday && (
                            <div style={{
                              position: 'absolute',
                              top: '2px',
                              left: '2px',
                              width: '6px',
                              height: '6px',
                              backgroundColor: '#8b5cf6',
                              borderRadius: '50%'
                            }}></div>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>

                {/* Calendar Legend */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  flexWrap: 'wrap',
                  fontSize: '10px',
                  marginTop: '12px',
                  padding: '8px',
                  backgroundColor: '#374151',
                  borderRadius: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', backgroundColor: '#f59e0b', borderRadius: '50%' }}></div>
                    <span style={{ color: '#9ca3af' }}>Festival</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', backgroundColor: '#8b5cf6', borderRadius: '50%' }}></div>
                    <span style={{ color: '#9ca3af' }}>Saturday (Less Non-veg)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', backgroundColor: '#ef4444', borderRadius: '50%' }}></div>
                    <span style={{ color: '#9ca3af' }}>Sunday (Holiday)</span>
                  </div>
                </div>

                {/* Calendar Controls */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '16px',
                  paddingTop: '12px',
                  borderTop: '1px solid #374151'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button style={{
                      width: '20px',
                      height: '20px',
                      border: 'none',
                      backgroundColor: '#374151',
                      color: '#9ca3af',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      −
                    </button>
                    <span style={{ fontSize: '14px', color: 'white' }}>
                      {(() => {
                        const selectedDay = predictions.weeklyPredictions.find(day => 
                          day.date.toDateString() === selectedDate.toDateString()
                        )
                        return selectedDay ? `${selectedDay.predicted} orders` : '0 orders'
                      })()}
                    </span>
                    <button style={{
                      width: '20px',
                      height: '20px',
                      border: 'none',
                      backgroundColor: '#374151',
                      color: '#9ca3af',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      +
                    </button>
                  </div>
                  <button style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    backgroundColor: '#374151',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}>
                    <span>▶</span>
                    {language === 'telugu' ? 'ఫోకస్' : 'Focus'}
                  </button>
                </div>
              </div>
              
              {/* Selected Day Details */}
              <div>{renderSelectedDayDetails()}</div>
            </div>
          </Card>
          {/* Weekly Predictions List */}
          <Card title="📋 Weekly Predictions List">
            <div style={{ display: 'grid', gap: '12px' }}>
              {predictions.weeklyPredictions.map((day, index) => (
                <div key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: day.isHoliday ? '#fef2f2' : day.isWeekend ? '#f0f9ff' : '#f9fafb',
                  border: `1px solid ${day.isHoliday ? '#fca5a5' : day.isWeekend ? '#0ea5e9' : '#e5e7eb'}`,
                  borderRadius: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: day.isHoliday ? '#dc2626' : day.isWeekend ? '#0ea5e9' : '#6b7280',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}>
                      {day.date.getDate()}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px' }}>
                        {language === 'telugu' ? day.day : day.date.toLocaleDateString('en-US', { weekday: 'long' })}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {day.festival && ` • 🕉️ ${day.festival.name} (Non-veg -${Math.round(day.festival.reduction * 100)}%)`}
                        {day.isHoliday && ` • 🏫 College Holiday`}
                        {day.isWeekend && !day.isHoliday && ` • 🏖️ Weekend`}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: day.isHoliday ? '#dc2626' : day.isWeekend ? '#0ea5e9' : '#374151' }}>
                      {day.predicted}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {language === 'telugu' ? 'అంచనా' : 'Predicted'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Peak Hours */}
          <Card title="⏰ Peak Ordering Hours">
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {predictions.peakHours.map((hour, index) => (
                <div key={hour} style={{
                  backgroundColor: index === 0 ? '#fef2f2' : index === 1 ? '#fef3c7' : '#f0fdf4',
                  border: `1px solid ${index === 0 ? '#fca5a5' : index === 1 ? '#fde047' : '#bbf7d0'}`,
                  padding: '12px 16px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  minWidth: '80px'
                }}>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: 'bold',
                    color: index === 0 ? '#dc2626' : index === 1 ? '#d97706' : '#16a34a'
                  }}>
                    {hour}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {index === 0 ? 'Peak' : index === 1 ? 'High' : 'Medium'}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {/* AI Recommendations */}
          <Card title="🤖 AI Recommendations">
            {predictions.recommendations.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '20px', 
                color: '#666',
                backgroundColor: '#f9fafb',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>✅</div>
                <div>All systems running smoothly! No urgent recommendations.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {['high', 'medium', 'low'].map(priority => {
                  const priorityRecommendations = predictions.recommendations
                    .filter(rec => rec.priority === priority)
                    .sort((a, b) => {
                      // Within same priority, sort by type for consistency
                      const typeOrder = { 'low_stock': 0, 'popular_item': 1, 'peak_hours': 2 }
                      return typeOrder[a.type] - typeOrder[b.type]
                    })
                  
                  if (priorityRecommendations.length === 0) return null
                  
                  return (
                    <div key={priority}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        marginBottom: '12px',
                        padding: '8px 12px',
                        backgroundColor: priority === 'high' ? '#fef2f2' : 
                                       priority === 'medium' ? '#fefce8' : '#f0fdf4',
                        borderRadius: '6px',
                        border: `1px solid ${priority === 'high' ? '#fca5a5' : 
                                               priority === 'medium' ? '#fde047' : '#bbf7d0'}`
                      }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: priority === 'high' ? '#dc2626' : 
                                         priority === 'medium' ? '#d97706' : '#16a34a',
                          color: 'white'
                        }}>
                          {priority.toUpperCase()}
                        </span>
                        <span style={{ 
                          fontWeight: '600',
                          color: priority === 'high' ? '#dc2626' : 
                                 priority === 'medium' ? '#d97706' : '#16a34a'
                        }}>
                          {priority === 'high' ? '🚨 High Priority Alerts' :
                           priority === 'medium' ? '⚠️ Medium Priority Alerts' :
                           'ℹ️ Low Priority Alerts'}
                        </span>
                        <span style={{ 
                          fontSize: '12px', 
                          color: '#666',
                          marginLeft: 'auto'
                        }}>
                          {priorityRecommendations.length} alert{priorityRecommendations.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      <div style={{ display: 'grid', gap: '12px' }}>
                        {priorityRecommendations.map((rec, index) => (
                          <div key={index} style={{
                            padding: '16px',
                            borderRadius: '8px',
                            border: `1px solid ${
                              rec.priority === 'high' ? '#fca5a5' : 
                              rec.priority === 'medium' ? '#fde047' : '#bbf7d0'
                            }`,
                            backgroundColor: rec.priority === 'high' ? '#fef2f2' : 
                                           rec.priority === 'medium' ? '#fefce8' : '#f0fdf4'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                backgroundColor: rec.priority === 'high' ? '#dc2626' : 
                                               rec.priority === 'medium' ? '#d97706' : '#16a34a',
                                color: 'white'
                              }}>
                                {rec.priority.toUpperCase()}
                              </span>
                              <span style={{ fontWeight: '600' }}>
                                {rec.type === 'low_stock' ? '📦 Stock Alert' :
                                 rec.type === 'popular_item' ? '🔥 Popular Item' :
                                 rec.type === 'peak_hours' ? '⏰ Peak Hours' : '💡 Suggestion'}
                              </span>
                            </div>
                            <div style={{ marginBottom: '8px' }}>{rec.message}</div>
                            <div style={{ 
                              fontSize: '14px', 
                              fontWeight: '600',
                              color: rec.priority === 'high' ? '#dc2626' : 
                                     rec.priority === 'medium' ? '#d97706' : '#16a34a'
                            }}>
                              💡 {rec.action}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {!predictions && !isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
            <h3 style={{ margin: '0 0 8px 0' }}>AI Predictions Ready</h3>
            <p style={{ margin: '0 0 16px 0', color: '#666' }}>
              Click "Refresh Now" to load the latest data and generate predictions
            </p>
            <button className="btn" onClick={handleRefresh}>
              Load Predictions
            </button>
          </div>
        </Card>
      )}
    </div>
  )

}

function SettingsPage() {
  const { signOut } = useAuth()

  return (
    <div className="home-dashboard">
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Account</h2>
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            className="btn btn-danger"
            onClick={async () => {
              try {
                await signOut()
              } catch (error) {
                console.error('Error signing out:', error)
              }
            }}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 'auto',
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}


function ScanOrderPage({ onScan, scanMessage, lastScannedCode, isProcessing }) {
  const [manualCode, setManualCode] = useState('')
  const [recentCodes, setRecentCodes] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!lastScannedCode) return
    setRecentCodes((prev) => {
      const next = [lastScannedCode, ...prev.filter((code) => code !== lastScannedCode)]
      return next.slice(0, 6)
    })
  }, [lastScannedCode])

  const handleSubmit = (event) => {
    event.preventDefault()
    const value = manualCode.trim()
    if (!value) return
    onScan?.(value)
    setManualCode('')
  }

  return (
    <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#111827' }}>Scan Orders</h2>
          <p style={{ margin: 0, fontSize: '15px', color: '#4b5563', lineHeight: 1.5 }}>
            Connect your 2D barcode scanner. Each scan searches for the order token and opens the order panel on the right for quick fulfilment.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.15)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>Manual entry</h3>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#6b7280', lineHeight: 1.6 }}>
                If the scanner is unavailable, type or paste an order token and press enter to locate the order.
              </p>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                ref={inputRef}
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Scan or enter order token"
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(event) => (event.currentTarget.style.borderColor = '#2563eb')}
                onBlur={(event) => (event.currentTarget.style.borderColor = '#d1d5db')}
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={!manualCode.trim() || isProcessing}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: !manualCode.trim() || isProcessing ? '#bfdbfe' : '#2563eb',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: !manualCode.trim() || isProcessing ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s ease',
                  }}
                >
                  {isProcessing ? 'Searching…' : 'Search order'}
                </button>
                <button
                  type="button"
                  onClick={() => setManualCode('')}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
                    color: '#374151',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              </div>
            </form>
            <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
              <strong style={{ color: '#111827' }}>Tip:</strong> Keep the input focused so the scanner can type directly if needed. The right-hand panel confirms successful scans.
            </div>
          </div>

          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.15)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>Recent scans</h3>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#6b7280' }}>
                Quick reference for the last few barcodes processed on this device.
              </p>
            </div>
            {recentCodes.length === 0 ? (
              <div style={{
                padding: '24px',
                borderRadius: '12px',
                border: '1px dashed #d1d5db',
                color: '#6b7280',
                textAlign: 'center',
                fontSize: '14px',
              }}>
                Scan a barcode to populate this list.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {recentCodes.map((code) => (
                  <div
                    key={code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#f9fafb',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                    }}
                  >
                    <span>{code}</span>
                    <button
                      type="button"
                      onClick={() => onScan?.(code)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: '#22c55e',
                        color: '#ffffff',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Rescan
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              Last scan: {lastScannedCode || '—'}
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#ecfdf5',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <strong style={{ color: '#047857' }}>How it works</strong>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#0f172a', fontSize: '14px', lineHeight: 1.7 }}>
            <li>Plug in a 2D barcode scanner configured in keyboard mode.</li>
            <li>Keep the scanner aimed at order barcodes. Each scan types the token automatically.</li>
            <li>The right-side order panel pops open for status updates when a match is found.</li>
          </ul>
          {scanMessage && (
            <div
              style={{
                marginTop: '8px',
                padding: '10px 14px',
                borderRadius: '12px',
                backgroundColor: scanMessage.includes('✅') ? '#d1fae5' : '#fee2e2',
                color: scanMessage.includes('✅') ? '#065f46' : '#991b1b',
                fontSize: '13px',
                fontWeight: 600,
                alignSelf: 'flex-start',
              }}
            >
              {scanMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
function OrderNotificationPopup() {
  const { popupNotification, closePopupNotification } = useNotification()

  if (!popupNotification) return null

  const isCancellation = popupNotification.type === 'order_cancelled'
  const isAvailabilityChange = popupNotification.type === 'availability_change'
  const isError = popupNotification.type === 'error'
  
  let colorScheme
  if (isError) {
    colorScheme = {
      border: 'border-red-200 dark:border-red-700',
      borderLeft: '#ef4444',
      shadow: 'rgba(239, 68, 68, 0.1)',
      bgHeader: 'bg-red-50 dark:bg-red-900/20',
      bgIcon: 'bg-red-500',
      textTitle: 'text-red-800 dark:text-red-200',
      textTime: 'text-red-600 dark:text-red-300',
      textBtn: 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200',
      bgProgress: 'bg-red-200 dark:bg-red-800',
      progress: 'bg-red-500'
    }
  } else if (isAvailabilityChange) {
    colorScheme = {
      border: 'border-blue-200 dark:border-blue-700',
      borderLeft: '#3b82f6',
      shadow: 'rgba(59, 130, 246, 0.1)',
      bgHeader: 'bg-blue-50 dark:bg-blue-900/20',
      bgIcon: 'bg-blue-500',
      textTitle: 'text-blue-800 dark:text-blue-200',
      textTime: 'text-blue-600 dark:text-blue-300',
      textBtn: 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200',
      bgProgress: 'bg-blue-200 dark:bg-blue-800',
      progress: 'bg-blue-500'
    }
  } else if (isCancellation) {
    colorScheme = {
      border: 'border-red-200 dark:border-red-700',
      borderLeft: '#ef4444',
      shadow: 'rgba(239, 68, 68, 0.1)',
      bgHeader: 'bg-red-50 dark:bg-red-900/20',
      bgIcon: 'bg-red-500',
      textTitle: 'text-red-800 dark:text-red-200',
      textTime: 'text-red-600 dark:text-red-300',
      textBtn: 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200',
      bgProgress: 'bg-red-200 dark:bg-red-800',
      progress: 'bg-red-500'
    }
  } else {
    colorScheme = {
      border: 'border-green-200 dark:border-green-700',
      borderLeft: '#10b981',
      shadow: 'rgba(16, 185, 129, 0.1)',
      bgHeader: 'bg-green-50 dark:bg-green-900/20',
      bgIcon: 'bg-green-500',
      textTitle: 'text-green-800 dark:text-green-200',
      textTime: 'text-green-600 dark:text-green-300',
      textBtn: 'text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200',
      bgProgress: 'bg-green-200 dark:bg-green-800',
      progress: 'bg-green-500'
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed top-4 right-4 z-50 max-w-sm w-full"
        initial={{ opacity: 0, x: 300, scale: 0.8 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 300, scale: 0.8 }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 25,
          duration: 0.3 
        }}
      >
        <div 
          className={`bg-white dark:bg-gray-800 border ${colorScheme.border} rounded-lg shadow-lg overflow-hidden`}
          style={{
            borderLeft: `4px solid ${colorScheme.borderLeft}`,
            boxShadow: `0 10px 25px rgba(0, 0, 0, 0.1), 0 0 0 1px ${colorScheme.shadow}`
          }}
        >
          {/* Header */}
          <div className={`flex items-center justify-between p-4 ${colorScheme.bgHeader}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 ${colorScheme.bgIcon} rounded-full flex items-center justify-center`}>
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className={`font-semibold ${colorScheme.textTitle} text-sm`}>
                  {popupNotification.title}
                </h4>
                <p className={`text-xs ${colorScheme.textTime}`}>
                  {new Date(popupNotification.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
            <button
              onClick={closePopupNotification}
              className={`${colorScheme.textBtn} transition-colors`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
              {popupNotification.message}
            </p>
            
            {popupNotification.orderData && !isCancellation && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {popupNotification.orderData.total_amount && (
                    <div className="flex justify-between">
                      <span>Amount:</span>
                      <span className="font-medium">₹{popupNotification.orderData.total_amount}</span>
                    </div>
                  )}
                  {popupNotification.orderData.order_type && popupNotification.orderData.order_type !== 'cancelled' && (
                    <div className="flex justify-between">
                      <span>Type:</span>
                      <span className="font-medium capitalize">{popupNotification.orderData.order_type}</span>
                    </div>
                  )}
                  {popupNotification.orderData.user_id && (
                    <div className="flex justify-between">
                      <span>Placed by:</span>
                      <span className="font-medium capitalize">
                        {popupNotification.orderData.user_id === APP_USER_ID ? 'App' : 'Counter'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className={`h-1 ${colorScheme.bgProgress}`}>
            <motion.div
              className={`h-full ${colorScheme.progress}`}
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 5, ease: "linear" }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}