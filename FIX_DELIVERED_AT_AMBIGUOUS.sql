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

