// src/game/arena/ArenaGenerator.ts
// Generates a 13×13 grid following the classic Bomberman pattern.
//
// Layout rules:
//   - Cells at even row AND even column → SOLID_WALL (indestructible)
//   - Border cells (row 0, row 12, col 0, col 12) → SOLID_WALL
//   - All remaining interior cells are candidates for DESTRUCTIBLE blocks
//   - blockDensity (0–1) controls what fraction of candidates become blocks
//   - Spawn zones: a 3×3 area at top-left and bottom-right corners is always FLOOR

import { CellType } from '../types/GridTypes'
import type { ArenaState, GridCell } from '../types/GridTypes'
import { GRID_COLS, GRID_ROWS } from '../constants'

export interface ArenaConfig {
  /** Fraction of non-wall interior cells to fill as destructible blocks (0–1). */
  blockDensity?: number
}

/** Chebyshev distance between (ax, ay) and (bx, by). */
function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

/**
 * Returns true if (gx, gy) is inside either spawn zone.
 * Spawn zone 1: top-left corner, 2-cell radius from (1,1) → cells (0–2, 0–2).
 * Spawn zone 2: bottom-right corner, 2-cell radius from (11,11) → cells (10–12, 10–12).
 */
function isInSpawnZone(gx: number, gy: number): boolean {
  return chebyshev(gx, gy, 1, 1) <= 2 || chebyshev(gx, gy, 11, 11) <= 2
}

/**
 * Returns true if (gx, gy) is a permanent solid wall position.
 * Rule: border cells, or cells where BOTH gx and gy are even.
 */
function isSolidWall(gx: number, gy: number, cols: number, rows: number): boolean {
  if (gx === 0 || gy === 0 || gx === cols - 1 || gy === rows - 1) return true
  return gx % 2 === 0 && gy % 2 === 0
}

export function generateArena(config: ArenaConfig = {}): ArenaState {
  const { blockDensity = 0.65 } = config
  const cols = GRID_COLS
  const rows = GRID_ROWS

  const grid: GridCell[][] = []

  for (let gy = 0; gy < rows; gy++) {
    const row: GridCell[] = []
    for (let gx = 0; gx < cols; gx++) {
      let type: CellType

      if (isSolidWall(gx, gy, cols, rows)) {
        type = CellType.SOLID_WALL
      } else if (isInSpawnZone(gx, gy)) {
        // Spawn zones are always clear
        type = CellType.FLOOR
      } else {
        // Roll for a destructible block
        type = Math.random() < blockDensity ? CellType.DESTRUCTIBLE : CellType.FLOOR
      }

      row.push({ type, occupant: null })
    }
    grid.push(row)
  }

  return { grid, width: cols, height: rows }
}
