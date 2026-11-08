// src/game/ai/behaviors/GruntBehavior.ts
// Grunt: random walk, places bomb every 4–6 s at random intervals.
// No danger avoidance.

import type { EnemyBehavior, BehaviorContext } from '../../entities/Enemy'

const MOVE_INTERVAL_MS = 600        // how often Grunt tries to move
const BOMB_MIN_MS      = 4_000
const BOMB_MAX_MS      = 6_000

const DIRS = [[1,0],[-1,0],[0,1],[0,-1]] as const

export class GruntBehavior implements EnemyBehavior {
  private moveTimer = 0
  private bombTimer = BOMB_MIN_MS + Math.random() * (BOMB_MAX_MS - BOMB_MIN_MS)

  tick(ctx: BehaviorContext, delta: number): void {
    const { enemy } = ctx

    // Move timer
    this.moveTimer += delta
    if (this.moveTimer >= MOVE_INTERVAL_MS) {
      this.moveTimer = 0

      // Pick a random passable direction
      const shuffled = [...DIRS].sort(() => Math.random() - 0.5)
      for (const [dx, dy] of shuffled) {
        if (enemy.tryMove(dx, dy)) break
      }
    }

    // Bomb timer
    this.bombTimer -= delta
    if (this.bombTimer <= 0) {
      this.bombTimer = BOMB_MIN_MS + Math.random() * (BOMB_MAX_MS - BOMB_MIN_MS)
      ctx.placeBombFn(enemy)
    }
  }
}
