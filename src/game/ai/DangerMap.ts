// src/game/ai/DangerMap.ts
// Computes the set of dangerous grid cells based on active bombs' predicted blast zones.
// Pure — no Phaser dependency; safe to unit-test.
// Updated every frame by calling computeDangerMap().

import { CellType } from '../types/GridTypes'
import type { ArenaState } from '../types/GridTypes'
import type { Bomb } from '../entities/Bomb'
import { BombState } from '../entities/BombState'

const DIRS = [[1,0],[-1,0],[0,1],[0,-1]] as const

/**
 * Returns a Set of "gx,gy" keys for every cell that would be hit by any
 * active (FUSING) bomb's predicted blast zone.
 *
 * The prediction uses the same arm-walk logic as ExplosionSystem but reads
 * the CURRENT ArenaState without mutating it (destructible blocks are treated
 * as stopping the arm just like in the real explosion).
 */
/** Alias used by Enemy/Behavior to avoid importing the full function. */
export type DangerMapRef = ReadonlySet<string>

export function computeDangerMap(
  arena: ArenaState,
  bombs: readonly Bomb[],
): Set<string> {
  const danger = new Set<string>()

  for (const bomb of bombs) {
    if (bomb.state !== BombState.FUSING) continue

    // Origin cell is always dangerous
    danger.add(`${bomb.gridX},${bomb.gridY}`)

    for (const [dx, dy] of DIRS) {
      for (let step = 1; step <= bomb.range; step++) {
        const gx = bomb.gridX + dx * step
        const gy = bomb.gridY + dy * step

        if (gx < 0 || gy < 0 || gx >= arena.width || gy >= arena.height) break

        const cellType = arena.grid[gy][gx].type
        if (cellType === CellType.SOLID_WALL) break

        danger.add(`${gx},${gy}`)

        if (cellType === CellType.DESTRUCTIBLE) break  // arm stops here
      }
    }
  }

  return danger
}
