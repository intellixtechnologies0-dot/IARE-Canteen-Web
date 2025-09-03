-- Orders Table Status Update Setup
-- This script sets up the orders table with proper status column and functions
-- to wire it to the orders panel

-- 1. First, let's check the current table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Create or update the orders table with all necessary columns
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    total_amount DECIMAL(10,2),
    total INTEGER,
    status TEXT DEFAULT 'PENDING',
    order_placer TEXT DEFAULT 'student',
    order_token TEXT,
    token_no TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_available BOOLEAN DEFAULT true
);

-- 3. Add missing columns if they don't exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_token TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS token_no TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_order_token ON public.orders (order_token);
CREATE INDEX IF NOT EXISTS idx_orders_token_no ON public.orders (token_no);
CREATE INDEX IF NOT EXISTS idx_orders_item_name ON public.orders (item_name);

-- 5. Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies
DROP POLICY IF EXISTS anon_select_orders ON public.orders;
CREATE POLICY anon_select_orders ON public.orders
    FOR SELECT USING (true);

DROP POLICY IF EXISTS anon_insert_orders ON public.orders;
CREATE POLICY anon_insert_orders ON public.orders
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS anon_update_orders ON public.orders;
CREATE POLICY anon_update_orders ON public.orders
    FOR UPDATE USING (true);

-- 7. Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.update_order_status(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status(UUID, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status(INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status(BIGINT, TEXT);

-- 8. Create the fixed update_order_status function (no ambiguous column reference)
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id TEXT, p_new_status TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    UPDATE public.orders 
    SET status = p_new_status,
        updated_at = NOW(),
        delivered_at = CASE 
            WHEN p_new_status = 'DELIVERED' THEN NOW() 
            ELSE public.orders.delivered_at 
        END
    WHERE id = p_order_id;
END;
$$;

-- 9. Create function to generate order tokens
CREATE OR REPLACE FUNCTION public.generate_order_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    token TEXT;
    max_attempts INTEGER := 50;
    attempt INTEGER := 0;
BEGIN
    LOOP
        -- Generate random 4-digit number (1000-9999)
        token := LPAD((FLOOR(RANDOM() * 9000) + 1000)::TEXT, 4, '0');
        
        -- Check if this token already exists
        IF NOT EXISTS (SELECT 1 FROM public.orders WHERE order_token = token OR token_no = token) THEN
            RETURN token;
        END IF;
        
        -- If token exists, try again
        attempt := attempt + 1;
        IF attempt >= max_attempts THEN
            RAISE EXCEPTION 'Could not generate unique order token after % attempts', max_attempts;
        END IF;
        
        -- Small delay to avoid infinite loops
        PERFORM pg_sleep(0.01);
    END LOOP;
END;
$$;

-- 10. Create function to create new orders with auto-generated tokens
CREATE OR REPLACE FUNCTION public.create_order_with_token(
    p_item_name TEXT,
    p_total_amount DECIMAL DEFAULT 0,
    p_status TEXT DEFAULT 'PENDING',
    p_order_placer TEXT DEFAULT 'student'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    new_order_id TEXT;
    new_token TEXT;
BEGIN
    -- Generate unique order ID
    new_order_id := 'order_' || extract(epoch from now())::text || '_' || floor(random() * 1000)::text;
    
    -- Generate unique token
    new_token := public.generate_order_token();
    
    -- Insert the new order
    INSERT INTO public.orders (
        id, 
        item_name, 
        total_amount, 
        status, 
        order_placer, 
        order_token, 
        token_no,
        created_at
    )
    VALUES (
        new_order_id, 
        p_item_name, 
        p_total_amount, 
        p_status, 
        p_order_placer, 
        new_token, 
        new_token,
        NOW()
    );
    
    RETURN new_token;
END;
$$;

-- 11. Grant permissions to anonymous users
GRANT EXECUTE ON FUNCTION public.update_order_status(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.generate_order_token() TO anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_token(TEXT, DECIMAL, TEXT, TEXT) TO anon;

-- 12. Grant permissions on tables
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon;

-- 13. Create a view for today's orders
CREATE OR REPLACE VIEW public.today_orders AS
SELECT 
    id,
    item_name,
    total_amount,
    status,
    order_placer,
    order_token,
    token_no,
    created_at,
    delivered_at,
    updated_at
FROM public.orders
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;

-- Grant access to the view
GRANT SELECT ON public.today_orders TO anon;

-- 14. Create a trigger to update the updated_at column automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 15. Show the final table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 16. Test the system (uncomment to run)
-- SELECT public.create_order_with_token('Veg Biryani', 180.00, 'PENDING', 'admin');
-- SELECT public.create_order_with_token('Masala Dosa', 80.00, 'PENDING', 'student');
-- SELECT public.create_order_with_token('Samosa', 40.00, 'PENDING', 'admin');
-- SELECT * FROM public.today_orders;

-- 17. Sample data for testing (uncomment to insert)
-- INSERT INTO public.orders (id, item_name, total_amount, status, order_placer, order_token, token_no, created_at)
-- VALUES 
--     ('test_1', 'Veg Biryani', 180.00, 'PENDING', 'student', '1001', '1001', NOW()),
--     ('test_2', 'Masala Dosa', 80.00, 'PREPARING', 'admin', '1002', '1002', NOW()),
--     ('test_3', 'Samosa', 40.00, 'READY', 'student', '1003', '1003', NOW()),
--     ('test_4', 'Chicken Biryani', 200.00, 'DELIVERED', 'admin', '1004', '1004', NOW() - INTERVAL '1 hour');
