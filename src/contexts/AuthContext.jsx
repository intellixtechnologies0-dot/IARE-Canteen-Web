import React, { createContext, useContext, useEffect, useState } from 'react'
import supabase from '../lib/supabaseClient'

const AuthContext = createContext({})
const ALLOWED_ADMIN_EMAIL = 'biyyanisuhas@gmail.com'

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const currentEmail = session?.user?.email ? String(session.user.email).toLowerCase() : null
        if (currentEmail && currentEmail !== ALLOWED_ADMIN_EMAIL) {
          try { await supabase.auth.signOut() } catch (_) {}
          setUser(null)
        } else {
          setUser(session?.user ?? null)
        }
      } catch (error) {
        console.error('Error getting session:', error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentEmail = session?.user?.email ? String(session.user.email).toLowerCase() : null
      if (currentEmail && currentEmail !== ALLOWED_ADMIN_EMAIL) {
        try { await supabase.auth.signOut() } catch (_) {}
        setUser(null)
      } else {
        setUser(session?.user ?? null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    try {
      const normalizedEmail = String(email || '').toLowerCase().trim()
      if (normalizedEmail !== ALLOWED_ADMIN_EMAIL) {
        const err = new Error('Access restricted: only administrators may sign in')
        return { data: null, error: err }
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const value = {
    user,
    loading,
    isAdmin: !!(user?.email && String(user.email).toLowerCase() === ALLOWED_ADMIN_EMAIL),
    signIn,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
