import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { localDb } from '../lib/localDb'
import type { Profile } from '../lib/types'

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, session: null, profile: null, isAdmin: false, loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
})

// Extract user ID from Supabase's stored session without any network call.
// Works even when the access token has expired — critical for offline app startup.
function getStoredUserId(): string | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string
    const ref = new URL(url).hostname.split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return null
    const data = JSON.parse(raw)
    return (data?.user?.id as string) ?? null
  } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    // Step 1: Read from localDb immediately so the app renders without waiting for network
    const cached = await localDb.profiles.get(userId)
    if (cached) setProfile(cached as unknown as Profile)
    setLoading(false)

    // Step 2: Refresh from Supabase in the background
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (data) setProfile(data)
    } catch { /* offline */ }
  }

  useEffect(() => {
    // Fast path: read user ID from stored session (synchronous, zero network).
    // If token is expired and we're offline, getSession() would hang — this bypasses that.
    const cachedUserId = getStoredUserId()
    if (cachedUserId) {
      fetchProfile(cachedUserId)  // sets loading=false after localDb read
    }

    // Auth session — runs in background. May hang on spotty connections if token needs refresh.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) fetchProfile(session.user.id)
        else if (!cachedUserId) setLoading(false)
      })
      .catch(() => {
        // Token refresh failed offline — profile already shown from cache
        if (!cachedUserId) setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      // Do NOT clear profile on auth state changes — only explicit signOut() does that.
      // This prevents the app from flashing to login when token refresh fails offline.
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{
      user, session, profile,
      isAdmin: profile?.role === 'admin',
      loading,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
