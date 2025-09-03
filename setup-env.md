# Environment Setup Guide

## Step 1: Get Your Supabase Credentials

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to Settings → API
4. Copy these values:
   - **Project URL** (looks like: `https://your-project.supabase.co`)
   - **anon public key** (starts with `eyJ...`)

## Step 2: Create .env File

Create a file named `.env` in the project root with this content:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_DISABLE_AUTH=true
```

Replace the placeholder values with your actual credentials.

## Step 3: Restart Development Server

After creating the `.env` file, restart the development server:

```bash
npm run dev
```

## Step 4: Check Console

Open your browser's developer console (F12) and check for:
- Connection status messages
- Any error messages
- Order fetching logs

## Troubleshooting

If you still don't see orders:
1. Check the browser console for errors
2. Verify your Supabase credentials are correct
3. Make sure the orders table exists in your Supabase database
4. Run the SQL scripts in Supabase SQL Editor if needed


