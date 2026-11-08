// src/test/ST10.test.ts
// Unit tests for ST-10 game modes orchestration.
// Tests pure logic: draw detection, result type guards, score formatting.
// No Phaser or DOM instantiation.

import { describe, expect, it } from 'vitest'
import { isSoloResult } from '@/game/modes/SoloGameMode'
import { isPvPResult } from '@/game/modes/PvPGameMode'

// ─── Type guards ──────────────────────────────────────────────────────────────

describe('SoloGameMode type guard', () => {
  it('recognises a solo result payload', () => {
    const payload = {
      mode: 'solo',
      score: 1500,
      wavesReached: 3,
      kills: 12,
      totalDurationSeconds: 90,
      waveDurations: [30, 25, 35],
    }
    expect(isSoloResult(payload)).toBe(true)
  })

  it('rejects a 1v1 payload', () => {
    expect(isSoloResult({ mode: '1v1', result: 'win', winner: 'p1', durationSeconds: 60 })).toBe(false)
  })

  it('rejects null and primitives', () => {
    expect(isSoloResult(null)).toBe(false)
    expect(isSoloResult(42)).toBe(false)
    expect(isSoloResult(undefined)).toBe(false)
  })
})

describe('PvPGameMode type guard', () => {
  it('recognises a 1v1 win result', () => {
    const payload = { mode: '1v1', winner: 'p1', result: 'win', durationSeconds: 60 }
    expect(isPvPResult(payload)).toBe(true)
  })

  it('recognises a draw result', () => {
    const payload = { mode: '1v1', result: 'draw', durationSeconds: 45 }
    expect(isPvPResult(payload)).toBe(true)
  })

  it('rejects a solo payload', () => {
    expect(isPvPResult({ mode: 'solo', score: 100 })).toBe(false)
  })
})

// ─── Draw detection logic (mirrors GameScene.checkPvPGameOver) ────────────────

describe('PvP draw detection logic', () => {
  /**
   * Mirrors the exact logic in GameScene.checkPvPGameOver().
   * Both players die in the same frame → result is 'draw', no winner.
   */
  function determineOutcome(p1Alive: boolean, p2Alive: boolean) {
    const p1Dead = !p1Alive
    const p2Dead = !p2Alive
    if (!p1Dead && !p2Dead) return null  // both alive — no event
    const winner = p1Dead && p2Dead ? undefined : p1Dead ? 'p2' : 'p1'
    const result = p1Dead && p2Dead ? 'draw' : 'win'
    return { winner, result }
  }

  it('p1 dies → p2 wins', () => {
    const outcome = determineOutcome(false, true)
    expect(outcome?.winner).toBe('p2')
    expect(outcome?.result).toBe('win')
  })

  it('p2 dies → p1 wins', () => {
    const outcome = determineOutcome(true, false)
    expect(outcome?.winner).toBe('p1')
    expect(outcome?.result).toBe('win')
  })

  it('both die same frame → draw, no winner', () => {
    const outcome = determineOutcome(false, false)
    expect(outcome?.result).toBe('draw')
    expect(outcome?.winner).toBeUndefined()
  })

  it('both alive → no event emitted', () => {
    const outcome = determineOutcome(true, true)
    expect(outcome).toBeNull()
  })
})

// ─── PreMatchPage validation logic ───────────────────────────────────────────

describe('PreMatchPage P2 name validation', () => {
  const MIN_LEN = 1
  const MAX_LEN = 20

  function isValidName(name: string): boolean {
    const t = name.trim()
    return t.length >= MIN_LEN && t.length <= MAX_LEN
  }

  it('accepts a normal name', () => {
    expect(isValidName('Jogador 2')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidName('')).toBe(false)
  })

  it('rejects whitespace-only', () => {
    expect(isValidName('   ')).toBe(false)
  })

  it('rejects name over 20 characters', () => {
    expect(isValidName('A'.repeat(21))).toBe(false)
  })

  it('accepts exactly 20 characters', () => {
    expect(isValidName('A'.repeat(20))).toBe(true)
  })

  it('accepts single character', () => {
    expect(isValidName('X')).toBe(true)
  })
})
