# Supabase Connection Setup for Kitchen Web App

## Overview

This setup configures your Supabase database for comprehensive order management and inventory tracking. The inventory management system uses both the `orders` table (for availability tracking) and the `order_items` table (for detailed item information including prices, descriptions, categories, stock levels, etc.) to provide complete inventory functionality.

## Step 1: Get Your Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy your:
   - **Project URL** (looks like: `https://your-project.supabase.co`)
   - **anon public key** (starts with `eyJ...`)

## Step 2: Set Environment Variables

### For Local Development:
1. Create a `.env` file in the project root
2. Add your credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_DISABLE_AUTH=true
```

### For Production (GitHub Pages):
1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Add repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Step 3: Create Required Database Tables

Run these SQL commands in your Supabase SQL Editor:

```sql
-- Create orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING',
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- Create order_items table for detailed item information
CREATE TABLE IF NOT EXISTS public.order_items (
    id SERIAL PRIMARY KEY,
    item_id TEXT,
    name TEXT NOT NULL,
    item_name TEXT,
    title TEXT,
    product_name TEXT,
    price DECIMAL(10,2),
    cost DECIMAL(10,2),
    unit_price DECIMAL(10,2),
    description TEXT,
    details TEXT,
    notes TEXT,
    category TEXT,
    type TEXT,
    group TEXT,
    image_url TEXT,
    image TEXT,
    photo TEXT,
    sku TEXT,
    code TEXT,
    barcode TEXT,
    unit TEXT,
    measurement TEXT,
    stock_quantity INTEGER DEFAULT 0,
    quantity INTEGER DEFAULT 0,
    available_quantity INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 0,
    max_stock_level INTEGER DEFAULT 0,
    max_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create food_items table for inventory management
CREATE TABLE IF NOT EXISTS public.food_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_name TEXT,
    price DECIMAL(10,2),
    cost DECIMAL(10,2),
    available_quantity INTEGER DEFAULT 0,
    in_stock BOOLEAN DEFAULT true,
    available BOOLEAN DEFAULT true,
    is_available BOOLEAN DEFAULT true,
    stock INTEGER DEFAULT 0,
    status TEXT DEFAULT 'in',
    image_url TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read orders (for testing)
CREATE POLICY anon_select_orders ON public.orders
    FOR SELECT USING (true);

-- Allow anonymous users to update order status
CREATE POLICY anon_update_orders ON public.orders
    FOR UPDATE USING (true);

-- Allow anonymous users to read order_items for inventory management
CREATE POLICY anon_select_order_items ON public.order_items
    FOR SELECT USING (true);

-- Allow anonymous users to insert and update order_items
CREATE POLICY anon_insert_order_items ON public.order_items
    FOR INSERT WITH CHECK (true);

CREATE POLICY anon_update_order_items ON public.order_items
    FOR UPDATE USING (true);

-- Allow anonymous users to read and update food_items for inventory management
CREATE POLICY anon_select_food_items ON public.food_items
    FOR SELECT USING (true);

CREATE POLICY anon_update_food_items ON public.food_items
    FOR UPDATE USING (true);

CREATE POLICY anon_insert_food_items ON public.food_items
    FOR INSERT WITH CHECK (true);

-- Create RPC function for updating order status
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id TEXT, p_new_status TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    UPDATE public.orders
    SET status = p_new_status,
        delivered_at = CASE WHEN p_new_status = 'READY' THEN NOW() ELSE delivered_at END
    WHERE id = p_order_id;
END;
$$;

-- Create RPC function for creating orders
CREATE OR REPLACE FUNCTION public.create_order(p_item_name TEXT, p_total DECIMAL, p_status TEXT, p_order_placer TEXT DEFAULT 'student')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    new_id TEXT;
BEGIN
    -- Generate a unique ID (you can customize this logic)
    new_id := 'order_' || extract(epoch from now())::text || '_' || floor(random() * 1000)::text;

    INSERT INTO public.orders (id, items, total, status, order_placer)
    VALUES (new_id, p_item_name, p_total, p_status, p_order_placer);

    RETURN new_id;
END;
$$;

-- Create RPC function for generating order IDs
CREATE OR REPLACE FUNCTION public.generate_order_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN 'order_' || extract(epoch from now())::text || '_' || floor(random() * 1000)::text;
END;
$$;

-- Add is_available column to existing orders table (if upgrading)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;

-- Update existing orders to have is_available = true (if NULL)
UPDATE public.orders SET is_available = true WHERE is_available IS NULL;

-- Grant execute permission to anonymous users
GRANT EXECUTE ON FUNCTION public.update_order_status(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.create_order(TEXT, DECIMAL, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.generate_order_id() TO anon;
```

## Step 4: Enable Realtime

1. Go to Database → Replication
2. Enable realtime for the `orders` table (inventory management uses this table)

## Step 5: Test Connection

1. Start the development server: `npm run dev`
2. Open the app and go to Settings → Debug
3. Click "Check Env Vars" to verify environment variables
4. Click "Fetch orders from Supabase" to test the connection
5. Look for the connection status indicator in the top bar

## Troubleshooting

### Connection Status Shows "Error":
- Check environment variables are set correctly
- Verify Supabase URL and anon key
- Ensure RLS policies are created
- Check browser console for detailed errors

### "No rows returned":
- Verify the `orders` table exists and has data
- Check table name is exactly `orders` in `public` schema
- Ensure column names match: `id`, `items`, `total`, `status`, `is_available`, `created_at`
- For inventory management, ensure there are orders with different item names in the `items` column

### RPC Function Errors:
- Verify `update_order_status` function exists
- Check function permissions for anonymous users
- Ensure function signature matches the app's expectations

### Inventory Management Issues:
- Verify both `orders` and `order_items` tables exist with correct schema
- Check RLS policies allow anonymous read/write on both tables
- Ensure `is_available` field is properly set in orders table for inventory management
- Check browser console for specific error messages when clicking buttons
- Verify Supabase realtime is enabled for orders table
- If using existing orders, you may need to add the `is_available` column: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;`

### Order Items Table Issues:
- Check that the `order_items` table exists with all required columns
- Verify the table has detailed item information (price, description, category, stock_quantity, etc.)
- Ensure RLS policies allow anonymous read/write access
- Check that items have proper stock levels set
- Verify item names match between `order_items` and `orders` tables for proper linking

### Orders Table Schema Issues:
- Check that the `orders` table has the `is_available` boolean column
- Verify the column allows NULL values or has a proper default
- Ensure existing orders have the `is_available` field populated
- Confirm item names in orders match item names in order_items table

### Realtime Not Working:
- Enable realtime for the `orders` table (required for inventory updates)
- Check subscription channel name matches ('public:orders')
- Verify realtime is enabled in your Supabase project settings

## Sample Data (Optional)

To test with sample data, run this in SQL Editor:

```sql
-- Sample orders data
INSERT INTO public.orders (id, items, total, status, is_available) VALUES
('#1001', 'Veg Biryani', 180, 'PENDING', true),
('#1002', 'Samosa x2', 40, 'PENDING', true),
('#1003', 'Masala Dosa', 80, 'PREPARING', true),
('#1004', 'Chicken Biryani', 220, 'PENDING', false),
('#1005', 'Paneer Tikka', 120, 'PENDING', true);

-- Sample order_items data for detailed inventory management
INSERT INTO public.order_items (name, price, description, category, unit, stock_quantity, min_stock_level) VALUES
('Veg Biryani', 180.00, 'Aromatic rice dish with vegetables and spices', 'Main Course', 'portion', 25, 5),
('Masala Dosa', 80.00, 'Crispy crepe filled with spiced potato', 'Breakfast', 'piece', 15, 3),
('Samosa', 20.00, 'Crispy pastry with spiced potato filling', 'Snacks', 'piece', 50, 10),
('Chicken Biryani', 220.00, 'Aromatic rice with tender chicken pieces', 'Main Course', 'portion', 0, 2),
('Paneer Tikka', 120.00, 'Grilled cottage cheese with spices', 'Appetizer', 'portion', 8, 2),
('Dal Khichdi', 60.00, 'Comforting lentil and rice dish', 'Main Course', 'bowl', 0, 3),
('Veg Fried Rice', 90.00, 'Wok-tossed rice with vegetables', 'Main Course', 'portion', 12, 4),
('Chicken Curry', 150.00, 'Rich and spicy chicken curry', 'Main Course', 'portion', 6, 2);

-- Sample food_items data for inventory management
INSERT INTO public.food_items (id, name, price, available_quantity, in_stock, description) VALUES
('item_001', 'Veg Biryani', 180.00, 25, true, 'Aromatic rice dish with vegetables'),
('item_002', 'Masala Dosa', 80.00, 15, true, 'Crispy crepe filled with spiced potato'),
('item_003', 'Samosa', 20.00, 50, true, 'Crispy pastry with spiced potato filling'),
('item_004', 'Chicken Biryani', 220.00, 0, false, 'Aromatic rice with tender chicken pieces'),
('item_005', 'Paneer Tikka', 120.00, 8, true, 'Grilled cottage cheese with spices'),
('item_006', 'Dal Khichdi', 60.00, 0, false, 'Comforting lentil and rice dish'),
('item_007', 'Veg Fried Rice', 90.00, 12, true, 'Wok-tossed rice with vegetables'),
('item_008', 'Chicken Curry', 150.00, 6, true, 'Rich and spicy chicken curry');
```
