import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Minimal mock client to avoid runtime crashes when env is missing during local dev
const createMockClient = () => {
  const notConfigured = async () => ({ data: null, error: { message: 'Supabase not configured (.env missing)' } })
  const chain = () => ({
    select: async () => ({ data: [], error: { message: 'Supabase not configured (.env missing)' } }),
    insert: notConfigured,
    update: notConfigured,
    delete: notConfigured,
    order() { return this },
    range() { return this },
    eq() { return this },
    in() { return this },
    not() { return this },
    gte() { return this },
    limit() { return this },
    single: async () => ({ data: null, error: { message: 'Supabase not configured (.env missing)' } })
  })
  return {
    from() { return chain() },
    rpc: notConfigured,
    channel() { return { on() { return this }, subscribe() { return { unsubscribe() {} } } } },
    storage: { from() { return { upload: notConfigured, getPublicUrl: () => ({ data: { publicUrl: '' } }) } } }
  }
}

const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 10 } } })
  : createMockClient()

export default supabase


