// src/pages/auth/RegisterPage.tsx
// Registration form — email + password.
// The trigger handle_new_user() creates the profile automatically after sign-up.
// Supabase may require email confirmation depending on project settings.

import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import styles from './auth.module.css'

export function RegisterPage() {
  const { register, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/', { replace: true })
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    setBusy(true)
    try {
      const err = await register(email.trim(), password)
      if (err) {
        setError(err.message)
      } else {
        // Supabase may require email confirmation.
        // If auto-confirm is enabled, the user is immediately logged in
        // and AuthContext will redirect via onAuthStateChange.
        // If not, show a confirmation message.
        setSuccess(
          'Conta criada! Verifique seu e-mail para confirmar o cadastro antes de entrar.',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>BOMB//SHIFT</div>
        <div className={styles.title}>Criar conta</div>

        {success ? (
          <>
            <div className={styles.success} role="status">{success}</div>
            <div className={styles.footer} style={{ marginTop: 'var(--space-8)' }}>
              <Link to="/auth/login">Ir para o login</Link>
            </div>
          </>
        ) : (
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
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={busy}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="confirmPassword">Confirmar senha</label>
              <input
                id="confirmPassword"
                className={styles.input}
                type="password"
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                disabled={busy}
              />
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <button
              className={styles.submit}
              type="submit"
              disabled={busy || !email || !password || !confirmPassword}
            >
              {busy ? 'Criando conta…' : 'Criar conta'}
            </button>
          </form>
        )}

        <div className={styles.footer}>
          Já tem conta?{' '}
          <Link to="/auth/login">Entrar</Link>
        </div>

        <Link to="/" className={styles.backLink}>← Voltar ao menu</Link>
      </div>
    </div>
  )
}
