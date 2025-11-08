# QR Code Fetcher Utility

This utility provides functions to fetch encrypted QR codes from the Supabase orders table.

## Available Functions

### `fetchEncryptedQRCodes(filters)`
Fetches encrypted QR codes with optional filters.

**Parameters:**
- `filters` (Object, optional): Filter options
  - `status` (string): Filter by order status ('PENDING', 'PREPARING', 'READY', 'DELIVERED')
  - `user_id` (string): Filter by user ID
  - `order_type` (string): Filter by order type ('dine-in', 'takeaway')
  - `date_from` (string): Filter orders from this date (ISO string)
  - `date_to` (string): Filter orders to this date (ISO string)
  - `limit` (number): Limit number of results

**Returns:**
```javascript
{
  success: boolean,
  data: Array, // Array of order objects with QR codes
  count: number,
  error?: string
}
```

**Example:**
```javascript
import { fetchEncryptedQRCodes } from '../utils/qrCodeFetcher'

// Fetch all QR codes
const result = await fetchEncryptedQRCodes()

// Fetch pending orders only
const pending = await fetchEncryptedQRCodes({ status: 'PENDING', limit: 10 })

// Fetch orders from last 7 days
const recent = await fetchEncryptedQRCodes({ 
  date_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  limit: 20 
})
```

### `fetchEncryptedQRCodeById(orderId)`
Fetches a specific encrypted QR code by order ID.

**Parameters:**
- `orderId` (string): The order ID to fetch

**Returns:**
```javascript
{
  success: boolean,
  data: Object | null, // Order object with QR code
  error?: string
}
```

**Example:**
```javascript
import { fetchEncryptedQRCodeById } from '../utils/qrCodeFetcher'

const result = await fetchEncryptedQRCodeById('order-123')
if (result.success) {
  console.log('QR Code:', result.data.qr_code)
}
```

### `fetchEncryptedQRCodeByValue(qrCodeValue)`
Fetches an order by its QR code value.

**Parameters:**
- `qrCodeValue` (string): The QR code value to search for

**Returns:**
```javascript
{
  success: boolean,
  data: Object | null, // Order object with QR code
  error?: string
}
```

**Example:**
```javascript
import { fetchEncryptedQRCodeByValue } from '../utils/qrCodeFetcher'

const result = await fetchEncryptedQRCodeByValue('1234567890123456')
if (result.success) {
  console.log('Order found:', result.data)
}
```

### `fetchRecentEncryptedQRCodes(days, limit)`
Fetches recent encrypted QR codes from the last N days.

**Parameters:**
- `days` (number, optional): Number of days to look back (default: 7)
- `limit` (number, optional): Maximum number of results (default: 10)

**Example:**
```javascript
import { fetchRecentEncryptedQRCodes } from '../utils/qrCodeFetcher'

// Last 3 days, max 5 results
const recent = await fetchRecentEncryptedQRCodes(3, 5)
```

### `fetchEncryptedQRCodesByStatus(status, limit)`
Fetches encrypted QR codes by order status.

**Parameters:**
- `status` (string): Order status to filter by
- `limit` (number, optional): Maximum number of results (default: 50)

**Example:**
```javascript
import { fetchEncryptedQRCodesByStatus } from '../utils/qrCodeFetcher'

const readyOrders = await fetchEncryptedQRCodesByStatus('READY', 20)
```

### `getQRCodeStatistics()`
Gets statistics about QR codes in the system.

**Returns:**
```javascript
{
  success: boolean,
  data: {
    total: number,
    byStatus: Object, // { 'PENDING': 5, 'READY': 10, ... }
    hasQRCode: number,
    withoutQRCode: number
  },
  error?: string
}
```

**Example:**
```javascript
import { getQRCodeStatistics } from '../utils/qrCodeFetcher'

const stats = await getQRCodeStatistics()
if (stats.success) {
  console.log('Total orders with QR codes:', stats.data.total)
  console.log('Orders by status:', stats.data.byStatus)
}
```

## React Component Usage

A complete React component `QRCodeManager` is available in `src/components/QRCodeManager.jsx` that demonstrates how to use all these functions with a user interface.

**To use the component:**
```javascript
import QRCodeManager from '../components/QRCodeManager'

function App() {
  return (
    <div>
      <QRCodeManager />
    </div>
  )
}
```

## Data Structure

Each order object returned contains:
```javascript
{
  id: string,           // Order ID
  qr_code: string,      // Encrypted QR code (16-digit numeric)
  order_token: string,  // 4-digit order token
  item_name: string,    // Name of the food item
  status: string,       // Order status
  created_at: string,   // ISO timestamp
  total_amount: number, // Order total amount
  user_id: string,      // User who placed the order
  order_type: string    // 'dine-in' or 'takeaway'
}
```

## Error Handling

All functions return a consistent response structure with `success`, `data`, and optional `error` fields. Always check the `success` field before using the data:

```javascript
const result = await fetchEncryptedQRCodes()
if (result.success) {
  // Use result.data
  console.log('QR codes:', result.data)
} else {
  // Handle error
  console.error('Error:', result.error)
}
```

## Notes

- QR codes are stored as encrypted 16-digit numeric strings in the database
- All functions use the existing Supabase client configuration
- Functions include proper error handling and logging
- The utility is designed to work with the existing canteen management system

