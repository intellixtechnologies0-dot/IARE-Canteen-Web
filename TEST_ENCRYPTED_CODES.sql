-- Test Encrypted Codes
-- Run this after the main CREATE_ENCRYPTED_CODES.sql script

-- 1. Check if encrypted codes were generated
SELECT 
    id,
    item_name,
    order_token,
    encrypted_code,
    created_at
FROM public.orders 
WHERE encrypted_code IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- 2. Create a test order to see encrypted code generation in action
INSERT INTO public.orders (
    id,
    item_name,
    total_amount,
    status,
    order_placer
) VALUES (
    gen_random_uuid(),
    'Test Encrypted Code Item',
    150,
    'PENDING',
    'admin'
);

-- 3. Show the newly created order with its encrypted code
SELECT 
    id,
    item_name,
    order_token,
    encrypted_code,
    total_amount,
    status,
    created_at
FROM public.orders 
WHERE item_name = 'Test Encrypted Code Item'
ORDER BY created_at DESC
LIMIT 1;

-- 4. Test searching by encrypted code
-- Replace 'YOUR_ENCRYPTED_CODE_HERE' with an actual encrypted code from step 1
-- SELECT * FROM public.orders WHERE encrypted_code = 'YOUR_ENCRYPTED_CODE_HERE';

-- 5. Show all available search methods for an order
SELECT 
    'Order ID' as search_type,
    id as search_value
FROM public.orders 
WHERE encrypted_code IS NOT NULL
UNION ALL
SELECT 
    'Token Number' as search_type,
    order_token as search_value
FROM public.orders 
WHERE encrypted_code IS NOT NULL AND order_token IS NOT NULL
UNION ALL
SELECT 
    'Encrypted Code' as search_type,
    encrypted_code as search_value
FROM public.orders 
WHERE encrypted_code IS NOT NULL
ORDER BY search_type, search_value
LIMIT 15;



