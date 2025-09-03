-- CREATE ORDER FUNCTION: Automatically create orders with food_item_id linking
-- This function will be used when new orders are placed

-- Function to create a new order with automatic food_item_id linking
CREATE OR REPLACE FUNCTION create_order_with_food_item(
    p_item_name TEXT,
    p_total_amount NUMERIC,
    p_status TEXT DEFAULT 'PENDING',
    p_order_placer TEXT DEFAULT 'student'
)
RETURNS TEXT AS $$
DECLARE
    new_order_id TEXT;
    food_item_id_found TEXT;
BEGIN
    -- Generate unique order ID
    new_order_id := 'ORD_' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    
    -- Find the food_item_id for the given item name
    SELECT fi.food_item_id INTO food_item_id_found
    FROM public.food_items fi 
    WHERE (fi.name = p_item_name OR fi.item_name = p_item_name)
    LIMIT 1;
    
    -- Insert the new order with food_item_id
    INSERT INTO public.orders (
        id, 
        item_name, 
        total_amount, 
        status, 
        order_placer, 
        food_item_id,
        created_at
    )
    VALUES (
        new_order_id, 
        p_item_name, 
        p_total_amount, 
        p_status, 
        p_order_placer, 
        food_item_id_found,
        NOW()
    );
    
    RETURN new_order_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions to anonymous users
GRANT EXECUTE ON FUNCTION create_order_with_food_item(TEXT, NUMERIC, TEXT, TEXT) TO anon;

-- Test the function (uncomment to test)
-- SELECT create_order_with_food_item('Veg Biryani', 180, 'PENDING', 'student');
-- SELECT create_order_with_food_item('Masala Dosa', 80, 'PENDING', 'admin');




