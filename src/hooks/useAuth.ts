// src/hooks/useAuth.ts
// Re-exports useAuthContext as useAuth for convenience.
// All other modules import from this file.

export { useAuthContext as useAuth } from '@/contexts/AuthContext'
export type { AuthState, AuthActions, AuthError, AuthContextValue } from '@/contexts/AuthContext'
