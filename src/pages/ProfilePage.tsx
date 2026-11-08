// src/pages/ProfilePage.tsx
// Authenticated user profile: nickname editor, personal bests, match history.
// Nickname update writes to public.profiles via supabase-js (RLS: user can update own row).
// Match history is fetched directly from solo_matches and pvp_matches.
// Edge Functions for recording results are not yet deployed — history may be empty.

import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { SoloMatchRow, PvpMatchRow } from '@/lib/database.types'
import styles from './ProfilePage.module.css'

// ── Nickname validation ───────────────────────────────────────────────────────

const NICK_MIN = 3
const NICK_MAX = 30

/** Returns an error message, or null if valid. */
export function validateNickname(name: string): string | null {
  const t = name.trim()
  if (t.length < NICK_MIN) return `Mínimo de ${NICK_MIN} caracteres.`
  if (t.length > NICK_MAX) return `Máximo de ${NICK_MAX} caracteres.`
  return null
}

// ── History types ─────────────────────────────────────────────────────────────

type HistoryEntry =
  | { kind: 'solo'; row: SoloMatchRow }
  | { kind: 'pvp';  row: PvpMatchRow  }

// ── ProfilePage ───────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user, profile, isAuthenticated, loading, refreshProfile } = useAuth()

  // Redirect guests to login
  if (!loading && !isAuthenticated) return <Navigate to="/auth/login" replace />

  if (loading || !profile) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.loading}>Carregando perfil…</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to="/" className={styles.back}>← Voltar ao menu</Link>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.avatar}>👤</div>
          <div>
            <div className={styles.username}>{profile.username}</div>
            <div className={styles.since}>
              Membro desde {new Date(profile.created_at).toLocaleDateString('pt-BR')}
            </div>
          </div>
        </div>

        {/* Nickname editor */}
        <NicknameEditor
          currentUsername={profile.username}
          userId={user!.id}
          onSaved={refreshProfile}
        />

        {/* Match history */}
        <MatchHistory userId={user!.id} />
      </div>
    </div>
  )
}

// ── NicknameEditor ────────────────────────────────────────────────────────────

function NicknameEditor({
  currentUsername,
  userId,
  onSaved,
}: {
  currentUsername: string
  userId: string
  onSaved: () => Promise<void>
}) {
  const [value, setValue] = useState(currentUsername)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const handleSave = useCallback(async () => {
    const trimmed = value.trim()
    const err = validateNickname(trimmed)
    if (err) { setMsg({ kind: 'error', text: err }); return }
    if (trimmed === currentUsername) { setMsg({ kind: 'success', text: 'Sem alterações.' }); return }

    setSaving(true)
    setMsg(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username: trimmed })
        .eq('id', userId)

      if (error) {
        // Postgres unique violation code: 23505
        if (error.code === '23505' || error.message.toLowerCase().includes('unique')) {
          setMsg({ kind: 'error', text: 'Este nickname já está em uso. Escolha outro.' })
        } else {
          setMsg({ kind: 'error', text: `Erro ao salvar: ${error.message}` })
        }
        return
      }

      await onSaved()
      setMsg({ kind: 'success', text: 'Nickname atualizado com sucesso!' })
    } finally {
      setSaving(false)
    }
  }, [value, currentUsername, userId, onSaved])

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Alterar Nickname</div>
      <div className={styles.nicknameForm}>
        <div className={styles.inputRow}>
          <input
            className={styles.input}
            value={value}
            maxLength={NICK_MAX}
            onChange={(e) => { setValue(e.target.value); setMsg(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
            aria-label="Novo nickname"
          />
          <button
            className={styles.saveBtn}
            onClick={() => void handleSave()}
            disabled={saving || value.trim() === currentUsername}
          >
            {saving ? '…' : 'Salvar'}
          </button>
        </div>
        <div className={styles.hint}>
          {NICK_MIN}–{NICK_MAX} caracteres. Sem diferenciação de maiúsculas/minúsculas.
        </div>
        {msg && (
          <div className={msg.kind === 'error' ? styles.msgError : styles.msgSuccess}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  )
}

// ── MatchHistory ──────────────────────────────────────────────────────────────

function MatchHistory({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    void (async () => {
      const [soloRes, pvpRes] = await Promise.all([
        supabase
          .from('solo_matches')
          .select('*')
          .eq('player_id', userId)
          .order('played_at', { ascending: false })
          .limit(10),
        supabase
          .from('pvp_matches')
          .select('*')
          .eq('player1_id', userId)
          .order('played_at', { ascending: false })
          .limit(10),
      ])

      if (!mounted) return

      const combined: HistoryEntry[] = [
        ...((soloRes.data as SoloMatchRow[]) ?? []).map(r => ({ kind: 'solo' as const, row: r })),
        ...((pvpRes.data as PvpMatchRow[])   ?? []).map(r => ({ kind: 'pvp'  as const, row: r })),
      ]

      // Sort all entries by played_at descending, keep last 10
      combined.sort((a, b) =>
        new Date(b.row.played_at).getTime() - new Date(a.row.played_at).getTime()
      )

      setEntries(combined.slice(0, 10))
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [userId])

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Últimas 10 Partidas</div>
      {loading && <div className={styles.historyEmpty}>Carregando…</div>}
      {!loading && entries.length === 0 && (
        <div className={styles.historyEmpty}>
          Nenhuma partida registrada ainda.<br />
          As Edge Functions de resultados ainda estão em desenvolvimento.
        </div>
      )}
      {!loading && entries.length > 0 && (
        <div className={styles.historyList}>
          {entries.map((e) => (
            <HistoryEntry key={e.row.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  )
}

function HistoryEntry({ entry }: { entry: HistoryEntry }) {
  const date = new Date(entry.row.played_at).toLocaleDateString('pt-BR')

  if (entry.kind === 'solo') {
    const r = entry.row
    return (
      <div className={styles.historyItem}>
        <div className={styles.historyLeft}>
          <span className={styles.historyMode}>Solo</span>
          <span className={styles.historyMain}>
            Score: {r.score.toLocaleString('pt-BR')} · Onda {r.waves_survived}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span className={`${styles.badge} ${styles.badgeSolo}`}>SOLO</span>
          <span className={styles.historyDate}>{date}</span>
        </div>
      </div>
    )
  }

  // PvP
  const r = entry.row
  const badgeClass =
    r.result === 'win'  ? styles.badgeWin  :
    r.result === 'draw' ? styles.badgeDraw :
                          styles.badgeLoss
  const label =
    r.result === 'win'  ? 'VITÓRIA' :
    r.result === 'draw' ? 'EMPATE'  :
                          'DERROTA'

  return (
    <div className={styles.historyItem}>
      <div className={styles.historyLeft}>
        <span className={styles.historyMode}>1v1 vs {r.player2_name}</span>
        <span className={styles.historyMain}>
          {r.duration_seconds}s
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span className={`${styles.badge} ${badgeClass}`}>{label}</span>
        <span className={styles.historyDate}>{date}</span>
      </div>
    </div>
  )
}
