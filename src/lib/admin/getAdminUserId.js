import supabase from '../supabaseClient'

function normalizeUuid(maybe) {
  if (maybe == null) return null
  try {
    let s = String(maybe).trim()
    // Strip common wrappers like quotes or angle brackets accidentally saved
    s = s.replace(/^['"<\s]+/, '').replace(/['">\s]+$/, '')
    const isUuid = /^[0-9a-f-]{36}$/i.test(s)
    return isUuid ? s : null
  } catch (_) { return null }
}

export async function getAdminUserId() {
  // Try key/value shape: { key: 'admin_user_id', value: '<uuid>' }
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'admin_user_id')
      .single()
    const val = !error ? normalizeUuid(data?.value) : null
    if (val) return val
  } catch (_) {}

  // Try direct column shapes
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('admin_user_id')
      .limit(1)
      .single()
    const val = !error ? normalizeUuid(data?.admin_user_id) : null
    if (val) return val
  } catch (_) {}

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('admin_id')
      .limit(1)
      .single()
    const val = !error ? normalizeUuid(data?.admin_id) : null
    if (val) return val
  } catch (_) {}

  return null
}


