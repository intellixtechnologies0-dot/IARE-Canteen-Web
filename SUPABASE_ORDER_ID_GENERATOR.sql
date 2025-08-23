-- Order ID Generator for Supabase
-- Run these commands in your Supabase SQL Editor

-- 0. First, check the current table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 1. Create or recreate the orders table with all necessary columns
DROP TABLE IF EXISTS public.orders CASCADE;

CREATE TABLE public.orders (
    id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING',
    order_placer TEXT DEFAULT 'student',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- 2. Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies
CREATE POLICY anon_select_orders ON public.orders
    FOR SELECT USING (true);

CREATE POLICY anon_insert_orders ON public.orders
    FOR INSERT WITH CHECK (true);

CREATE POLICY anon_update_orders ON public.orders
    FOR UPDATE USING (true);

-- 4. Drop any existing conflicting functions
DROP FUNCTION IF EXISTS public.update_order_status(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status(UUID, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status(INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status(BIGINT, TEXT);

-- 5. Function to generate random 4-digit order ID
CREATE OR REPLACE FUNCTION public.generate_order_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    order_id TEXT;
    max_attempts INTEGER := 50;
    attempt INTEGER := 0;
BEGIN
    LOOP
        -- Generate random 4-digit number (1000-9999)
        order_id := LPAD((FLOOR(RANDOM() * 9000) + 1000)::TEXT, 4, '0');
        
        -- Check if this order ID already exists
        IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = order_id) THEN
            RETURN order_id;
        END IF;
        
        -- If ID exists, try again
        attempt := attempt + 1;
        IF attempt >= max_attempts THEN
            RAISE EXCEPTION 'Could not generate unique random order ID after % attempts', max_attempts;
        END IF;
        
        -- Small delay to avoid infinite loops
        PERFORM pg_sleep(0.01);
    END LOOP;
END;
$$;

-- 6. Function to create a new order with auto-generated random ID
CREATE OR REPLACE FUNCTION public.create_order(
    p_item_name TEXT,
    p_total INTEGER,
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
BEGIN
    -- Generate unique random order ID
    new_order_id := public.generate_order_id();
    
    -- Insert the new order
    INSERT INTO public.orders (id, item_name, total, status, order_placer, created_at)
    VALUES (new_order_id, p_item_name, p_total, p_status, p_order_placer, NOW());
    
    RETURN new_order_id;
END;
$$;

-- 7. Function to update order status (clean version)
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

-- 8. Grant permissions to anonymous users
GRANT EXECUTE ON FUNCTION public.generate_order_id() TO anon;
GRANT EXECUTE ON FUNCTION public.create_order(TEXT, INTEGER, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.update_order_status(TEXT, TEXT) TO anon;

-- 9. Grant permissions on tables
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon;

-- 10. Sample data (optional - for testing)
-- SELECT public.create_order('Veg Biryani', 180, 'PENDING', 'admin');
-- SELECT public.create_order('Masala Dosa', 80, 'PENDING', 'student');
-- SELECT public.create_order('Samosa', 40, 'PENDING', 'admin');

-- 11. View to see today's orders with generated IDs
CREATE OR REPLACE VIEW public.today_orders AS
SELECT 
    id,
    item_name,
    total,
    status,
    order_placer,
    created_at,
    delivered_at
FROM public.orders
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;

-- Grant access to the view
GRANT SELECT ON public.today_orders TO anon;

-- 12. Show the final table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 13. Test the system (uncomment to run)
-- SELECT public.create_order('Test Biryani', 180, 'PENDING', 'admin');
-- SELECT public.create_order('Test Dosa', 80, 'PREPARING', 'student');
-- SELECT * FROM public.today_orders;
