// src/game/systems/DestructionSystem.ts
// Applies explosion results to ArenaState and the GameScene visual layer.
// Rolls power-up spawns after block destruction (25% chance per block, v1).

import { CellType } from '../types/GridTypes'
import type { ArenaState } from '../types/GridTypes'
import type { GameScene } from '../scenes/GameScene'

export const PowerUpType = {
  BOMB_PLUS:  'BOMB_PLUS',   // +1 maxBombs
  RANGE_PLUS: 'RANGE_PLUS',  // +1 bombRange
} as const
export type PowerUpType = (typeof PowerUpType)[keyof typeof PowerUpType]

export interface SpawnedPowerUp {
  gx: number
  gy: number
  type: PowerUpType
}

const POWER_UP_CHANCE = 0.25
const POWER_UP_TYPES: PowerUpType[] = [PowerUpType.BOMB_PLUS, PowerUpType.RANGE_PLUS]

/**
 * Applies destroyed blocks to ArenaState + GameScene and returns any
 * power-ups that should be spawned (power-up placement is handled by the caller).
 */
export function applyDestruction(
  destroyedBlocks: Array<{ gx: number; gy: number }>,
  arenaState: ArenaState,
  scene: GameScene,
): SpawnedPowerUp[] {
  const spawned: SpawnedPowerUp[] = []

  for (const { gx, gy } of destroyedBlocks) {
    // Guard: only destroy cells that are still DESTRUCTIBLE
    // (a chain explosion can list the same block twice)
    if (arenaState.grid[gy]?.[gx]?.type !== CellType.DESTRUCTIBLE) continue

    scene.destroyBlock(gx, gy)  // updates ArenaState.grid[gy][gx].type → FLOOR

    // 25% power-up roll
    if (Math.random() < POWER_UP_CHANCE) {
      const type = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)]
      spawned.push({ gx, gy, type })
    }
  }

  return spawned
}
