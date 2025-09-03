-- FOOD ITEM ID SETUP FIXED: Generate unique food_item_id and link orders to food items
-- This script creates unique IDs for food items and links orders to them (FIXED VERSION)

-- Step 1: Add food_item_id column to food_items table
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS food_item_id TEXT;

-- Step 2: Generate unique food_item_id for each food item
UPDATE public.food_items 
SET food_item_id = 'FOOD_' || LPAD(id::TEXT, 4, '0')
WHERE food_item_id IS NULL;

-- Step 3: Add food_item_id column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS food_item_id TEXT;

-- Step 4: Link orders to food items by matching item names (FIXED)
UPDATE public.orders 
SET food_item_id = (
    SELECT fi.food_item_id 
    FROM public.food_items fi 
    WHERE fi.name = orders.item_name
    LIMIT 1
)
WHERE orders.food_item_id IS NULL 
AND EXISTS (
    SELECT 1 FROM public.food_items fi 
    WHERE fi.name = orders.item_name
);

-- Step 5: Update item_name in orders to show the actual food item name (FIXED)
UPDATE public.orders 
SET item_name = (
    SELECT fi.name 
    FROM public.food_items fi 
    WHERE fi.food_item_id = orders.food_item_id
)
WHERE orders.food_item_id IS NOT NULL;

-- Step 6: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_food_items_food_item_id ON public.food_items (food_item_id);
CREATE INDEX IF NOT EXISTS idx_orders_food_item_id ON public.orders (food_item_id);

-- Step 7: Show the results
SELECT 
    'Food items with unique ID' as status,
    COUNT(*) as count
FROM public.food_items 
WHERE food_item_id IS NOT NULL;

SELECT 
    'Orders linked to food items' as status,
    COUNT(*) as count
FROM public.orders 
WHERE food_item_id IS NOT NULL;

-- Step 8: Display sample data
SELECT 
    'Sample Food Items' as info,
    food_item_id,
    name,
    price
FROM public.food_items 
WHERE food_item_id IS NOT NULL
LIMIT 5;

SELECT 
    'Sample Orders with Food Item IDs' as info,
    id,
    food_item_id,
    item_name,
    total_amount
FROM public.orders 
WHERE food_item_id IS NOT NULL
LIMIT 5;




