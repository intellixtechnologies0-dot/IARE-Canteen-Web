-- IARE Canteen Orders Table Setup
-- This script creates/updates the orders table with all required columns

-- Create the orders table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT UNIQUE NOT NULL, -- 4-digit order ID from order_items table
    user_id UUID,
    status TEXT DEFAULT 'pending' NOT NULL,
    payment_method TEXT,
    delivery_address TEXT,
    item_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    item_name TEXT,
    total NUMERIC,
    order_placer TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE,
    order_token TEXT, -- 4-digit token from order_token table
    created_dat DATE,
    created_by UUID,
    order_day DATE,
    item_id UUID,
    item_price NUMERIC,
    total_amount NUMERIC,
    price NUMERIC,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    token_consumed BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT TRUE NOT NULL
);

-- Add any missing columns if table already exists
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_id TEXT UNIQUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_placer TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_token TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_dat DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_day DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_price NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS price NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS token_consumed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE NOT NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_item_name ON public.orders (item_name);
CREATE INDEX IF NOT EXISTS idx_orders_order_token ON public.orders (order_token);
CREATE INDEX IF NOT EXISTS idx_orders_is_available ON public.orders (is_available);

-- Enable Row Level Security (RLS)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for anonymous access
DO $$ 
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS anon_select_orders ON public.orders;
    DROP POLICY IF EXISTS anon_insert_orders ON public.orders;
    DROP POLICY IF EXISTS anon_update_orders ON public.orders;
    
    -- Create new policies
    CREATE POLICY anon_select_orders ON public.orders
        FOR SELECT TO anon USING (true);

    CREATE POLICY anon_insert_orders ON public.orders
        FOR INSERT TO anon WITH CHECK (true);

    CREATE POLICY anon_update_orders ON public.orders
        FOR UPDATE TO anon USING (true) WITH CHECK (true);
END $$;

-- Enable realtime for orders table
DO $$
BEGIN
    -- Check if orders table is already in the publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
END $$;

-- Create function to generate 4-digit order IDs
CREATE OR REPLACE FUNCTION generate_order_id()
RETURNS TEXT AS $$
DECLARE
    next_id INTEGER;
    order_id_text TEXT;
BEGIN
    -- Get the next available ID
    SELECT COALESCE(MAX(CAST(order_id AS INTEGER)), 1000) + 1
    INTO next_id
    FROM public.orders
    WHERE order_id ~ '^[0-9]+$';
    
    -- Convert to 4-digit text with leading zeros
    order_id_text := LPAD(next_id::TEXT, 4, '0');
    
    RETURN order_id_text;
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for testing
INSERT INTO public.orders (
    order_id,
    item_name, 
    total_amount, 
    price, 
    item_price, 
    total, 
    order_placer, 
    status, 
    order_token, 
    item_count,
    created_dat,
    order_day,
    token_consumed,
    is_available,
    payment_method,
    delivery_address,
    item_id,
    user_id,
    created_by
) VALUES 
    ('1001', 'Chicken Noodles', 80, 80, 80, NULL, 'student', 'pending', '1234', 1, '2025-08-25', '2025-08-25', FALSE, TRUE, 'cash', 'Table 5', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()),
    ('1002', 'Uttappa', 50, 50, 50, 50, 'admin', 'delivered', '5678', 1, '2025-08-23', '2025-08-23', FALSE, TRUE, 'card', 'Counter 2', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()),
    ('1003', 'Biryani', 120, 120, 120, NULL, 'student', 'preparing', '9012', 1, '2025-08-25', '2025-08-25', FALSE, TRUE, 'cash', 'Table 8', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()),
    ('1004', 'Dosa', 60, 60, 60, NULL, 'admin', 'ready', '3456', 1, '2025-08-25', '2025-08-25', FALSE, TRUE, 'card', 'Counter 1', gen_random_uuid(), gen_random_uuid(), gen_random_uuid())
ON CONFLICT (order_id) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE public.orders IS 'Stores information about customer orders in IARE Canteen';
COMMENT ON COLUMN public.orders.id IS 'Unique UUID identifier for the order';
COMMENT ON COLUMN public.orders.order_id IS '4-digit order ID for display in the app';
COMMENT ON COLUMN public.orders.user_id IS 'ID of the user who placed the order';
COMMENT ON COLUMN public.orders.status IS 'Current status: pending, preparing, ready, delivered';
COMMENT ON COLUMN public.orders.item_name IS 'Name of the food item ordered';
COMMENT ON COLUMN public.orders.total_amount IS 'Total amount of the order (primary price field)';
COMMENT ON COLUMN public.orders.price IS 'Price of the item';
COMMENT ON COLUMN public.orders.item_price IS 'Price of the specific item';
COMMENT ON COLUMN public.orders.total IS 'Total value (alternative to total_amount)';
COMMENT ON COLUMN public.orders.order_placer IS 'Who placed the order: student or admin';
COMMENT ON COLUMN public.orders.order_token IS '4-digit token number for order tracking';
COMMENT ON COLUMN public.orders.is_available IS 'Indicates if the order item is available for inventory management';

-- Grant permissions
GRANT ALL ON public.orders TO anon;
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
