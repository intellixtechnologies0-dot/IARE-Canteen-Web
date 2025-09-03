-- Test Encrypted Code System
-- Run this after ADD_ENCRYPTED_CODE_COLUMN.sql

-- 1. Check if encrypted_code column exists
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'orders' 
    AND table_schema = 'public' 
    AND column_name = 'encrypted_code';

-- 2. Create a test order to see encrypted code generation
INSERT INTO public.orders (
    id,
    item_name,
    total_amount,
    status,
    order_placer
) VALUES (
    gen_random_uuid(),
    'Test Encrypted Code Order',
    200,
    'PENDING',
    'admin'
);

-- 3. Show the test order with its encrypted code
SELECT 
    id,
    item_name,
    order_token,
    encrypted_code,
    total_amount,
    status,
    created_at
FROM public.orders 
WHERE item_name = 'Test Encrypted Code Order'
ORDER BY created_at DESC
LIMIT 1;

-- 4. Test the generate_encrypted_code function directly
SELECT public.generate_encrypted_code() as test_encrypted_code;

-- 5. Show all orders with encrypted codes
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


