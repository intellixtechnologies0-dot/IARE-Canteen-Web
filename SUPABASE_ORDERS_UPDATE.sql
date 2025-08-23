-- Update Orders Table Structure for Item Names
-- Run these commands in your Supabase SQL Editor

-- 0. First, let's check what columns exist in the orders table
-- Run this first to see the current structure:
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 1. Add item_name column to existing orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS item_name TEXT;

-- 2. Update existing orders with item names (if you have existing data)
-- This assumes you have some kind of description column - adjust based on your actual column names
-- If you have a different column name, replace 'description' with your actual column name
UPDATE public.orders 
SET item_name = CASE 
  WHEN description ILIKE '%biryani%' THEN 'Veg Biryani'
  WHEN description ILIKE '%dosa%' THEN 'Masala Dosa'
  WHEN description ILIKE '%samosa%' THEN 'Samosa'
  WHEN description ILIKE '%rice%' THEN 'Rice'
  WHEN description ILIKE '%curry%' THEN 'Curry'
  ELSE COALESCE(description, 'Unknown Item') -- fallback to description or 'Unknown Item'
END
WHERE item_name IS NULL;

-- Alternative: If you don't have a description column, set default item names
-- UPDATE public.orders SET item_name = 'Food Item' WHERE item_name IS NULL;

-- 3. Make item_name NOT NULL for future orders (only after you have data)
-- ALTER TABLE public.orders ALTER COLUMN item_name SET NOT NULL;

-- 4. Update the RPC function to handle item_name
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id TEXT, p_new_status TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    UPDATE public.orders 
    SET status = p_new_status,
        delivered_at = CASE WHEN UPPER(p_new_status) = 'DELIVERED' THEN NOW() ELSE delivered_at END
    WHERE id = p_order_id;
END;
$$;

-- 5. Sample data with item names (optional - for testing)
INSERT INTO public.orders (id, item_name, total, status) VALUES
('#1001', 'Veg Biryani', 180, 'PENDING'),
('#1002', 'Samosa', 40, 'PENDING'),
('#1003', 'Masala Dosa', 80, 'PREPARING')
ON CONFLICT (id) DO NOTHING;

-- 6. Create index for better performance
CREATE INDEX IF NOT EXISTS idx_orders_item_name ON public.orders(item_name);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- 7. Show the final table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;
