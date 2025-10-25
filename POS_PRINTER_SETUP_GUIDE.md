# POS Printer Setup Guide (80mm x 297mm)

## 📋 Printer Specifications

- **Width**: 80mm (3.15 inches)
- **Height**: 297mm (11.69 inches)
- **Type**: Thermal POS Printer
- **Barcode**: Code 128 format

## 🖨️ Windows Printer Configuration

### Step 1: Install Printer Driver
1. Connect your POS thermal printer to the computer
2. Install the manufacturer's driver
3. Restart computer if prompted

### Step 2: Configure Paper Size

#### Option A: Using Printer Preferences
1. Open **Control Panel** → **Devices and Printers**
2. Right-click on your POS printer → **Printing Preferences**
3. Go to **Page Setup** or **Paper** tab
4. Set paper size:
   - **Width**: 80mm (or 3.15 inches)
   - **Height**: 297mm (or 11.69 inches)
5. Click **Apply** → **OK**

#### Option B: Create Custom Paper Size
1. Open **Control Panel** → **Devices and Printers**
2. Click **Print Server Properties** at the top
3. Check **"Create a new form"**
4. Enter form name: `Receipt 80x297`
5. Set dimensions:
   - **Width**: 80mm
   - **Height**: 297mm
6. Click **Save Form**
7. Go back to your printer → **Printing Preferences**
8. Select the new custom paper size: `Receipt 80x297`

### Step 3: Additional Settings
1. **Orientation**: Portrait
2. **Margins**: 0mm (or minimal)
3. **Scale**: 100%
4. **Print Quality**: Normal or High
5. **Paper Type**: Thermal (if available)

## 🎯 How It Works

### When You Click Checkout:
1. ✅ Order created in database
2. ✅ Print preview window opens
3. ✅ Receipt rendered with barcode
4. ✅ **Auto-print dialog appears after 0.3 seconds**
5. ✅ Select your POS printer
6. ✅ Receipt prints on 80mm x 297mm thermal paper

### Print Window Features:
- **🖨️ Print Receipt button**: Manual print trigger
- **✖ Close button**: Close preview without printing
- **Auto-print**: Automatically opens print dialog
- **Reprint**: Keep window open to reprint if needed

## 📱 Receipt Layout

```
┌─────────── 80mm ───────────┐
│                            │
│    IARE CANTEEN            │ ← Header
│    Order Receipt           │
│                            │
├────────────────────────────┤
│   ╔══════════════════╗     │
│   ║   TOKEN #1234    ║     │ ← Large Token
│   ╚══════════════════╝     │
├────────────────────────────┤
│ Order ID:  abc123...       │
│ Status:    PREPARING       │ ← Order Info
│ Type:      TAKEAWAY        │
├────────────────────────────┤
│ Veg Biryani                │
│ Quantity:          2       │ ← Item Details
│ Price/Unit:    ₹80.00      │
│ Total:        ₹160.00      │
├════════════════════════════┤
│   SCAN BARCODE             │
│  ▐▌█▌▐█▌█▐▌█▌▐█            │ ← Code 128 Barcode
│  1234567890123456          │
├════════════════════════════┤
│ Thank you for your order!  │ ← Footer
│                            │
└────────────────────────────┘
     │
     │ 297mm
     ↓
```

## 🔧 Troubleshooting

### Issue: Receipt too wide or cut off
**Solution:**
```
1. Check printer paper size setting
2. Ensure it's set to exactly 80mm width
3. Try reducing margins to 0mm
4. Check "Fit to page" is disabled
```

### Issue: Receipt too short/long
**Solution:**
```
1. Verify paper height is 297mm
2. Thermal printers can handle variable height
3. The content will flow naturally
```

### Issue: Print dialog doesn't show your POS printer
**Solution:**
```
1. Check printer is turned on
2. Check USB/Network connection
3. Set POS printer as default printer
4. Restart browser and try again
```

### Issue: Barcode not printing clearly
**Solution:**
```
1. Increase barcode width (currently 2px)
2. Clean thermal print head
3. Replace thermal paper if faded
4. Increase print darkness setting
```

### Issue: Text too large/small
**Solution:**
```
1. Don't scale the print (use 100%)
2. Font sizes are optimized for 80mm
3. Check printer DPI settings
```

## 💡 Best Practices

### For Best Print Quality:
1. ✅ Use **high-quality thermal paper**
2. ✅ Keep print head **clean**
3. ✅ Set printer to **high quality** mode
4. ✅ Ensure **full paper roll** loaded
5. ✅ Check paper **alignment**

### For Barcode Scanning:
1. ✅ Print at **300 DPI or higher**
2. ✅ Ensure **high contrast** (black on white)
3. ✅ Keep barcode area **clean and flat**
4. ✅ Avoid **crumpling** the receipt
5. ✅ Test with barcode scanner after printing

## 📊 CSS Print Configuration

The receipt is configured with:
```css
@page {
  size: 80mm 297mm;
  margin: 0;
}

body {
  width: 80mm;
  height: 297mm;
  padding: 5mm 3mm;
}
```

This ensures:
- ✅ Exact 80mm x 297mm dimensions
- ✅ Minimal margins (3mm sides, 5mm top/bottom)
- ✅ Content fits perfectly on thermal paper
- ✅ No page breaks or overflow

## 🎯 Compatible POS Printers

This configuration works with:
- ✅ **Thermal Receipt Printers** (80mm)
- ✅ **ESC/POS compatible printers**
- ✅ **USB/Network/Bluetooth POS printers**

Common brands that work:
- Epson TM-T20, TM-T82, TM-T88
- Star TSP143, TSP650, TSP700
- Bixolon SRP-330, SRP-350
- Xprinter XP-80, XP-N160
- Rongta RP80, RP326

## 🚀 Quick Start

1. **Connect POS printer** to computer
2. **Configure paper size** to 80mm x 297mm
3. **Go to Place Order** panel
4. **Add items** to cart
5. **Click Checkout**
6. **Print dialog appears** automatically
7. **Select your POS printer**
8. **Click Print**
9. **Receipt prints!** 🎉

## ✅ Verification Checklist

Before using in production:

- [ ] POS printer connected and powered on
- [ ] Printer driver installed
- [ ] Paper size set to 80mm x 297mm
- [ ] Thermal paper loaded correctly
- [ ] Test print completed successfully
- [ ] Barcode scans correctly
- [ ] Receipt dimensions correct
- [ ] All information visible and clear

---

**Printer Type**: POS Thermal Printer  
**Paper Size**: 80mm x 297mm  
**Barcode Format**: Code 128  
**Status**: ✅ Configured and Ready  
**Last Updated**: October 17, 2025

