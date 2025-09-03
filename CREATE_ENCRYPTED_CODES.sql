-- Create Encrypted Codes for Orders Table
-- Run this in your Supabase SQL Editor

-- 1. Add encrypted_code column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS encrypted_code TEXT;

-- 2. Create function to generate unique encrypted code
CREATE OR REPLACE FUNCTION public.generate_encrypted_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_encrypted_code TEXT;
    max_attempts INTEGER := 50;
    attempt INTEGER := 0;
    order_data TEXT;
    timestamp_val TEXT;
    random_salt TEXT;
BEGIN
    LOOP
        -- Generate components for encryption
        timestamp_val := EXTRACT(EPOCH FROM NOW())::TEXT;
        random_salt := LPAD((FLOOR(RANDOM() * 999999) + 1)::TEXT, 6, '0');
        
        -- Create a unique string combining timestamp, random salt, and order info
        order_data := timestamp_val || random_salt;
        
        -- Generate encrypted code using MD5 hash (you can change to other hash functions)
        new_encrypted_code := 'IARE_' || MD5(order_data) || '_' || random_salt;
        
        -- Check if this encrypted code already exists
        IF NOT EXISTS (
            SELECT 1 FROM public.orders 
            WHERE encrypted_code = new_encrypted_code
        ) THEN
            RETURN new_encrypted_code;
        END IF;
        
        -- If code exists, try again
        attempt := attempt + 1;
        IF attempt >= max_attempts THEN
            RAISE EXCEPTION 'Could not generate unique encrypted code after % attempts', max_attempts;
        END IF;
        
        -- Small delay to avoid infinite loops
        PERFORM pg_sleep(0.01);
    END LOOP;
END;
$$;

-- 3. Create trigger function to set encrypted_code on insert
CREATE OR REPLACE FUNCTION public.set_encrypted_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only set encrypted code if it's not already set
    IF NEW.encrypted_code IS NULL THEN
        NEW.encrypted_code := public.generate_encrypted_code();
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Create trigger to automatically set encrypted_code
DROP TRIGGER IF EXISTS trigger_set_encrypted_code ON public.orders;
CREATE TRIGGER trigger_set_encrypted_code
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_encrypted_code();

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION public.generate_encrypted_code() TO anon;
GRANT EXECUTE ON FUNCTION public.set_encrypted_code() TO anon;

-- 6. Update existing orders that don't have encrypted codes
UPDATE public.orders 
SET encrypted_code = public.generate_encrypted_code()
WHERE encrypted_code IS NULL;

-- 7. Create index for faster encrypted code lookups
CREATE INDEX IF NOT EXISTS idx_orders_encrypted_code ON public.orders (encrypted_code);

-- 8. Verify the setup
SELECT 
    COUNT(*) as total_orders,
    COUNT(encrypted_code) as orders_with_encrypted_codes,
    COUNT(DISTINCT encrypted_code) as unique_encrypted_codes
FROM public.orders;

-- 9. Show sample encrypted codes
SELECT 
    id,
    item_name,
    order_token,
    encrypted_code,
    created_at
FROM public.orders 
WHERE encrypted_code IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
