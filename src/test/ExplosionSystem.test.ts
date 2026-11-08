// src/test/ExplosionSystem.test.ts
// Unit tests for the pure explosion resolver.
// No Phaser instantiation needed — resolveExplosion operates on plain data.

import { describe, expect, it } from 'vitest'
import { resolveExplosion } from '@/game/systems/ExplosionSystem'
import { CellType } from '@/game/types/GridTypes'
import type { ArenaState, GridCell } from '@/game/types/GridTypes'
import { BombState } from '@/game/entities/BombState'
import type { Bomb } from '@/game/entities/Bomb'
import type { Player } from '@/game/entities/Player'

// ─── Minimal stubs ────────────────────────────────────────────────────────────

function makeArena(overrides: Record<string, CellType> = {}): ArenaState {
  // 7×7 all-FLOOR arena (small enough for hand-crafted tests)
  const W = 7, H = 7
  const grid: GridCell[][] = Array.from({ length: H }, (_, gy) =>
    Array.from({ length: W }, (_, gx) => ({
      type: overrides[`${gx},${gy}`] ?? CellType.FLOOR,
      occupant: null,
    })),
  )
  return { grid, width: W, height: H }
}

function makeBomb(
  gridX: number,
  gridY: number,
  range: number,
  ownerId = 'p1',
): Bomb {
  const b = {
    gridX,
    gridY,
    range,
    ownerId,
    state: BombState.FUSING as BombState,
    chainTriggered: false,
    onDetonate: null as (() => void) | null,
    detonate() { b.state = BombState.DETONATING },
    markDone() { b.state = BombState.DONE },
    update: () => {},
  }
  return b as unknown as Bomb
}

function makePlayer(gridX: number, gridY: number, playerId = 'p1'): Player {
  return { gridX, gridY, playerId, isAlive: true } as unknown as Player
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ExplosionSystem — resolveExplosion', () => {

  it('explosion arm stops before a SOLID_WALL (wall not included in cells)', () => {
    // Layout: bomb at (3,3), range 3. Solid wall at (5,3) — one step to the right of (4,3).
    const arena = makeArena({ '5,3': CellType.SOLID_WALL })
    const bomb  = makeBomb(3, 3, 3)
    const result = resolveExplosion(bomb, arena, [], [])

    // Right arm should include (4,3) but NOT (5,3) or (6,3)
    const rightArmCells = result.cells.filter(c => c.gy === 3 && c.gx > 3)
    expect(rightArmCells.map(c => c.gx)).toEqual([4])
    // Wall cell must never appear
    expect(result.cells.find(c => c.gx === 5 && c.gy === 3)).toBeUndefined()
  })

  it('explosion arm destroys a DESTRUCTIBLE block and stops there', () => {
    // Bomb at (3,3), range 3. Destructible at (4,3).
    const arena = makeArena({ '4,3': CellType.DESTRUCTIBLE })
    const bomb  = makeBomb(3, 3, 3)
    const result = resolveExplosion(bomb, arena, [], [])

    // (4,3) is included and is the arm end
    const block = result.cells.find(c => c.gx === 4 && c.gy === 3)
    expect(block).toBeDefined()
    expect(block!.isArmEnd).toBe(true)

    // (5,3) must NOT be in cells — arm stopped at the block
    expect(result.cells.find(c => c.gx === 5 && c.gy === 3)).toBeUndefined()

    // Block must appear in destroyedBlocks
    expect(result.destroyedBlocks).toContainEqual({ gx: 4, gy: 3 })
  })

  it('chain reaction: a second bomb in the blast zone is also detonated', () => {
    // Bomb A at (1,3), range 3. Bomb B at (3,3) (FLOOR, inside arm).
    const arena  = makeArena()
    const bombA  = makeBomb(1, 3, 3)
    const bombB  = makeBomb(3, 3, 2)
    const result = resolveExplosion(bombA, arena, [bombA, bombB], [])

    // BombB should have been chain-triggered
    expect(bombB.chainTriggered).toBe(true)
    // chainCount should be at least 1
    expect(result.chainCount).toBeGreaterThanOrEqual(1)
    // Cells from bomb B's explosion should be in the result (e.g. (3,1), (3,5))
    expect(result.cells.some(c => c.gx === 3)).toBe(true)
  })

  it('chain reaction does not loop infinitely (detonating Set prevents cycles)', () => {
    // Two bombs adjacent to each other — each would chain the other.
    const arena = makeArena()
    const bombA = makeBomb(2, 3, 3)
    const bombB = makeBomb(3, 3, 3)
    // Should complete without stack overflow
    expect(() =>
      resolveExplosion(bombA, arena, [bombA, bombB], []),
    ).not.toThrow()
  })

  it('player in blast zone is recorded as hit', () => {
    const arena  = makeArena()
    const bomb   = makeBomb(3, 3, 2)
    // Player standing at (3, 4) — one step below the bomb
    const player = makePlayer(3, 4)
    const result = resolveExplosion(bomb, arena, [bomb], [player])

    expect(result.hitPlayers).toContain(player)
  })

  it('player outside blast zone is not hit', () => {
    const arena  = makeArena()
    const bomb   = makeBomb(3, 3, 1)  // range 1 — reaches only adjacent cells
    // Player at (3, 6) — 3 steps away, outside range
    const player = makePlayer(3, 6)
    const result = resolveExplosion(bomb, arena, [bomb], [player])

    expect(result.hitPlayers).not.toContain(player)
  })
})
