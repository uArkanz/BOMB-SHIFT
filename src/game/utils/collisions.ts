// src/game/utils/collisions.ts
// Pure collision helpers — no Phaser dependency; safe to import in tests.

import { CellType } from '../types/GridTypes'
import type { ArenaState } from '../types/GridTypes'

/**
 * Returns true when (gx, gy) is a cell a player or enemy can enter.
 * Blocked by: out-of-bounds, SOLID_WALL, DESTRUCTIBLE.
 */
export function isCellPassable(arena: ArenaState, gx: number, gy: number): boolean {
  const { grid, width, height } = arena
  if (gx < 0 || gy < 0 || gx >= width || gy >= height) return false
  const t = grid[gy][gx].type
  return t !== CellType.SOLID_WALL && t !== CellType.DESTRUCTIBLE
}
