-- SAFE: Copy order_id column from order_items table to orders table
-- This script checks column existence before using them to avoid errors

-- Step 1: Add order_id column to orders table if it doesn't exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_id TEXT;

-- Step 2: Create a function to safely copy order_id values
CREATE OR REPLACE FUNCTION copy_order_id_safely()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER := 0;
    col_exists BOOLEAN;
    order_item RECORD;
    order_record RECORD;
BEGIN
    -- Check if order_items table has order_id column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'order_id'
    ) INTO col_exists;
    
    IF NOT col_exists THEN
        RAISE NOTICE 'order_id column does not exist in order_items table';
        RETURN 0;
    END IF;
    
    -- Loop through each order and try to find matching order_id
    FOR order_record IN SELECT * FROM public.orders WHERE order_id IS NULL LOOP
        -- Try to find matching order_id from order_items
        SELECT oi.order_id INTO order_item.order_id
        FROM public.order_items oi
        WHERE oi.order_id IS NOT NULL
        LIMIT 1;
        
        -- If found, update the order
        IF order_item.order_id IS NOT NULL THEN
            UPDATE public.orders 
            SET order_id = order_item.order_id
            WHERE id = order_record.id;
            
            updated_count := updated_count + 1;
        END IF;
    END LOOP;
    
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Execute the safe copy function
SELECT copy_order_id_safely() as orders_updated;

-- Step 4: Create index on order_id for better performance
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders (order_id);

-- Step 5: Show the results
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

-- Step 6: Clean up the function
DROP FUNCTION IF EXISTS copy_order_id_safely();




