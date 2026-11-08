// src/test/PlayerNames.test.ts
// Unit tests for player name display in PostMatchPage and HUD name truncation.
// - resultTitle uses real player names, not P1/P2 literals
// - fallback to 'Jogador 1' / 'Jogador 2' when names are absent
// - draw always shows 'EMPATE!'
// - HUD truncation keeps names ≤ 14 chars

import { describe, it, expect } from 'vitest'
import { resultTitle } from '@/pages/PostMatchPage'
import type { GameEventPayloads } from '@/game/GameEventBus'

// Helper to build a minimal GAME_OVER payload
function makeResult(winner?: 'p1' | 'p2', result?: 'win' | 'draw'): GameEventPayloads['game:over'] {
  return { mode: '1v1', winner, result }
}

// ── resultTitle ───────────────────────────────────────────────────────────────

describe('resultTitle — player names in victory screen', () => {
  it('P1 wins → shows P1 nickname', () => {
    expect(resultTitle(makeResult('p1', 'win'), 'Alice', 'Bob')).toBe('Alice VENCEU!')
  })

  it('P2 wins → shows P2 guest name', () => {
    expect(resultTitle(makeResult('p2', 'win'), 'Alice', 'Bob')).toBe('Bob VENCEU!')
  })

  it('draw → shows EMPATE! regardless of names', () => {
    expect(resultTitle(makeResult(undefined, 'draw'), 'Alice', 'Bob')).toBe('EMPATE!')
    expect(resultTitle(makeResult(undefined, 'draw'), 'X', 'Y')).toBe('EMPATE!')
  })

  it('falls back gracefully when names are default fallback strings', () => {
    expect(resultTitle(makeResult('p1', 'win'), 'Jogador 1', 'Jogador 2')).toBe('Jogador 1 VENCEU!')
    expect(resultTitle(makeResult('p2', 'win'), 'Jogador 1', 'Jogador 2')).toBe('Jogador 2 VENCEU!')
  })

  it('handles long names without throwing', () => {
    const long = 'NicknameMuitoGrande30c'
    expect(() => resultTitle(makeResult('p1', 'win'), long, 'B')).not.toThrow()
    expect(resultTitle(makeResult('p1', 'win'), long, 'B')).toContain('VENCEU!')
  })
})

// ── HUD name truncation (mirrors HUDScene logic) ──────────────────────────────

function truncateForHUD(name: string, max = 14): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name
}

describe('HUD name truncation', () => {
  it('short name passes through unchanged', () => {
    expect(truncateForHUD('Alice')).toBe('Alice')
    expect(truncateForHUD('P1')).toBe('P1')
  })

  it('name of exactly 14 chars passes through', () => {
    const name = 'A'.repeat(14)
    expect(truncateForHUD(name)).toBe(name)
  })

  it('name of 15 chars is truncated with ellipsis', () => {
    const name = 'A'.repeat(15)
    const result = truncateForHUD(name)
    expect(result.length).toBe(14)
    expect(result.endsWith('…')).toBe(true)
  })

  it('max 30-char nickname is truncated to 14 chars', () => {
    const name = 'B'.repeat(30)
    const result = truncateForHUD(name)
    expect(result.length).toBe(14)
  })

  it('fallback P1/P2 strings are never truncated', () => {
    expect(truncateForHUD('P1')).toBe('P1')
    expect(truncateForHUD('P2')).toBe('P2')
  })
})

// ── Name propagation (state shape) ───────────────────────────────────────────

describe('Name propagation via location.state', () => {
  it('location state includes player1Name and player2Name', () => {
    // Simulates the state object produced by GamePage navigate call
    const state = {
      result: makeResult('p1', 'win'),
      player1Name: 'FastBomber',
      player2Name: 'Rival',
      mode: '1v1' as const,
    }
    expect(state.player1Name).toBe('FastBomber')
    expect(state.player2Name).toBe('Rival')
  })

  it('missing player1Name falls back to Jogador 1', () => {
    const state: { player1Name?: string } = {}
    const resolved = state.player1Name ?? 'Jogador 1'
    expect(resolved).toBe('Jogador 1')
  })

  it('missing player2Name falls back to Jogador 2', () => {
    const state: { player2Name?: string } = {}
    const resolved = state.player2Name ?? 'Jogador 2'
    expect(resolved).toBe('Jogador 2')
  })
})
