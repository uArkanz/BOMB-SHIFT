// src/pages/PostMatchPage.tsx
// Displayed after every match (solo or 1v1).
// If authenticated: submits result to Edge Function, shows loading/error/success.
// If guest: shows result + "create account" CTA.

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { GameEventPayloads } from '@/game/GameEventBus'
import type { SoloMatchInsert, PvpMatchInsert } from '@/lib/database.types'
import styles from './PostMatchPage.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationState {
  result: GameEventPayloads['game:over'] | null
  player1Name?: string
  player2Name?: string
  mode?: 'solo' | '1v1'
}

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error' | 'pending_deploy'

// ─── Component ────────────────────────────────────────────────────────────────

export function PostMatchPage() {
  const { isAuthenticated, session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const submitOnce = useRef(false)

  const state = (location.state ?? {}) as LocationState
  const result = state.result
  const player1Name = state.player1Name ?? 'Jogador 1'
  const player2Name = state.player2Name ?? 'Jogador 2'
  const mode = result?.mode ?? state.mode ?? 'solo'

  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')

  // ── Supabase submission ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !result || submitOnce.current) return
    submitOnce.current = true
    void submitResult()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, result])

  async function submitResult() {
    if (!session || !result) return
    setSubmitStatus('loading')
    try {
      if (result.mode === 'solo') {
        await submitSolo(result, session.access_token)
      } else {
        await submitPvp(result, player2Name, session.access_token)
      }
      setSubmitStatus('success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Treat "not yet deployed" as a known pending state rather than a hard error
      if (msg.includes('404') || msg.includes('not found') || msg.includes('pending_deploy')) {
        setSubmitStatus('pending_deploy')
      } else {
        setSubmitStatus('error')
      }
    }
  }

  async function handleRetry() {
    submitOnce.current = false
    setSubmitStatus('idle')
    await submitResult()
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function playAgain() {
    if (mode === '1v1') {
      navigate('/pre-match/1v1')
    } else {
      navigate('/play/solo')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!result) {
    // Landed here without a result (direct navigation) — go to menu
    navigate('/', { replace: true })
    return null
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* ── Result card ───────────────────────────────────────────────────── */}
        <div className={`${styles.resultCard} ${mode === '1v1' ? styles.pvp : styles.solo}`}>
          <h1 className={styles.title}>
            {mode === 'solo' ? 'PARTIDA ENCERRADA' : resultTitle(result, player1Name, player2Name)}
          </h1>

          {mode === 'solo' && (
            <div className={styles.stats}>
              <Stat label="Pontuação"  value={(result.score ?? 0).toLocaleString('pt-BR')} />
              <Stat label="Ondas"      value={String(result.wavesReached ?? 1)} />
              <Stat label="Abates"     value={String(result.kills ?? 0)} />
              <Stat label="Duração"    value={formatDuration(result.totalDurationSeconds)} />
            </div>
          )}

          {mode === '1v1' && (
            <div className={styles.stats}>
              <Stat label="Vencedor"  value={result.result === 'draw' ? 'EMPATE' : (result.winner === 'p1' ? player1Name : player2Name)} />
              <Stat label="Duração"   value={formatDuration(result.durationSeconds)} />
            </div>
          )}
        </div>

        {/* ── Submission status ─────────────────────────────────────────────── */}
        {isAuthenticated && (
          <div className={styles.submitStatus}>
            {submitStatus === 'loading'        && <span className={styles.loading}>Salvando resultado…</span>}
            {submitStatus === 'success'        && <span className={styles.saved}>✓ Resultado salvo</span>}
            {submitStatus === 'pending_deploy' && <span className={styles.pendingDeploy}>Registro online em desenvolvimento</span>}
            {submitStatus === 'error'          && (
              <span className={styles.error}>
                Erro ao salvar resultado
                <button className={styles.retryBtn} onClick={handleRetry}>Tentar novamente</button>
              </span>
            )}
          </div>
        )}

        {/* ── Guest CTA ────────────────────────────────────────────────────── */}
        {!isAuthenticated && (
          <div className={styles.guestCta}>
            <p>Crie uma conta para salvar sua pontuação e entrar no ranking</p>
            <Link to="/auth/register" className={styles.registerLink}>
              CRIAR CONTA
            </Link>
          </div>
        )}

        {/* ── Action buttons ─────────────────────────────────────────────── */}
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={playAgain}>
            JOGAR NOVAMENTE
          </button>
          <button className={styles.btnSecondary} onClick={() => navigate('/play')}>
            MODOS DE JOGO
          </button>
          <Link to="/rankings" className={styles.btnGhost}>
            VER RANKING
          </Link>
        </div>

      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Exported for unit testing. */
export function resultTitle(result: GameEventPayloads['game:over'], p1Name: string, p2Name: string): string {
  if (result.result === 'draw') return 'EMPATE!'
  return result.winner === 'p1' ? `${p1Name} VENCEU!` : `${p2Name} VENCEU!`
}

// ─── Submission helpers ───────────────────────────────────────────────────────

async function submitSolo(result: GameEventPayloads['game:over'], accessToken: string): Promise<void> {
  const payload: SoloMatchInsert = {
    match_uuid:            crypto.randomUUID(),
    player_id:             '',   // ignored by Edge Function — it reads from JWT
    score:                 result.score ?? 0,
    waves_survived:        result.wavesReached ?? 0,
    kills:                 result.kills ?? 0,
    total_duration_seconds: result.totalDurationSeconds ?? 1,
    wave_durations:        result.waveDurations ?? [],
    wave_numbers:          result.waveNumbers  ?? [],
    kills_per_wave:        result.killsPerWave ?? [],
  }

  const { error } = await supabase.functions.invoke('submit-solo-result', {
    body: payload,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (error) throw new Error(error.message)
}

async function submitPvp(
  result: GameEventPayloads['game:over'],
  player2Name: string,
  accessToken: string,
): Promise<void> {
  const payload: PvpMatchInsert = {
    match_uuid:       crypto.randomUUID(),
    player1_id:       '',   // ignored by Edge Function
    player2_name:     player2Name.slice(0, 20),
    result:           (result.result ?? 'draw') as 'win' | 'loss' | 'draw',
    duration_seconds: result.durationSeconds ?? 1,
  }

  const { error } = await supabase.functions.invoke('submit-pvp-result', {
    body: payload,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (error) throw new Error(error.message)
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}
