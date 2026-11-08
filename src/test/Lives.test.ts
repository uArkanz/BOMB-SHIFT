// src/test/Lives.test.ts
// Unit tests for the lives system.
// - Solo: 3 lives, takeDamage decrements, game over at 0
// - 1v1: 1 life, takeDamage kills immediately
// - Invincibility: takeDamage is a no-op while invincibleMs > 0
// - HUD: lives value in PLAYER_STATS_CHANGED event matches actual lives
// Uses Player stub (no Phaser) to test logic.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameEventBus, GameEvents } from '@/game/GameEventBus'

// ─── Minimal Player stub (pure logic, no Phaser) ─────────────────────────────

interface StubPlayer {
  playerId: string
  lives: number
  isAlive: boolean
  invincibleMs: number
  onDamaged: (() => void) | null
  takeDamage: () => void
  kill: () => void
  setStats: (partial: { lives?: number }) => void
  emitStats: () => void
  _die: () => void
  emittedStats: Array<{ lives: number }>
  emittedDied: string[]
}

function makeStubPlayer(playerId: string, initialLives: number): StubPlayer {
  const p: StubPlayer = {
    playerId,
    lives: initialLives,
    isAlive: true,
    invincibleMs: 0,
    onDamaged: null,
    emittedStats: [],
    emittedDied: [],

    setStats(partial) {
      if (partial.lives !== undefined) p.lives = partial.lives
      p.emitStats()
    },

    takeDamage() {
      if (!p.isAlive) return
      if (p.invincibleMs > 0) return
      p.lives = Math.max(0, p.lives - 1)
      p.emitStats()
      if (p.lives === 0) {
        p._die()
      } else {
        p.onDamaged?.()
      }
    },

    kill() {
      p._die()
    },

    _die() {
      p.isAlive = false
      p.emittedDied.push(p.playerId)
      GameEventBus.emit(GameEvents.PLAYER_DIED, { playerId: p.playerId })
    },

    emitStats() {
      p.emittedStats.push({ lives: p.lives })
      GameEventBus.emit(GameEvents.PLAYER_STATS_CHANGED, {
        playerId: p.playerId,
        activeBombs: 0,
        maxBombs: 1,
        bombRange: 2,
        lives: p.lives,
        shiftCooldownRemainingMs: 0,
        shiftCooldownMs: 10_000,
      })
    },
  }

  return p
}

// ─── Solo (3 lives) ──────────────────────────────────────────────────────────

describe('Solo lives system (3 lives)', () => {
  let p: ReturnType<typeof makeStubPlayer>

  beforeEach(() => {
    p = makeStubPlayer('p1', 3)
  })

  it('starts with 3 lives and isAlive=true', () => {
    expect(p.lives).toBe(3)
    expect(p.isAlive).toBe(true)
  })

  it('first hit: lives become 2, still alive', () => {
    p.takeDamage()
    expect(p.lives).toBe(2)
    expect(p.isAlive).toBe(true)
  })

  it('first hit: emits PLAYER_STATS_CHANGED with lives=2', () => {
    const received: number[] = []
    const unsub = GameEventBus.on(GameEvents.PLAYER_STATS_CHANGED, (e) => {
      if (e.playerId === 'p1') received.push(e.lives)
    })
    p.takeDamage()
    unsub()
    expect(received).toContain(2)
  })

  it('first hit: calls onDamaged (triggers respawn in GameScene)', () => {
    const respawn = vi.fn()
    p.onDamaged = respawn
    p.takeDamage()
    expect(respawn).toHaveBeenCalledOnce()
  })

  it('second hit: lives become 1, still alive', () => {
    p.takeDamage()
    p.takeDamage()
    expect(p.lives).toBe(1)
    expect(p.isAlive).toBe(true)
  })

  it('third hit: lives become 0, isAlive=false (game over)', () => {
    p.takeDamage()
    p.takeDamage()
    p.takeDamage()
    expect(p.lives).toBe(0)
    expect(p.isAlive).toBe(false)
  })

  it('third hit: emits PLAYER_DIED', () => {
    const died: string[] = []
    const unsub = GameEventBus.on(GameEvents.PLAYER_DIED, (e) => died.push(e.playerId))
    p.takeDamage()
    p.takeDamage()
    p.takeDamage()
    unsub()
    expect(died).toContain('p1')
  })

  it('third hit: does NOT call onDamaged (already dead)', () => {
    const respawn = vi.fn()
    p.onDamaged = respawn
    p.takeDamage()
    p.takeDamage()
    p.takeDamage()
    // onDamaged only called on first two hits (lives > 0), not on third
    expect(respawn).toHaveBeenCalledTimes(2)
  })

  it('takeDamage is no-op when invincibleMs > 0', () => {
    p.invincibleMs = 1000
    p.takeDamage()
    expect(p.lives).toBe(3)
    expect(p.isAlive).toBe(true)
  })

  it('takeDamage is no-op after death (isAlive=false)', () => {
    p.takeDamage(); p.takeDamage(); p.takeDamage()  // dead
    const livesBefore = p.lives
    p.takeDamage()  // should no-op
    expect(p.lives).toBe(livesBefore)
  })
})

// ─── 1v1 (1 life = instant elimination) ──────────────────────────────────────

describe('1v1 lives system (1 life — instant elimination)', () => {
  let p: ReturnType<typeof makeStubPlayer>

  beforeEach(() => {
    p = makeStubPlayer('p1', 1)
  })

  it('starts with 1 life', () => {
    expect(p.lives).toBe(1)
  })

  it('first hit: lives become 0, immediately dead', () => {
    p.takeDamage()
    expect(p.lives).toBe(0)
    expect(p.isAlive).toBe(false)
  })

  it('first hit: emits PLAYER_DIED', () => {
    const died: string[] = []
    const unsub = GameEventBus.on(GameEvents.PLAYER_DIED, (e) => died.push(e.playerId))
    p.takeDamage()
    unsub()
    expect(died).toContain('p1')
  })

  it('first hit: does NOT call onDamaged (lives hit 0 immediately)', () => {
    const respawn = vi.fn()
    p.onDamaged = respawn
    p.takeDamage()
    expect(respawn).not.toHaveBeenCalled()
  })
})

// ─── 1v1 draw detection ───────────────────────────────────────────────────────

describe('1v1 draw detection (both players at 1 life)', () => {
  function determineOutcome(p1Alive: boolean, p2Alive: boolean) {
    const p1Dead = !p1Alive, p2Dead = !p2Alive
    if (!p1Dead && !p2Dead) return null
    const winner = p1Dead && p2Dead ? undefined : p1Dead ? 'p2' : 'p1'
    const result = p1Dead && p2Dead ? 'draw' : 'win'
    return { winner, result }
  }

  it('p1 dies first → p2 wins', () => {
    const p1 = makeStubPlayer('p1', 1)
    const p2 = makeStubPlayer('p2', 1)
    p1.takeDamage()
    expect(determineOutcome(p1.isAlive, p2.isAlive)).toEqual({ winner: 'p2', result: 'win' })
  })

  it('both die simultaneously → draw', () => {
    const p1 = makeStubPlayer('p1', 1)
    const p2 = makeStubPlayer('p2', 1)
    p1.takeDamage()
    p2.takeDamage()
    expect(determineOutcome(p1.isAlive, p2.isAlive)).toEqual({ winner: undefined, result: 'draw' })
  })
})
