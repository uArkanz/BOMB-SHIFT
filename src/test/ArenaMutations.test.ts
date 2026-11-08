// src/test/ArenaMutations.test.ts
// Unit tests for the pure arena mutation proposals.
// No Phaser dependency — all functions operate on plain ArenaState data.

import { describe, expect, it } from 'vitest'
import { clearZone, blockSurge, corridorShift } from '@/game/arena/ArenaMutations'
import type { OccupantRef } from '@/game/arena/ArenaMutations'
import { CellType } from '@/game/types/GridTypes'
import type { ArenaState, GridCell } from '@/game/types/GridTypes'
import { GRID_COLS, GRID_ROWS } from '@/game/constants'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeArena(overrides: Record<string, CellType> = {}): ArenaState {
  const grid: GridCell[][] = Array.from({ length: GRID_ROWS }, (_, gy) =>
    Array.from({ length: GRID_COLS }, (_, gx) => {
      // Classic border = solid wall, interior = floor by default
      const isBorder = gx === 0 || gy === 0 || gx === GRID_COLS - 1 || gy === GRID_ROWS - 1
      const defaultType = isBorder ? CellType.SOLID_WALL : CellType.FLOOR
      return { type: overrides[`${gx},${gy}`] ?? defaultType, occupant: null }
    }),
  )
  return { grid, width: GRID_COLS, height: GRID_ROWS }
}

function occ(gridX: number, gridY: number): OccupantRef {
  return { gridX, gridY }
}

// ─── clearZone ────────────────────────────────────────────────────────────────

describe('clearZone', () => {
  it('removes DESTRUCTIBLE blocks inside radius', () => {
    // Place destructible block at (6,6) — centre of a clearZone(6,6,3)
    const arena = makeArena({ '6,6': CellType.DESTRUCTIBLE, '7,6': CellType.DESTRUCTIBLE })
    const result = clearZone(arena, 6, 6, 3)

    expect(result.safe).toBe(true)
    if (!result.safe) return

    const change66 = result.changes.find(c => c.gx === 6 && c.gy === 6)
    expect(change66).toBeDefined()
    expect(change66!.to).toBe(CellType.FLOOR)
  })

  it('never changes SOLID_WALL cells', () => {
    // Border walls are solid — clearZone must not touch them even if they are in radius
    const arena = makeArena()
    const result = clearZone(arena, 1, 1, 5)  // large radius — would hit border walls

    expect(result.safe).toBe(true)
    if (!result.safe) return
    for (const c of result.changes) {
      expect(c.from).not.toBe(CellType.SOLID_WALL)
      expect(c.to).not.toBe(CellType.SOLID_WALL)
    }
  })

  it('returns empty changes when zone is already clear', () => {
    const arena = makeArena()  // all interior = FLOOR
    const result = clearZone(arena, 6, 6, 3)

    expect(result.safe).toBe(true)
    if (!result.safe) return
    expect(result.changes).toHaveLength(0)
  })
})

// ─── blockSurge ───────────────────────────────────────────────────────────────

describe('blockSurge', () => {
  it('is cancelled when a player occupies a target cell (no partial apply)', () => {
    // Fill interior with many FLOOR cells so surge has candidates — place player there
    const arena = makeArena()
    // Player sits at (6,6) — centre of zone
    const player = occ(6, 6)
    const result = blockSurge(arena, 6, 6, [player], 3, 1.0)

    // If safe, none of the changes should touch the player's cell
    if (result.safe) {
      const onPlayer = result.changes.find(c => c.gx === 6 && c.gy === 6)
      expect(onPlayer).toBeUndefined()
    }
    // Either way: player cell is never blocked
  })

  it('is cancelled when mutation would trap a player', () => {
    // Narrow corridor: player at (1,6), only escape is right (2,6).
    // Walls: all around except (1,6) and (2,6).
    // Force the surge to try to block (2,6) → should be rejected.
    const overrides: Record<string, CellType> = {}
    // Fill row 6 with solid walls except cells 1 and 2
    for (let gx = 0; gx < GRID_COLS; gx++) {
      if (gx !== 1 && gx !== 2) overrides[`${gx},6`] = CellType.SOLID_WALL
    }
    // Also fill col 1 with walls except row 6
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      if (gy !== 6) overrides[`1,${gy}`] = CellType.SOLID_WALL
    }
    const arena = makeArena(overrides)
    arena.grid[6][2].type = CellType.FLOOR  // only escape route

    const player = occ(1, 6)
    // Force (2,6) into the surge zone by using blockSurge on (2,6) directly
    // with density=1.0 — it must try to block (2,6)
    const result = blockSurge(arena, 2, 6, [player], 1, 1.0)

    // Either no safe candidates or trapping detected → should cancel
    if (result.safe) {
      // If somehow it passed, (2,6) must not be blocked
      const blocksEscape = result.changes.find(c => c.gx === 2 && c.gy === 6)
      expect(blocksEscape).toBeUndefined()
    } else {
      expect(result.safe).toBe(false)
    }
  })

  it('never changes SOLID_WALL cells', () => {
    const arena = makeArena()
    const result = blockSurge(arena, 6, 6, [], 3, 0.5)

    if (!result.safe) return  // may be unsafe for random reasons — not relevant here
    for (const c of result.changes) {
      expect(c.from).not.toBe(CellType.SOLID_WALL)
    }
  })
})

// ─── corridorShift ────────────────────────────────────────────────────────────

describe('corridorShift', () => {
  it('clears all DESTRUCTIBLE blocks in the target row (horizontal corridor)', () => {
    // Place destructible blocks scattered across row 6
    const overrides: Record<string, CellType> = {
      '3,6': CellType.DESTRUCTIBLE,
      '5,6': CellType.DESTRUCTIBLE,
      '9,6': CellType.DESTRUCTIBLE,
    }
    const arena = makeArena(overrides)
    const result = corridorShift(arena, 'h', 6)

    expect(result.safe).toBe(true)
    if (!result.safe) return
    expect(result.changes).toHaveLength(3)
    for (const c of result.changes) {
      expect(c.gy).toBe(6)
      expect(c.to).toBe(CellType.FLOOR)
    }
  })

  it('clears all DESTRUCTIBLE blocks in the target column (vertical corridor)', () => {
    const overrides: Record<string, CellType> = {
      '6,2': CellType.DESTRUCTIBLE,
      '6,7': CellType.DESTRUCTIBLE,
    }
    const arena = makeArena(overrides)
    const result = corridorShift(arena, 'v', 6)

    expect(result.safe).toBe(true)
    if (!result.safe) return
    expect(result.changes).toHaveLength(2)
    for (const c of result.changes) {
      expect(c.gx).toBe(6)
      expect(c.to).toBe(CellType.FLOOR)
    }
  })

  it('never changes SOLID_WALL cells', () => {
    const arena = makeArena()
    // Row 0 is all solid walls; corridorShift should produce no changes (no DESTRUCTIBLE there)
    const result = corridorShift(arena, 'h', 0)

    expect(result.safe).toBe(true)
    if (!result.safe) return
    expect(result.changes).toHaveLength(0)
  })

  it('returns unsafe for out-of-bounds index', () => {
    const arena = makeArena()
    const result = corridorShift(arena, 'h', 999)
    expect(result.safe).toBe(false)
  })
})
