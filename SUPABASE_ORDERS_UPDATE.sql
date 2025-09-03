-- IARE Canteen Orders Table Update
-- This script updates the existing orders table with missing columns and data

-- First, let's see what columns actually exist in the orders table
-- Run this to check your table structure:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'orders' AND table_schema = 'public'
-- ORDER BY ordinal_position;

-- Add missing columns to existing orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by UUID;

-- Drop item_id column if it exists (since we want order_id instead)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'item_id'
    ) THEN
        ALTER TABLE public.orders DROP COLUMN item_id;
    END IF;
END $$;

-- Create unique constraint on order_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_order_id_key'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_order_id_key UNIQUE (order_id);
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_item_name ON public.orders (item_name);
CREATE INDEX IF NOT EXISTS idx_orders_order_token ON public.orders (order_token);
CREATE INDEX IF NOT EXISTS idx_orders_is_available ON public.orders (is_available);

-- Copy order_id from order_items table to orders table
-- This will populate the order_id column in orders table from order_items table
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

-- Drop foreign key constraint if it exists (to allow sample data insertion)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_user_id_fkey' 
        AND table_name = 'orders'
    ) THEN
        ALTER TABLE public.orders DROP CONSTRAINT orders_user_id_fkey;
    END IF;
END $$;

-- Update existing orders with missing data
UPDATE public.orders 
SET 
    payment_method = COALESCE(payment_method, 'cash'),
    delivery_address = COALESCE(delivery_address, 'Counter'),
    user_id = NULL, -- Set to NULL to avoid foreign key issues
    created_by = NULL, -- Set to NULL to avoid foreign key issues
    order_token = CASE 
        WHEN order_token IS NULL OR order_token = '' THEN LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0')
        ELSE order_token
    END
WHERE order_id IS NOT NULL;

-- Insert additional sample data if table is empty or has few records
-- Using only the most basic columns that should exist
INSERT INTO public.orders (
    order_id,
    item_name, 
    total_amount, 
    order_placer, 
    status, 
    order_token, 
    is_available
) VALUES 
    ('1001', 'Chicken Noodles', 80, 'student', 'pending', '1234', TRUE),
    ('1002', 'Uttappa', 50, 'admin', 'delivered', '5678', TRUE),
    ('1003', 'Biryani', 120, 'student', 'preparing', '9012', TRUE),
    ('1004', 'Dosa', 60, 'admin', 'ready', '3456', TRUE)
ON CONFLICT (order_id) DO NOTHING;

-- Grant permissions (safe to run multiple times)
GRANT ALL ON public.orders TO anon;
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

-- Add comments for documentation
COMMENT ON COLUMN public.orders.order_id IS 'Order ID copied from order_items table';
COMMENT ON COLUMN public.orders.order_token IS '4-digit token number for order tracking';
COMMENT ON COLUMN public.orders.total_amount IS 'Total amount of the order (primary price field)';
COMMENT ON COLUMN public.orders.is_available IS 'Indicates if the order item is available for inventory management';
