// src/test/ShiftSystem.test.ts
// Unit tests for the pure SHIFT teleport resolver.
// No Phaser instantiation — tryShift operates on plain data.

import { describe, expect, it } from 'vitest'
import { tryShift } from '@/game/systems/ShiftSystem'
import { CellType } from '@/game/types/GridTypes'
import type { ArenaState, GridCell } from '@/game/types/GridTypes'
import type { Player } from '@/game/entities/Player'
import type { Bomb } from '@/game/entities/Bomb'
import { BombState } from '@/game/entities/BombState'

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeArena(overrides: Record<string, CellType> = {}): ArenaState {
  const W = 9, H = 9
  const grid: GridCell[][] = Array.from({ length: H }, (_, gy) =>
    Array.from({ length: W }, (_, gx) => ({
      type: overrides[`${gx},${gy}`] ?? CellType.FLOOR,
      occupant: null,
    })),
  )
  return { grid, width: W, height: H }
}

function makePlayer(opts: {
  gridX: number
  gridY: number
  playerId?: string
  shiftWindowOpen?: boolean
  shiftCooldownRemainingMs?: number
  shiftBlastCells?: Array<{ gx: number; gy: number }>
  shiftCooldownMs?: number
}): Player {
  const p: Partial<Player> & { gridX: number; gridY: number } = {
    gridX: opts.gridX,
    gridY: opts.gridY,
    playerId: opts.playerId ?? 'p1',
    isAlive: true,
    shiftWindowOpen: opts.shiftWindowOpen ?? true,
    shiftCooldownRemainingMs: opts.shiftCooldownRemainingMs ?? 0,
    shiftBlastCells: opts.shiftBlastCells ?? [],
    shiftCooldownMs: opts.shiftCooldownMs ?? 10_000,
    closeShiftWindow() {
      p.shiftWindowOpen = false
      p.shiftBlastCells = []
    },
  }
  return p as unknown as Player
}

function makeBomb(gridX: number, gridY: number): Bomb {
  return { gridX, gridY, state: BombState.FUSING } as unknown as Bomb
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ShiftSystem — tryShift', () => {

  it('teleports to the nearest safe blast cell (Chebyshev distance)', () => {
    // Player at (4,4). Blast cells: (2,4), (3,4), (5,4), (6,4) + own cell (4,4)
    // Nearest by Chebyshev: (3,4) and (5,4) both distance 1.
    // Tie-break row-major: 4*9+3=39 vs 4*9+5=41 → (3,4) wins.
    const arena = makeArena()
    const blast = [
      { gx: 2, gy: 4 },
      { gx: 3, gy: 4 },
      { gx: 4, gy: 4 }, // own cell — excluded
      { gx: 5, gy: 4 },
      { gx: 6, gy: 4 },
    ]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast })
    const result = tryShift(player, arena, [], [player])

    expect(result.success).toBe(true)
    expect(result.toGx).toBe(3)
    expect(result.toGy).toBe(4)
    expect(player.gridX).toBe(3)
    expect(player.gridY).toBe(4)
  })

  it('excludes the player\'s own cell from candidates', () => {
    const arena = makeArena()
    const blast = [{ gx: 4, gy: 4 }]  // only candidate is player's own cell
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast })
    const result = tryShift(player, arena, [], [player])

    expect(result.success).toBe(false)
    expect(player.shiftCooldownRemainingMs).toBe(0)  // no cooldown consumed
    // Window stays open so player can retry
    expect(player.shiftWindowOpen).toBe(true)
  })

  it('uses post-destruction FLOOR state (freshly cleared cells are eligible)', () => {
    // Cell (5,4) was DESTRUCTIBLE but DestructionSystem already set it to FLOOR
    const arena = makeArena()
    arena.grid[4][5].type = CellType.FLOOR  // already cleared by DestructionSystem

    const blast = [{ gx: 5, gy: 4 }]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast })
    const result = tryShift(player, arena, [], [player])

    expect(result.success).toBe(true)
    expect(result.toGx).toBe(5)
    expect(result.toGy).toBe(4)
  })

  it('fails silently when all candidates are blocked by walls', () => {
    const arena = makeArena({ '5,4': CellType.SOLID_WALL, '3,4': CellType.SOLID_WALL })
    const blast = [{ gx: 5, gy: 4 }, { gx: 3, gy: 4 }]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast })
    const result = tryShift(player, arena, [], [player])

    expect(result.success).toBe(false)
    expect(player.shiftCooldownRemainingMs).toBe(0)  // no cooldown consumed
  })

  it('REGRESSION: removing explosion-key filter means blast cells are available immediately (no 450ms lockout)', () => {
    // This is the key regression test for the timing conflict bug:
    // Previously, activeExplosionKeys blocked all blast cells for 450ms,
    // leaving only ~350ms of the 800ms window usable.
    // Now the filter is removed — cells are available immediately when the window opens.
    const arena = makeArena()
    const blast = [{ gx: 5, gy: 4 }, { gx: 3, gy: 4 }]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast })

    // Simulate pressing SHIFT immediately after explosion (t=0ms into window)
    // Previously would have failed because cells were in activeExplosionKeys
    const result = tryShift(player, arena, [], [player])

    expect(result.success).toBe(true)  // must succeed immediately, not be blocked
    expect(player.gridX).not.toBe(4)   // player moved
  })

  it('window stays open when no safe destination found (allows retry)', () => {
    // All blast cells occupied by a bomb — SHIFT fails but window stays open
    const arena = makeArena()
    const blast = [{ gx: 5, gy: 4 }]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast })
    const bombs = [makeBomb(5, 4)]  // blocks the only candidate

    const result = tryShift(player, arena, bombs, [player])

    expect(result.success).toBe(false)
    expect(player.shiftWindowOpen).toBe(true)  // window still open for retry
    expect(player.shiftCooldownRemainingMs).toBe(0)  // no cooldown consumed
  })

  it('fails when SHIFT window is not open', () => {
    const arena = makeArena()
    const blast = [{ gx: 5, gy: 4 }]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast, shiftWindowOpen: false })
    const result = tryShift(player, arena, [], [player])

    expect(result.success).toBe(false)
  })

  it('fails when player is on cooldown', () => {
    const arena = makeArena()
    const blast = [{ gx: 5, gy: 4 }]
    const player = makePlayer({
      gridX: 4, gridY: 4,
      shiftBlastCells: blast,
      shiftCooldownRemainingMs: 5000,
    })
    const result = tryShift(player, arena, [], [player])

    expect(result.success).toBe(false)
    expect(player.shiftCooldownRemainingMs).toBe(5000)  // unchanged
  })

  it('starts 10s cooldown on success', () => {
    const arena = makeArena()
    const blast = [{ gx: 5, gy: 4 }]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast, shiftCooldownMs: 10_000 })
    const result = tryShift(player, arena, [], [player])

    expect(result.success).toBe(true)
    expect(player.shiftCooldownRemainingMs).toBe(10_000)
    expect(player.shiftWindowOpen).toBe(false)
  })

  it('excludes cells occupied by a bomb', () => {
    const arena = makeArena()
    const blast = [{ gx: 5, gy: 4 }, { gx: 6, gy: 4 }]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast })
    const bombs = [makeBomb(5, 4)]
    const result = tryShift(player, arena, bombs, [player])

    expect(result.success).toBe(true)
    expect(result.toGx).toBe(6)
    expect(result.toGy).toBe(4)
  })

  it('excludes cells occupied by another live player', () => {
    const arena = makeArena()
    const blast = [{ gx: 5, gy: 4 }, { gx: 6, gy: 4 }]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast, playerId: 'p1' })
    const other = makePlayer({ gridX: 5, gridY: 4, playerId: 'p2', shiftWindowOpen: false })
    const result = tryShift(player, arena, [], [player, other])

    expect(result.success).toBe(true)
    expect(result.toGx).toBe(6)
  })

  it('row-major tie-break ensures determinism', () => {
    // Player at (4,4). Equidistant (Chebyshev 1): (4,3) and (4,5).
    // Row-major: 3*9+4=31 vs 5*9+4=49 → (4,3) wins.
    const arena = makeArena()
    const blast = [{ gx: 4, gy: 3 }, { gx: 4, gy: 4 }, { gx: 4, gy: 5 }]
    const player = makePlayer({ gridX: 4, gridY: 4, shiftBlastCells: blast })
    const result = tryShift(player, arena, [], [player])

    expect(result.success).toBe(true)
    expect(result.toGx).toBe(4)
    expect(result.toGy).toBe(3)
  })
})
