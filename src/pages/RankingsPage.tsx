// src/pages/RankingsPage.tsx
// Two-tab rankings: Solo (best score) and 1v1 (win count).
// Data comes from solo_rankings() and pvp_rankings() Supabase RPCs.
// The authenticated user's row is highlighted regardless of position.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRankings } from '@/hooks/useRankings'
import { useAuth } from '@/hooks/useAuth'
import type { SoloRankingRow, PvpRankingRow } from '@/lib/database.types'
import styles from './RankingsPage.module.css'

type Tab = 'solo' | '1v1'

const MEDALS = ['🥇', '🥈', '🥉']

export function RankingsPage() {
  const [tab, setTab] = useState<Tab>('solo')
  const { solo, pvp, loading, error, refresh } = useRankings()
  const { user } = useAuth()

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to="/" className={styles.back}>← Voltar ao menu</Link>
        <div className={styles.title}>🏆 Rankings</div>

        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'solo'}
            className={`${styles.tab} ${tab === 'solo' ? styles.tabActive : ''}`}
            onClick={() => setTab('solo')}
          >
            Solo
          </button>
          <button
            role="tab"
            aria-selected={tab === '1v1'}
            className={`${styles.tab} ${tab === '1v1' ? styles.tabActive : ''}`}
            onClick={() => setTab('1v1')}
          >
            1v1 Local
          </button>
        </div>

        {loading && <div className={styles.loading}>Carregando…</div>}

        {!loading && error && (
          <div className={styles.error}>
            {error}
            <br />
            <button className={styles.refreshBtn} onClick={refresh}>Tentar novamente</button>
          </div>
        )}

        {!loading && !error && tab === 'solo' && (
          <SoloTable rows={solo} currentUserId={user?.id} />
        )}

        {!loading && !error && tab === '1v1' && (
          <PvpTable rows={pvp} currentUserId={user?.id} />
        )}
      </div>
    </div>
  )
}

// ── Solo table ────────────────────────────────────────────────────────────────

function SoloTable({ rows, currentUserId }: { rows: SoloRankingRow[]; currentUserId?: string }) {
  if (rows.length === 0) {
    return (
      <div className={styles.empty}>
        Nenhuma partida Solo registrada ainda.<br />
        Complete uma partida para aparecer aqui.
      </div>
    )
  }

  return (
    <table className={styles.table} aria-label="Classificação Solo">
      <thead>
        <tr>
          <th>#</th>
          <th>Jogador</th>
          <th>Melhor Score</th>
          <th>Ondas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.player_id}
            className={row.player_id === currentUserId ? styles.ownRow : undefined}
          >
            <td className={styles.rankNum}>
              {i < 3 ? <span className={styles.medal}>{MEDALS[i]}</span> : i + 1}
            </td>
            <td>{row.username}</td>
            <td>{row.best_score.toLocaleString('pt-BR')}</td>
            <td>{row.best_run_waves}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── 1v1 table ─────────────────────────────────────────────────────────────────

function PvpTable({ rows, currentUserId }: { rows: PvpRankingRow[]; currentUserId?: string }) {
  if (rows.length === 0) {
    return (
      <>
        <div className={styles.empty}>
          Nenhum jogador com 5+ partidas 1v1 registradas ainda.<br />
          São necessárias 5 partidas completas para entrar no ranking.
        </div>
        <div className={styles.footnote}>
          ⓘ O ranking 1v1 reflete apenas o histórico do Jogador 1 (conta autenticada). O Jogador 2 é um convidado sem conta e não é contabilizado separadamente. Empates contam como 1 partida jogada, mas não como vitória.
        </div>
      </>
    )
  }

  return (
    <>
      <table className={styles.table} aria-label="Classificação 1v1">
        <thead>
          <tr>
            <th>#</th>
            <th>Jogador</th>
            <th>Vitórias</th>
            <th>Partidas</th>
            <th>Taxa de vitória</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.player1_id}
              className={row.player1_id === currentUserId ? styles.ownRow : undefined}
            >
              <td className={styles.rankNum}>
                {i < 3 ? <span className={styles.medal}>{MEDALS[i]}</span> : i + 1}
              </td>
              <td>{row.username}</td>
              <td>{row.win_count}</td>
              <td>{row.total_matches}</td>
              <td>{(row.win_rate * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.footnote}>
        ⓘ Mínimo de 5 partidas para aparecer no ranking 1v1. Empates contam como derrota para a taxa de vitória. Apenas o Jogador 1 (conta autenticada) é classificado.
      </div>
    </>
  )
}
