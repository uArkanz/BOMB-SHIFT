// src/test/PvPDamage.test.ts
// Tests for cross-player damage in 1v1 mode.
// Verifies that any bomb can hit any player, not just its owner.
// Uses pure ExplosionSystem + Player stubs — no Phaser.

import { describe, expect, it } from 'vitest'
import { resolveExplosion } from '@/game/systems/ExplosionSystem'
import { CellType } from '@/game/types/GridTypes'
import type { ArenaState, GridCell } from '@/game/types/GridTypes'
import { BombState } from '@/game/entities/BombState'
import type { Bomb } from '@/game/entities/Bomb'
import type { Player } from '@/game/entities/Player'

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeArena(overrides: Record<string, CellType> = {}): ArenaState {
  const W = 13, H = 13
  const grid: GridCell[][] = Array.from({ length: H }, (_, gy) =>
    Array.from({ length: W }, (_, gx) => {
      const isBorder = gx === 0 || gy === 0 || gx === W - 1 || gy === H - 1
      const isEvenEven = gx % 2 === 0 && gy % 2 === 0
      const defaultType = isBorder || isEvenEven ? CellType.SOLID_WALL : CellType.FLOOR
      return { type: overrides[`${gx},${gy}`] ?? defaultType, occupant: null }
    }),
  )
  return { grid, width: W, height: H }
}

function makeBomb(gridX: number, gridY: number, range: number, ownerId: string): Bomb {
  const b = {
    gridX, gridY, range, ownerId,
    state: BombState.FUSING as BombState,
    chainTriggered: false,
    onDetonate: null as (() => void) | null,
    detonate() { b.state = BombState.DETONATING },
    markDone() { b.state = BombState.DONE },
    update: () => {},
  }
  return b as unknown as Bomb
}

function makePlayer(gridX: number, gridY: number, playerId: string): Player {
  return { gridX, gridY, playerId, isAlive: true } as unknown as Player
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('PvP cross-player damage (ExplosionSystem)', () => {

  it("P1's bomb hits P2 when P2 is in the blast zone", () => {
    const arena = makeArena()
    // P1 at (1,1), P2 at (3,1) — same row, within range 3
    const p1 = makePlayer(1, 1, 'p1')
    const p2 = makePlayer(3, 1, 'p2')
    const bomb = makeBomb(1, 1, 3, 'p1')  // P1's bomb

    const result = resolveExplosion(bomb, arena, [bomb], [p1, p2])

    // P2 must be in the hit list
    expect(result.hitPlayers.map(p => p.playerId)).toContain('p2')
  })

  it("P2's bomb hits P1 when P1 is in the blast zone", () => {
    const arena = makeArena()
    const p1 = makePlayer(3, 1, 'p1')
    const p2 = makePlayer(1, 1, 'p2')
    const bomb = makeBomb(1, 1, 3, 'p2')  // P2's bomb

    const result = resolveExplosion(bomb, arena, [bomb], [p1, p2])

    expect(result.hitPlayers.map(p => p.playerId)).toContain('p1')
  })

  it('P1 bomb hits both players (simultaneous death → draw)', () => {
    const arena = makeArena()
    // Both players close to the bomb
    const p1 = makePlayer(1, 1, 'p1')
    const p2 = makePlayer(3, 1, 'p2')
    const bomb = makeBomb(1, 1, 4, 'p1')

    const result = resolveExplosion(bomb, arena, [bomb], [p1, p2])

    const hitIds = result.hitPlayers.map(p => p.playerId)
    expect(hitIds).toContain('p1')
    expect(hitIds).toContain('p2')
  })

  it('player behind a solid wall is NOT hit', () => {
    // P1 bomb at (1,1) range 3, P2 at (3,1).
    // (2,1): gx=2 gy=1 — even-odd → not a wall by default. Override to solid wall.
    const arenaWithWall = makeArena({ '2,1': CellType.SOLID_WALL })
    const p1 = makePlayer(1, 1, 'p1')
    const p2 = makePlayer(3, 1, 'p2')
    const bomb = makeBomb(1, 1, 3, 'p1')

    const result = resolveExplosion(bomb, arenaWithWall, [bomb], [p1, p2])

    // P2 is behind the wall — must NOT be hit
    expect(result.hitPlayers.map(p => p.playerId)).not.toContain('p2')
  })

  it('player out of range is NOT hit', () => {
    const arena = makeArena()
    const p1 = makePlayer(1, 1, 'p1')
    const p2 = makePlayer(7, 1, 'p2')   // 6 tiles away
    const bomb = makeBomb(1, 1, 2, 'p1')  // range 2 only

    const result = resolveExplosion(bomb, arena, [bomb], [p1, p2])

    expect(result.hitPlayers.map(p => p.playerId)).not.toContain('p2')
  })
})

// ─── Draw determination ────────────────────────────────────────────────────────

describe('PvP winner determination (mirrors GameScene.checkPvPGameOver)', () => {
  function determineOutcome(p1Alive: boolean, p2Alive: boolean) {
    const p1Dead = !p1Alive, p2Dead = !p2Alive
    if (!p1Dead && !p2Dead) return null
    const winner = p1Dead && p2Dead ? undefined : p1Dead ? 'p2' : 'p1'
    const result = p1Dead && p2Dead ? 'draw' : 'win'
    return { winner, result }
  }

  it('p1 dies → p2 wins', () => {
    expect(determineOutcome(false, true)).toEqual({ winner: 'p2', result: 'win' })
  })

  it('p2 dies → p1 wins', () => {
    expect(determineOutcome(true, false)).toEqual({ winner: 'p1', result: 'win' })
  })

  it('simultaneous death → draw', () => {
    expect(determineOutcome(false, false)).toEqual({ winner: undefined, result: 'draw' })
  })

  it('both alive → no event', () => {
    expect(determineOutcome(true, true)).toBeNull()
  })
})
