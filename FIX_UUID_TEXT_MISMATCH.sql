-- Fix for UUID vs TEXT data type mismatch in update_order_status function
-- This script fixes the "operator does not exist: uuid = text" error

-- 1. First, let's check the current table structure to see the data types
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.update_order_status(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status(UUID, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status(INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status(BIGINT, TEXT);

-- 3. Create the fixed update_order_status function that handles both UUID and TEXT
-- Version 1: If your orders.id is UUID type
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id UUID, p_new_status TEXT)
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

-- Version 2: If your orders.id is TEXT type (alternative)
-- CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id TEXT, p_new_status TEXT)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_catalog
-- AS $$
-- BEGIN
--     UPDATE public.orders 
--     SET status = p_new_status,
--         updated_at = NOW(),
--         delivered_at = CASE 
--             WHEN p_new_status = 'DELIVERED' THEN NOW() 
--             ELSE public.orders.delivered_at 
--         END
--     WHERE id = p_order_id;
-- END;
-- $$;

-- 4. Grant execute permission to anonymous users
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, TEXT) TO anon;
-- GRANT EXECUTE ON FUNCTION public.update_order_status(TEXT, TEXT) TO anon; -- Uncomment if using TEXT version

-- 5. Alternative: Create a more flexible function that can handle both types
CREATE OR REPLACE FUNCTION public.update_order_status_flexible(p_order_id TEXT, p_new_status TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    -- Try to update using the order_id as TEXT first
    UPDATE public.orders 
    SET status = p_new_status,
        updated_at = NOW(),
        delivered_at = CASE 
            WHEN p_new_status = 'DELIVERED' THEN NOW() 
            ELSE public.orders.delivered_at 
        END
    WHERE id::TEXT = p_order_id;
    
    -- If no rows were updated, try with UUID conversion
    IF NOT FOUND THEN
        UPDATE public.orders 
        SET status = p_new_status,
            updated_at = NOW(),
            delivered_at = CASE 
                WHEN p_new_status = 'DELIVERED' THEN NOW() 
                ELSE public.orders.delivered_at 
            END
        WHERE id = p_order_id::UUID;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status_flexible(TEXT, TEXT) TO anon;

-- 6. Show the current functions
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
AND p.proname LIKE '%update_order_status%';

-- 7. Test the function (uncomment to test)
-- First, let's see what orders exist:
-- SELECT id, item_name, status FROM public.orders LIMIT 5;

-- Then test the update (replace 'your_order_id_here' with an actual order ID):
-- SELECT public.update_order_status_flexible('your_order_id_here', 'PREPARING');
