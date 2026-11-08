// src/contexts/AuthContext.tsx
// Provides authentication state and actions to the entire React tree.
// Wraps Supabase Auth: session, profile (from public.profiles), loading state.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { ProfileRow } from '@/lib/database.types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthState {
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  isAuthenticated: boolean
  loading: boolean           // true while initial session check is in progress
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<AuthError | null>
  register: (email: string, password: string) => Promise<AuthError | null>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export interface AuthError {
  message: string
  code?: string
}

export type AuthContextValue = AuthState & AuthActions

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchingProfile = useRef(false)

  // ── Fetch profile from public.profiles ──────────────────────────────────────
  const fetchProfile = useCallback(async (userId: string) => {
    if (fetchingProfile.current) return
    fetchingProfile.current = true
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, created_at')
        .eq('id', userId)
        .single()

      if (!error && data) setProfile(data)
      // If profile not yet created (trigger latency), silently keep null.
      // The UI will show a loading indicator and retry is available.
    } finally {
      fetchingProfile.current = false
    }
  }, [])

  // ── Expose refreshProfile for UI use (e.g. after username update) ───────────
  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id)
  }, [user, fetchProfile])

  // ── Initialise session on mount, subscribe to auth changes ──────────────────
  useEffect(() => {
    let mounted = true

    // getSession() is synchronous for the cached value; await for the promise
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => {
          if (mounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        fetchProfile(s.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  // ── Auth actions ─────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string): Promise<AuthError | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return null
    return { message: mapAuthError(error.message), code: error.code }
  }, [])

  const register = useCallback(async (email: string, password: string): Promise<AuthError | null> => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (!error) return null
    return { message: mapAuthError(error.message), code: error.code }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  // ── Context value ─────────────────────────────────────────────────────────────

  return (
    <AuthContext.Provider value={{
      session,
      user,
      profile,
      isAuthenticated: !!session,
      loading,
      login,
      register,
      logout,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook (also re-exported via src/hooks/useAuth.ts) ─────────────────────────
// Defined here so AuthContext.tsx stays self-contained for tests.
// Exported as a named function so it can be re-exported from useAuth.ts.

// eslint-disable-next-line react-refresh/only-export-components
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>')
  return ctx
}

// ── Error message mapping ─────────────────────────────────────────────────────

function mapAuthError(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials'))
    return 'E-mail ou senha incorretos.'
  if (lower.includes('email not confirmed'))
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
  if (lower.includes('user already registered') || lower.includes('already been registered'))
    return 'Este e-mail já está cadastrado. Tente fazer login.'
  if (lower.includes('password should be'))
    return 'A senha deve ter pelo menos 6 caracteres.'
  if (lower.includes('rate limit') || lower.includes('too many requests'))
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  if (lower.includes('network') || lower.includes('fetch'))
    return 'Erro de conexão. Verifique sua internet.'
  return raw
}
