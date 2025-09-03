-- Fix Order Token Column and Generation
-- Run this in your Supabase SQL Editor

-- 1. Add order_token column if it doesn't exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_token TEXT;

-- 2. Create function to generate unique 4-digit token for the day
CREATE OR REPLACE FUNCTION public.generate_unique_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    token TEXT;
    max_attempts INTEGER := 100;
    attempt INTEGER := 0;
    today DATE := CURRENT_DATE;
BEGIN
    LOOP
        -- Generate random 4-digit number (1000-9999)
        token := LPAD((FLOOR(RANDOM() * 9000) + 1000)::TEXT, 4, '0');
        
        -- Check if this token already exists for today
        IF NOT EXISTS (
            SELECT 1 FROM public.orders 
            WHERE order_token = token 
            AND DATE(created_at) = today
        ) THEN
            RETURN token;
        END IF;
        
        -- If token exists for today, try again
        attempt := attempt + 1;
        IF attempt >= max_attempts THEN
            RAISE EXCEPTION 'Could not generate unique token for today after % attempts', max_attempts;
        END IF;
        
        -- Small delay to avoid infinite loops
        PERFORM pg_sleep(0.01);
    END LOOP;
END;
$$;

-- 3. Create trigger function to set order_token on insert
CREATE OR REPLACE FUNCTION public.set_order_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only set token if it's not already set
    IF NEW.order_token IS NULL THEN
        NEW.order_token := public.generate_unique_token();
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Create trigger to automatically set order_token
DROP TRIGGER IF EXISTS trigger_set_order_token ON public.orders;
CREATE TRIGGER trigger_set_order_token
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_order_token();

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION public.generate_unique_token() TO anon;
GRANT EXECUTE ON FUNCTION public.set_order_token() TO anon;

-- 6. Update existing orders that don't have tokens (optional)
-- This will generate tokens for existing orders
UPDATE public.orders 
SET order_token = public.generate_unique_token()
WHERE order_token IS NULL;

-- 7. Verify the setup
SELECT 
    COUNT(*) as total_orders,
    COUNT(order_token) as orders_with_tokens,
    COUNT(DISTINCT order_token) as unique_tokens
FROM public.orders;

-- Fix for ambiguous column reference "delivered_at" error
-- This script fixes the update_order_status function to properly reference the delivered_at column

-- Drop the existing function that has the ambiguous column reference
DROP FUNCTION IF EXISTS public.update_order_status(TEXT, TEXT);

-- Create the fixed function with proper column qualification
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id TEXT, p_new_status TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    UPDATE public.orders 
    SET status = p_new_status,
        delivered_at = CASE 
            WHEN p_new_status = 'DELIVERED' THEN NOW() 
            ELSE public.orders.delivered_at 
        END
    WHERE id = p_order_id;
END;
$$;

-- Grant execute permission to anonymous users
GRANT EXECUTE ON FUNCTION public.update_order_status(TEXT, TEXT) TO anon;

-- Alternative version if the above doesn't work (using table alias)
-- DROP FUNCTION IF EXISTS public.update_order_status(TEXT, TEXT);
-- CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id TEXT, p_new_status TEXT)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_catalog
-- AS $$
-- BEGIN
--     UPDATE public.orders AS o
--     SET status = p_new_status,
--         delivered_at = CASE 
--             WHEN p_new_status = 'DELIVERED' THEN NOW() 
--             ELSE o.delivered_at 
--         END
--     WHERE o.id = p_order_id;
-- END;
-- $$;
-- GRANT EXECUTE ON FUNCTION public.update_order_status(TEXT, TEXT) TO anon;

