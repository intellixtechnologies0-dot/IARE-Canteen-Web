-- Copy order_id column from order_items table to orders table
-- This script adds order_id column to orders table and copies values from order_items

-- Step 1: Add order_id column to orders table if it doesn't exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_id TEXT;

-- Step 2: Copy order_id values from order_items table to orders table
-- Match items by name to link the tables
UPDATE public.orders 
SET order_id = (
    SELECT oi.order_id 
    FROM public.order_items oi 
    WHERE (oi.name = orders.item_name OR oi.item_name = orders.item_name OR oi.title = orders.item_name) 
    LIMIT 1
)
WHERE orders.order_id IS NULL 
AND EXISTS (
    SELECT 1 FROM public.order_items oi 
    WHERE (oi.name = orders.item_name OR oi.item_name = orders.item_name OR oi.title = orders.item_name)
);

-- Step 3: Create index on order_id for better performance
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders (order_id);

-- Step 4: Show the results
SELECT 
    'Orders with order_id copied' as status,
    COUNT(*) as count
FROM public.orders 
WHERE order_id IS NOT NULL;

SELECT 
    'Orders still missing order_id' as status,
    COUNT(*) as count
FROM public.orders 
WHERE order_id IS NULL;




