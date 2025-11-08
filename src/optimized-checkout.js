// OPTIMIZED CHECKOUT FUNCTIONS WITH TIMEOUT HANDLING
// This file contains improved versions of the checkout functions

// Enhanced decrementStockSafely with timeout and retry logic
const decrementStockSafelyOptimized = async (foodItemId, byQty = 1, retryCount = 0) => {
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 10000; // 10 seconds timeout
  
  try {
    const qtyToReduce = Math.max(0, Number(byQty) || 0);
    if (!foodItemId || qtyToReduce === 0) return;

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Stock update timeout')), TIMEOUT_MS);
    });

    // Create the stock update promise
    const stockUpdatePromise = async () => {
      // First get current stock
      const { data: currentData, error: fetchError } = await supabase
        .from('food_items')
        .select('available_quantity, is_available')
        .eq('id', foodItemId)
        .single();

      if (fetchError) throw fetchError;

      const currentQty = currentData.available_quantity || 0;
      const newQty = Math.max(0, currentQty - qtyToReduce);
      const newIsAvailable = newQty > 0;

      // Update with calculated values
      const { data, error } = await supabase
        .from('food_items')
        .update({
          available_quantity: newQty,
          is_available: newIsAvailable,
          updated_at: new Date().toISOString()
        })
        .eq('id', foodItemId)
        .select('available_quantity, is_available');

      if (error) throw error;
      return data;
    };

    // Race between timeout and actual operation
    const result = await Promise.race([stockUpdatePromise(), timeoutPromise]);
    
    console.log(`✅ Stock reduced atomically: ${result[0]?.available_quantity} remaining`);
    if (globalRefreshMenuItems) globalRefreshMenuItems();
    
    return result;

  } catch (error) {
    console.error(`❌ Stock update failed (attempt ${retryCount + 1}):`, error);
    
    // Retry logic with exponential backoff
    if (retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      console.log(`🔄 Retrying in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return decrementStockSafelyOptimized(foodItemId, byQty, retryCount + 1);
    }
    
    throw new Error(`Failed to update stock after ${MAX_RETRIES} attempts: ${error.message}`);
  }
};

// Enhanced checkout with timeout handling
const handleCheckoutOptimized = async (orderType) => {
  if (cart.length === 0) {
    setToastMessage({ type: 'error', message: 'Your cart is empty!' });
    setTimeout(() => setToastMessage(null), 2000);
    return;
  }

  try {
    console.log('🛒 Starting optimized checkout process for:', cart.length, 'items');
    
    const createdOrders = [];
    const TIMEOUT_PER_ITEM = 15000; // 15 seconds per item

    // Process each cart item with individual timeout
    for (const item of cart) {
      console.log('📝 Processing item:', item.name, 'Qty:', item.quantity);
      
      // Create timeout promise for this item
      const itemTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout processing ${item.name}`)), TIMEOUT_PER_ITEM);
      });

      // Create the order processing promise
      const processItemPromise = async () => {
        // Calculate price with takeaway surcharge
        const TAKEAWAY_SURCHARGE = 10;
        const isTakeaway = orderType === 'takeaway';
        const pricePerUnit = isTakeaway ? (item.price + TAKEAWAY_SURCHARGE) : item.price;
        const totalPrice = pricePerUnit * item.quantity;
        
        // Generate unique identifiers
        const orderId = crypto.randomUUID();
        const token = Math.floor(1000 + Math.random() * 9000).toString();
        const digitsFromUuid = orderId.replace(/\D/g, '');
        const sixteenDigits = (digitsFromUuid + '0000000000000000').slice(0, 16);
        const qrCode = sixteenDigits;
        
        // Get admin user ID
        const adminUserId = await getAdminUserId();
        if (!adminUserId) {
          throw new Error('ADMIN_USER_ID_MISSING');
        }

        // Create order with timeout
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .insert({
            id: orderId,
            order_id: orderId,
            user_id: adminUserId,
            item_name: item.name,
            total_amount: totalPrice,
            status: 'preparing',
            order_type: isTakeaway,
            order_token: token,
            qr_code: qrCode,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (orderError) {
          throw new Error(`Failed to create order: ${orderError.message}`);
        }

        // Update stock with optimized function
        await decrementStockSafelyOptimized(item.id, item.quantity);

        return { item: item.name, token: token, orderId: orderId };
      };

      // Race between timeout and processing
      try {
        const result = await Promise.race([processItemPromise(), itemTimeoutPromise]);
        createdOrders.push(result);
        console.log('✅ Item processed successfully:', item.name);
      } catch (error) {
        console.error(`❌ Failed to process ${item.name}:`, error);
        throw new Error(`Failed to add item ${item.name} to order: ${error.message}`);
      }
    }

    // Clear cart and show success
    setCart([]);
    setShowCart(false);
    setLastToken(createdOrders[createdOrders.length - 1]?.token);
    
    const orderTypeText = orderType === 'dine_in' ? 'Dine In' : 'Takeaway';
    const tokensList = createdOrders.map(order => `#${order.token}`).join(', ');
    setToastMessage({ 
      type: 'success', 
      message: `✅ Checkout successful! ${createdOrders.length} order(s) created • Tokens: ${tokensList} • ${orderTypeText}` 
    });
    setTimeout(() => setToastMessage(null), 3500);

    // Refresh menu items
    if (globalRefreshMenuItems) {
      globalRefreshMenuItems();
    }

  } catch (error) {
    console.error('❌ Checkout failed:', error);
    setToastMessage({ 
      type: 'error', 
      message: `Checkout failed: ${error.message}` 
    });
    setTimeout(() => setToastMessage(null), 5000);
  }
};

// Export the optimized functions
export { decrementStockSafelyOptimized, handleCheckoutOptimized };
