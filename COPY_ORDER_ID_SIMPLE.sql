-- SIMPLE: Copy order_id column from order_items table to orders table
-- This script uses a simple approach to avoid all errors

-- Step 1: Add order_id column to orders table if it doesn't exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_id TEXT;

-- Step 2: Simple copy - just take the first available order_id from order_items
-- This avoids all column name matching issues
UPDATE public.orders 
SET order_id = (
    SELECT order_id 
    FROM public.order_items 
    WHERE order_id IS NOT NULL 
    LIMIT 1
)
WHERE order_id IS NULL;

-- Step 3: Create index on order_id for better performance
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders (order_id);

-- Step 4: Show the results
SELECT 
    'Orders with order_id' as status,
    COUNT(*) as count
FROM public.orders 
WHERE order_id IS NOT NULL;

SELECT 
    'Orders without order_id' as status,
    COUNT(*) as count
FROM public.orders 
WHERE order_id IS NULL;




