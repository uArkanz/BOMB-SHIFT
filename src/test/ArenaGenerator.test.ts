// src/test/ArenaGenerator.test.ts
// Unit tests for ArenaGenerator.
// Verifies: spawn zones clear, solid wall pattern, grid dimensions,
// border cells are solid walls, interior even×even cells are solid walls.

import { describe, expect, it } from 'vitest'
import { generateArena } from '@/game/arena/ArenaGenerator'
import { CellType } from '@/game/types/GridTypes'
import { GRID_COLS, GRID_ROWS } from '@/game/constants'

describe('ArenaGenerator', () => {
  // Run each structural test on several independently generated arenas
  // to verify the random element doesn't break invariants.
  const RUNS = 10

  function runTimes(fn: (arena: ReturnType<typeof generateArena>) => void) {
    for (let i = 0; i < RUNS; i++) fn(generateArena())
  }

  it('produces a grid with correct dimensions (13×13)', () => {
    runTimes(arena => {
      expect(arena.width).toBe(GRID_COLS)
      expect(arena.height).toBe(GRID_ROWS)
      expect(arena.grid.length).toBe(GRID_ROWS)
      arena.grid.forEach(row => expect(row.length).toBe(GRID_COLS))
    })
  })

  it('border cells are always SOLID_WALL', () => {
    runTimes(arena => {
      const { grid, width, height } = arena
      for (let gx = 0; gx < width; gx++) {
        expect(grid[0][gx].type).toBe(CellType.SOLID_WALL)
        expect(grid[height - 1][gx].type).toBe(CellType.SOLID_WALL)
      }
      for (let gy = 0; gy < height; gy++) {
        expect(grid[gy][0].type).toBe(CellType.SOLID_WALL)
        expect(grid[gy][width - 1].type).toBe(CellType.SOLID_WALL)
      }
    })
  })

  it('interior even×even cells are always SOLID_WALL', () => {
    runTimes(arena => {
      const { grid, width, height } = arena
      for (let gy = 2; gy < height - 1; gy += 2) {
        for (let gx = 2; gx < width - 1; gx += 2) {
          expect(
            grid[gy][gx].type,
            `Expected SOLID_WALL at (${gx}, ${gy})`,
          ).toBe(CellType.SOLID_WALL)
        }
      }
    })
  })

  it('spawn zone top-left (0–2, 0–2) is always clear (FLOOR or SOLID_WALL border)', () => {
    // Cells (1,1), (1,2), (2,1) must not be DESTRUCTIBLE.
    // (0,0), (0,1), (0,2), (1,0), (2,0) are border SOLID_WALLs — also fine.
    // (2,2) is an even×even SOLID_WALL — also fine.
    // The key check: no cell in the 3×3 spawn area is DESTRUCTIBLE.
    runTimes(arena => {
      for (let gy = 0; gy <= 2; gy++) {
        for (let gx = 0; gx <= 2; gx++) {
          expect(
            arena.grid[gy][gx].type,
            `Spawn zone top-left: unexpected DESTRUCTIBLE at (${gx}, ${gy})`,
          ).not.toBe(CellType.DESTRUCTIBLE)
        }
      }
    })
  })

  it('spawn zone bottom-right (10–12, 10–12) is always clear', () => {
    runTimes(arena => {
      for (let gy = 10; gy <= 12; gy++) {
        for (let gx = 10; gx <= 12; gx++) {
          expect(
            arena.grid[gy][gx].type,
            `Spawn zone bottom-right: unexpected DESTRUCTIBLE at (${gx}, ${gy})`,
          ).not.toBe(CellType.DESTRUCTIBLE)
        }
      }
    })
  })

  it('all cell occupants start as null', () => {
    runTimes(arena => {
      arena.grid.forEach(row =>
        row.forEach(cell => expect(cell.occupant).toBeNull()),
      )
    })
  })

  it('blockDensity = 0 produces no destructible blocks', () => {
    const arena = generateArena({ blockDensity: 0 })
    arena.grid.forEach(row =>
      row.forEach(cell =>
        expect(cell.type).not.toBe(CellType.DESTRUCTIBLE),
      ),
    )
  })

  it('blockDensity = 1 fills all eligible interior cells with DESTRUCTIBLE', () => {
    const arena = generateArena({ blockDensity: 1 })
    const { grid, width, height } = arena

    // Mirror the Chebyshev-2 spawn zones from ArenaGenerator exactly.
    function inSpawnZone(gx: number, gy: number): boolean {
      const cheb = (ax: number, ay: number, bx: number, by: number) =>
        Math.max(Math.abs(ax - bx), Math.abs(ay - by))
      return cheb(gx, gy, 1, 1) <= 2 || cheb(gx, gy, 11, 11) <= 2
    }

    for (let gy = 1; gy < height - 1; gy++) {
      for (let gx = 1; gx < width - 1; gx++) {
        // Even×even cells are solid walls — skip
        if (gx % 2 === 0 && gy % 2 === 0) continue

        if (inSpawnZone(gx, gy)) {
          expect(grid[gy][gx].type).toBe(CellType.FLOOR)
        } else {
          expect(
            grid[gy][gx].type,
            `Expected DESTRUCTIBLE at (${gx}, ${gy}) with density=1`,
          ).toBe(CellType.DESTRUCTIBLE)
        }
      }
    }
  })
})
