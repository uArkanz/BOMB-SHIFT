// src/pages/auth/LoginPage.tsx
// Login form — email + password.
// On success Supabase updates the session; AuthContext picks it up via onAuthStateChange.

import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import styles from './auth.module.css'

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/', { replace: true })
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const err = await login(email.trim(), password)
      if (err) {
        setError(err.message)
      } else {
        navigate('/', { replace: true })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>BOMB//SHIFT</div>
        <div className={styles.title}>Entrar</div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">E-mail</label>
            <input
              id="email"
              className={styles.input}
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Senha</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          </div>

          {error && <div className={styles.error} role="alert">{error}</div>}

          <button className={styles.submit} type="submit" disabled={busy || !email || !password}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className={styles.footer}>
          Não tem conta?{' '}
          <Link to="/auth/register">Criar conta</Link>
        </div>

        <Link to="/" className={styles.backLink}>← Voltar ao menu</Link>
      </div>
    </div>
  )
}
