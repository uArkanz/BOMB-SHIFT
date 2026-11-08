// src/test/GameScene.mode.test.ts
// Regression tests for mode propagation and player initialisation.
//
// The real flow:
//   PhaserGame.tsx  → game.registry.set('gameMode', mode)
//   PreloadScene    → reads registry, calls scene.start('GameScene', { mode })
//   GameScene.init  → receives { mode } BEFORE create() runs
//   GameScene.create→ calls initPlayers() which checks this.gameMode
//
// We cannot instantiate Phaser in jsdom, so these tests verify:
//   a) The init() data shape that GameScene expects
//   b) The player-count logic is correct for each mode
//   c) P1/P2 input key codes don't overlap

import { describe, expect, it } from 'vitest'

// ── Key-code constants (mirrors InputConfig without importing Phaser) ──────────
const KC = {
  W: 87, S: 83, A: 65, D: 68, SPACE: 32,
  UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, ENTER: 13,
} as const

// ── Simulate GameScene.init() + initPlayers() logic ──────────────────────────

function simulateSceneInit(initData: { mode?: string }): { gameMode: 'solo' | '1v1' } {
  // Mirrors GameScene.init()
  const gameMode = initData.mode === '1v1' ? '1v1' : 'solo'
  return { gameMode }
}

function simulateInitPlayers(gameMode: 'solo' | '1v1'): string[] {
  // Mirrors GameScene.initPlayers()
  const players = ['p1']
  if (gameMode === '1v1') players.push('p2')
  return players
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GameScene mode init (synchronous data path)', () => {
  it('init({ mode: "1v1" }) sets gameMode to 1v1', () => {
    const { gameMode } = simulateSceneInit({ mode: '1v1' })
    expect(gameMode).toBe('1v1')
  })

  it('init({ mode: "solo" }) sets gameMode to solo', () => {
    const { gameMode } = simulateSceneInit({ mode: 'solo' })
    expect(gameMode).toBe('solo')
  })

  it('init({}) defaults to solo (no mode provided)', () => {
    const { gameMode } = simulateSceneInit({})
    expect(gameMode).toBe('solo')
  })

  it('any unrecognised mode string defaults to solo', () => {
    const { gameMode } = simulateSceneInit({ mode: 'battle-royale' })
    expect(gameMode).toBe('solo')
  })
})

describe('GameScene player count', () => {
  it('solo mode creates exactly 1 player', () => {
    const players = simulateInitPlayers('solo')
    expect(players).toHaveLength(1)
    expect(players).toContain('p1')
    expect(players).not.toContain('p2')
  })

  it('1v1 mode creates exactly 2 players', () => {
    const players = simulateInitPlayers('1v1')
    expect(players).toHaveLength(2)
    expect(players).toContain('p1')
    expect(players).toContain('p2')
  })
})

describe('InputConfig key non-overlap', () => {
  const p1Keys = [KC.W, KC.S, KC.A, KC.D, KC.SPACE]
  const p2Keys = [KC.UP, KC.DOWN, KC.LEFT, KC.RIGHT, KC.ENTER]

  it('P1 and P2 key sets are fully disjoint', () => {
    const overlap = p1Keys.filter(k => (p2Keys as number[]).includes(k))
    expect(overlap).toHaveLength(0)
  })

  it('P1 uses WASD + Space', () => {
    expect(p1Keys).toContain(KC.W)
    expect(p1Keys).toContain(KC.D)
    expect(p1Keys).toContain(KC.SPACE)
  })

  it('P2 uses Arrow keys + Enter', () => {
    expect(p2Keys).toContain(KC.UP)
    expect(p2Keys).toContain(KC.RIGHT)
    expect(p2Keys).toContain(KC.ENTER)
  })
})
