// src/game/entities/Enemy.ts
// Base enemy entity: grid-aligned, smooth tween movement, visual placeholder.
// Tier-specific behaviour is injected via the EnemyBehavior interface.
// Killed by explosions (same as Player) — hit detection is in BombSystem.

import Phaser from 'phaser'
import { TILE_SIZE, cellToPixel } from '../constants'
import type { ArenaState } from '../types/GridTypes'
import { isCellPassable } from '../utils/collisions'
import type { Player } from './Player'
import type { Bomb } from './Bomb'
import type { DangerMapRef } from '../ai/DangerMap'

export const EnemyTier = {
  GRUNT:      'GRUNT',
  CHASER:     'CHASER',
  TACTICIAN:  'TACTICIAN',
} as const
export type EnemyTier = (typeof EnemyTier)[keyof typeof EnemyTier]

// ─── Behaviour interface ──────────────────────────────────────────────────────

/** Context passed to a behaviour each tick. */
export interface BehaviorContext {
  enemy:      Enemy
  arena:      ArenaState
  players:    readonly Player[]
  allEnemies: readonly Enemy[]
  bombs:      readonly Bomb[]
  dangerMap:  DangerMapRef
  placeBombFn: (enemy: Enemy) => void  // callback to BombSystem
  now:        number                   // scene.time.now (ms)
}

export interface EnemyBehavior {
  /** Called every frame. Returns desired (dx, dy) — 0 if no move this tick. */
  tick(ctx: BehaviorContext, delta: number): void
}

// ─── Enemy class ─────────────────────────────────────────────────────────────

export class Enemy extends Phaser.GameObjects.Container {
  readonly tier: EnemyTier
  gridX: number
  gridY: number
  isAlive: boolean = true

  private isTweening = false
  private behavior: EnemyBehavior
  private arenaState!: ArenaState
  private bodySprite!: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle

  /** Milliseconds until the enemy is allowed to move again (rate-limiter). */
  moveDelayRemaining = 0

  constructor(scene: Phaser.Scene, tier: EnemyTier, behavior: EnemyBehavior, gridX: number, gridY: number) {
    super(scene, 0, 0)
    this.tier = tier
    this.gridX = gridX
    this.gridY = gridY
    this.behavior = behavior
  }

  /** Must be called after add.existing(enemy). */
  init(arena: ArenaState): void {
    this.arenaState = arena
    const textureKey = this.tierTextureKey()

    if (this.scene.textures.exists(textureKey)) {
      const img = this.scene.add.image(0, 0, textureKey)
      const targetSize = TILE_SIZE - 10
      const scale = targetSize / Math.max(img.width, img.height)
      img.setScale(scale)
      this.bodySprite = img
    } else {
      // Procedural fallback: coloured rectangle
      const color = this.tierColor()
      const size = TILE_SIZE - 12
      const rect = this.scene.add.rectangle(0, 0, size, size, color)
      rect.setStrokeStyle(2, 0x000000)
      this.bodySprite = rect
    }
    this.add(this.bodySprite)

    const { x, y } = cellToPixel(this.gridX, this.gridY)
    this.setPosition(x, y)
    this.setDepth(2)
  }

  update(delta: number, ctx: Omit<BehaviorContext, 'enemy'>): void {
    if (!this.isAlive) return
    this.moveDelayRemaining = Math.max(0, this.moveDelayRemaining - delta)
    this.behavior.tick({ ...ctx, enemy: this }, delta)
  }

  /** Move by (dx, dy) if passable and not tweening. Returns true if move committed. */
  tryMove(dx: number, dy: number): boolean {
    if (this.isTweening || this.moveDelayRemaining > 0) return false
    const nx = this.gridX + dx
    const ny = this.gridY + dy
    if (!isCellPassable(this.arenaState, nx, ny)) return false

    this.gridX = nx
    this.gridY = ny
    const dest = cellToPixel(nx, ny)
    // Grunt moves at ~2 tiles/s, Chaser/Tactician at ~2.5
    const speed = this.tier === EnemyTier.GRUNT ? 500 : 400

    this.isTweening = true
    this.scene.tweens.add({
      targets: this,
      x: dest.x, y: dest.y,
      duration: speed,
      ease: 'Linear',
      onComplete: () => { this.isTweening = false },
    })
    return true
  }

  kill(): void {
    this.isAlive = false
    this.setVisible(false)
  }

  private tierTextureKey(): string {
    switch (this.tier) {
      case EnemyTier.GRUNT:     return 'enemy_grunt'
      case EnemyTier.CHASER:    return 'enemy_chaser'
      case EnemyTier.TACTICIAN: return 'enemy_tactician'
    }
  }

  private tierColor(): number {
    switch (this.tier) {
      case EnemyTier.GRUNT:     return 0xff4444
      case EnemyTier.CHASER:    return 0xff8800
      case EnemyTier.TACTICIAN: return 0xcc00ff
    }
  }
}

// Re-export for convenience
export type { DangerMapRef }
