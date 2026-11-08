// src/pages/PreMatchPage.tsx
// Pre-match screen for 1v1 mode.
// Collects Player 2 guest name (required, 1–20 chars) and shows a
// "results not saved" warning if Player 1 is a guest.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import styles from './PreMatchPage.module.css'

const MIN_LEN = 1
const MAX_LEN = 20

export function PreMatchPage() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [p2Name, setP2Name] = useState('')
  const [touched, setTouched] = useState(false)

  const trimmed = p2Name.trim()
  const isValid = trimmed.length >= MIN_LEN && trimmed.length <= MAX_LEN

  function handleStart() {
    setTouched(true)
    if (!isValid) return
    navigate('/play/1v1', { state: { player2Name: trimmed } })
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        <button className={styles.backLink} onClick={() => navigate('/play')}>
          ← Voltar
        </button>

        <header className={styles.heading}>
          <h1 className={styles.title}>1 CONTRA 1 LOCAL</h1>
          <p className={styles.subtitle}>Configure a partida antes de iniciar</p>
        </header>

        {!isAuthenticated && (
          <div className={styles.guestWarning}>
            ⚠️ <strong>Resultados não serão salvos</strong> — faça login para participar do ranking
          </div>
        )}

        <section className={styles.section}>
          <label className={styles.label} htmlFor="p2name">
            Nome do Jogador 2
          </label>
          <input
            id="p2name"
            className={styles.input}
            type="text"
            value={p2Name}
            maxLength={MAX_LEN}
            placeholder="ex: Jogador 2"
            autoFocus
            onChange={e => setP2Name(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
          />
          {touched && !isValid && (
            <p className={styles.error}>
              {trimmed.length === 0
                ? 'Nome obrigatório'
                : `Máximo ${MAX_LEN} caracteres`}
            </p>
          )}
          <p className={styles.hint}>{trimmed.length} / {MAX_LEN}</p>
        </section>

        <button
          className={styles.startBtn}
          disabled={touched && !isValid}
          onClick={handleStart}
        >
          INICIAR PARTIDA
        </button>

      </div>
    </div>
  )
}
