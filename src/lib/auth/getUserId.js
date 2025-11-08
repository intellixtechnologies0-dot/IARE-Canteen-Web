import supabase from '../supabaseClient'

export async function getUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data?.user?.id ?? null
}




