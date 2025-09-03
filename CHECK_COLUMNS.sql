-- Check what columns actually exist in order_items table
-- Run this first to see the exact column names

SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'order_items' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Also check orders table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;



