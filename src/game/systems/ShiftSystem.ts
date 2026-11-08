// src/game/systems/ShiftSystem.ts
// Pure SHIFT teleport resolver — no Phaser dependency; safe to unit-test.
// Rules (canonical from bombshift-plan.md ST-07):
//   - Candidates: cells from the player's blast window (shiftBlastCells)
//   - Exclude: player's own current cell
//   - Safe: FLOOR at activation time + not in active explosion + not occupied
//   - Sort: Chebyshev distance ASC, then row-major order (gy*width+gx) for determinism
//   - No safe cell → fail silently, NO cooldown consumed
//   - Success → teleport + start 10s cooldown + emit SHIFT_USED

import { CellType } from '../types/GridTypes'
import type { ArenaState } from '../types/GridTypes'
import type { Player } from '../entities/Player'
import type { Bomb } from '../entities/Bomb'
import { GameEventBus, GameEvents } from '../GameEventBus'

export interface ShiftResult {
  success: boolean
  toGx?: number
  toGy?: number
}

/**
 * Chebyshev distance: max(|dx|, |dy|)
 */
function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

/**
 * Attempts to execute the SHIFT teleport for a player.
 *
 * @param player              The player trying to SHIFT.
 * @param arenaState          Current arena state (post-destruction).
 * @param activeExplosionKeys Set of "gx,gy" strings currently covered by explosion VFX.
 * @param activeBombs         All currently fusing/detonating bombs (for occupancy check).
 * @param allPlayers          All players (for occupancy check).
 */
export function tryShift(
  player: Player,
  arenaState: ArenaState,
  activeBombs: readonly Bomb[],
  allPlayers: readonly Player[],
): ShiftResult {
  // Guard: window must be open and cooldown must be 0
  if (!player.shiftWindowOpen) return { success: false }
  if (player.shiftCooldownRemainingMs > 0) return { success: false }

  const { gridX: px, gridY: py } = player

  // Build occupancy set for active bombs and other alive players (exclude self)
  const occupied = new Set<string>()
  for (const b of activeBombs) {
    occupied.add(`${b.gridX},${b.gridY}`)
  }
  for (const p of allPlayers) {
    if (p.isAlive && p.playerId !== player.playerId) {
      occupied.add(`${p.gridX},${p.gridY}`)
    }
  }

  // Filter candidate cells
  const candidates = player.shiftBlastCells.filter(({ gx, gy }) => {
    // Exclude player's own cell
    if (gx === px && gy === py) return false
    // Must be FLOOR post-destruction (DestructionSystem already applied this)
    const cell = arenaState.grid[gy]?.[gx]
    if (!cell || cell.type !== CellType.FLOOR) return false
    // Must not be occupied by a bomb or another player
    if (occupied.has(`${gx},${gy}`)) return false
    return true
  })

  if (candidates.length === 0) {
    // No safe destination — fail silently, NO cooldown consumed.
    // Do NOT close the window here; another candidate may open up before expiry
    // (e.g. a bomb on a blast cell finishes its chain). Caller is responsible
    // for showing "no destination" feedback without closing the window.
    return { success: false }
  }

  // Sort: Chebyshev ASC, then row-major (gy * width + gx) for determinism
  candidates.sort((a, b) => {
    const da = chebyshev(px, py, a.gx, a.gy)
    const db = chebyshev(px, py, b.gx, b.gy)
    if (da !== db) return da - db
    const ra = a.gy * arenaState.width + a.gx
    const rb = b.gy * arenaState.width + b.gx
    return ra - rb
  })

  const dest = candidates[0]

  // Execute teleport
  const fromGx = player.gridX
  const fromGy = player.gridY
  player.gridX = dest.gx
  player.gridY = dest.gy

  // Start cooldown + close window
  player.shiftCooldownRemainingMs = player.shiftCooldownMs
  player.closeShiftWindow()

  // Emit for HUD / audio
  GameEventBus.emit(GameEvents.SHIFT_USED, {
    playerId: player.playerId,
    fromGx,
    fromGy,
    toGx: dest.gx,
    toGy: dest.gy,
  })

  return { success: true, toGx: dest.gx, toGy: dest.gy }
}

