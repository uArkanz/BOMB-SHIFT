// src/game/systems/ExplosionSystem.ts
// Pure explosion resolver — no Phaser dependency; safe to unit-test.
// Computes arm cells for a bomb, handles chain reactions, reports hits.

import { CellType } from '../types/GridTypes'
import type { ArenaState } from '../types/GridTypes'
import type { Bomb } from '../entities/Bomb'
import { BombState } from '../entities/BombState'
import type { Player } from '../entities/Player'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExplosionCell {
  gx: number
  gy: number
  /** True when this cell terminates the arm (last hit before it was stopped). */
  isArmEnd: boolean
}

export interface ExplosionResult {
  cells: ExplosionCell[]
  destroyedBlocks: Array<{ gx: number; gy: number }>
  hitPlayers: Player[]
  chainCount: number  // number of secondary bombs triggered
}

// Arm directions: right, left, down, up
const DIRS = [
  { dx:  1, dy:  0 },
  { dx: -1, dy:  0 },
  { dx:  0, dy:  1 },
  { dx:  0, dy: -1 },
]

// ─── Main resolver ──────────────────────────────────────────────────────────────

/**
 * Resolves a single bomb explosion.
 *
 * Algorithm:
 * - The origin cell (the bomb's own cell) is always included.
 * - Each arm walks 1…range steps in one direction.
 *   - SOLID_WALL  → arm stops BEFORE this cell (wall is never included).
 *   - DESTRUCTIBLE → arm stops ON this cell (block is destroyed, arm ends).
 *   - FLOOR       → cell included, arm continues.
 * - Chain reaction: any FUSING bomb found in the blast zone is immediately
 *   detonated (recursively), guarded by the `detonating` Set.
 * - Player hit: any player whose gridX/gridY matches a blast cell is recorded.
 *
 * DestructionSystem is responsible for mutating ArenaState after this call.
 * This function reads but does NOT write to ArenaState.
 */
export function resolveExplosion(
  bomb: Bomb,
  arenaState: ArenaState,
  allBombs: Bomb[],
  allPlayers: Player[],
  detonating: Set<Bomb> = new Set(),
): ExplosionResult {
  detonating.add(bomb)

  const cells: ExplosionCell[] = []
  const destroyedBlocks: Array<{ gx: number; gy: number }> = []
  let chainCount = 0

  // Origin cell (where the bomb sat)
  cells.push({ gx: bomb.gridX, gy: bomb.gridY, isArmEnd: false })

  // Walk each of the 4 arms
  for (const { dx, dy } of DIRS) {
    for (let step = 1; step <= bomb.range; step++) {
      const gx = bomb.gridX + dx * step
      const gy = bomb.gridY + dy * step

      // Out-of-bounds — stop arm (shouldn't happen on a walled arena, but guard anyway)
      if (gx < 0 || gy < 0 || gx >= arenaState.width || gy >= arenaState.height) break

      const cellType = arenaState.grid[gy][gx].type

      if (cellType === CellType.SOLID_WALL) {
        // Wall blocks the arm completely; do not include this cell
        break
      }

      if (cellType === CellType.DESTRUCTIBLE) {
        // Block is destroyed; arm ends here
        cells.push({ gx, gy, isArmEnd: true })
        destroyedBlocks.push({ gx, gy })
        break
      }

      // FLOOR — include and continue
      cells.push({ gx, gy, isArmEnd: step === bomb.range })

      // Chain reaction: is there a fusing bomb here?
      const chainBomb = allBombs.find(
        b => b.state === BombState.FUSING && b.gridX === gx && b.gridY === gy && !detonating.has(b),
      )
      if (chainBomb) {
        chainCount++
        chainBomb.chainTriggered = true
        const sub = resolveExplosion(chainBomb, arenaState, allBombs, allPlayers, detonating)
        cells.push(...sub.cells)
        destroyedBlocks.push(...sub.destroyedBlocks)
        chainCount += sub.chainCount
        // sub.hitPlayers collected below after dedup
      }
    }
  }

  // Also check origin cell for a chain bomb (rare but possible)
  // (already added to detonating so won't recurse back)

  // Deduplicate cells by coordinate (chain explosions can overlap)
  const seen = new Set<string>()
  const uniqueCells = cells.filter(c => {
    const key = `${c.gx},${c.gy}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Player hit detection — check each unique blast cell
  const hitPlayers = allPlayers.filter(p =>
    p.isAlive && uniqueCells.some(c => c.gx === p.gridX && c.gy === p.gridY),
  )

  return { cells: uniqueCells, destroyedBlocks, hitPlayers, chainCount }
}
