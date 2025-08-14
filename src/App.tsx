import { useEffect, useState } from 'react'
import './App.css'
import { supabase } from './lib/supabaseClient'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import type { Session } from '@supabase/supabase-js'

function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session as any)
    }
    init()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  if (!session) {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: 16 }}>
        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={['google']} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <h1>IARE Canteen</h1>
      <p>Signed in as {session.user?.email}</p>
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )
}

export default App
