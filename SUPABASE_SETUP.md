# Supabase Connection Setup for Kitchen Web App

## Step 1: Get Your Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy your:
   - **Project URL** (looks like: `https://your-project.supabase.co`)
   - **anon public key** (starts with `eyJ...`)

## Step 2: Set Environment Variables

### For Local Development:
1. Create a `.env` file in the project root
2. Add your credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_DISABLE_AUTH=true
```

### For Production (GitHub Pages):
1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Add repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Step 3: Create Required Database Tables

Run these SQL commands in your Supabase SQL Editor:

```sql
-- Create orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read orders (for testing)
CREATE POLICY anon_select_orders ON public.orders
    FOR SELECT USING (true);

-- Allow anonymous users to update order status
CREATE POLICY anon_update_orders ON public.orders
    FOR UPDATE USING (true);

-- Create RPC function for updating order status
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

-- Grant execute permission to anonymous users
GRANT EXECUTE ON FUNCTION public.update_order_status(TEXT, TEXT) TO anon;
```

## Step 4: Enable Realtime

1. Go to Database → Replication
2. Enable realtime for the `orders` table

## Step 5: Test Connection

1. Start the development server: `npm run dev`
2. Open the app and go to Settings → Debug
3. Click "Check Env Vars" to verify environment variables
4. Click "Fetch orders from Supabase" to test the connection
5. Look for the connection status indicator in the top bar

## Troubleshooting

### Connection Status Shows "Error":
- Check environment variables are set correctly
- Verify Supabase URL and anon key
- Ensure RLS policies are created
- Check browser console for detailed errors

### "No rows returned":
- Verify the `orders` table exists and has data
- Check table name is exactly `orders` in `public` schema
- Ensure column names match: `id`, `items`, `total`, `status`, `created_at`

### RPC Function Errors:
- Verify `update_order_status` function exists
- Check function permissions for anonymous users
- Ensure function signature matches the app's expectations

### Realtime Not Working:
- Enable realtime for the `orders` table
- Check subscription channel name matches
- Verify realtime is enabled in your Supabase project

## Sample Data (Optional)

To test with sample data, run this in SQL Editor:

```sql
INSERT INTO public.orders (id, items, total, status) VALUES
('#1001', 'Veg Biryani', 180, 'PENDING'),
('#1002', 'Samosa x2', 40, 'PENDING'),
('#1003', 'Masala Dosa', 80, 'PREPARING');
```
