// src/test/Player.test.ts
// Unit tests for Player collision logic.
// Imports the real isCellPassable from the shared collision module
// so the test and the game use exactly the same rule.

import { describe, expect, it } from 'vitest'
import { isCellPassable } from '@/game/utils/collisions'
import { CellType } from '@/game/types/GridTypes'
import type { ArenaState, GridCell } from '@/game/types/GridTypes'
import { GRID_COLS, GRID_ROWS } from '@/game/constants'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeArena(overrides: Record<string, CellType> = {}): ArenaState {
  const grid: GridCell[][] = Array.from({ length: GRID_ROWS }, (_, gy) =>
    Array.from({ length: GRID_COLS }, (_, gx) => ({
      type: overrides[`${gx},${gy}`] ?? CellType.FLOOR,
      occupant: null,
    })),
  )
  return { grid, width: GRID_COLS, height: GRID_ROWS }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('isCellPassable', () => {
  it('allows movement onto a FLOOR cell', () => {
    expect(isCellPassable(makeArena(), 1, 1)).toBe(true)
  })

  it('blocks movement into a SOLID_WALL cell', () => {
    expect(isCellPassable(makeArena({ '2,2': CellType.SOLID_WALL }), 2, 2)).toBe(false)
  })

  it('blocks movement into a DESTRUCTIBLE cell', () => {
    expect(isCellPassable(makeArena({ '3,1': CellType.DESTRUCTIBLE }), 3, 1)).toBe(false)
  })

  it('blocks movement out of bounds (negative x)', () => {
    expect(isCellPassable(makeArena(), -1, 1)).toBe(false)
  })

  it('blocks movement out of bounds (negative y)', () => {
    expect(isCellPassable(makeArena(), 1, -1)).toBe(false)
  })

  it('blocks movement out of bounds (x >= width)', () => {
    expect(isCellPassable(makeArena(), GRID_COLS, 1)).toBe(false)
  })

  it('blocks movement out of bounds (y >= height)', () => {
    expect(isCellPassable(makeArena(), 1, GRID_ROWS)).toBe(false)
  })

  it('allows movement after a destructible block is replaced with FLOOR', () => {
    const arena = makeArena({ '4,4': CellType.DESTRUCTIBLE })
    expect(isCellPassable(arena, 4, 4)).toBe(false)
    arena.grid[4][4].type = CellType.FLOOR
    expect(isCellPassable(arena, 4, 4)).toBe(true)
  })
})
