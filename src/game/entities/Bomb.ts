// src/game/entities/Bomb.ts
// Bomb entity: placed on the grid, fuses for 3 s, then detonates.
// Visual: PNG skin if loaded, falls back to pulsing rectangle.

import Phaser from 'phaser'
import { cellToPixel, TILE_SIZE } from '../constants'
import { BombState } from './BombState'
export { BombState } from './BombState'

export class Bomb extends Phaser.GameObjects.Container {
  readonly gridX: number
  readonly gridY: number
  readonly range: number
  readonly ownerId: string

  state: BombState = BombState.FUSING
  private fuseRemaining: number  // ms
  private bombSprite!: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle
  /** Base scale of the current sprite — pulsation multiplies against this. */
  private _baseScale = 1

  /** Set to true by ExplosionSystem when this bomb is being chain-detonated,
   *  so the BombSystem loop doesn't double-detonate it. */
  chainTriggered: boolean = false

  /** Callback invoked when the fuse reaches zero (or chain reaction fires). */
  onDetonate: (() => void) | null = null

  constructor(
    scene: Phaser.Scene,
    gridX: number,
    gridY: number,
    range: number,
    ownerId: string,
    fuseMs = 3000,
  ) {
    const { x, y } = cellToPixel(gridX, gridY)
    super(scene, x, y)
    this.gridX = gridX
    this.gridY = gridY
    this.range = range
    this.ownerId = ownerId
    this.fuseRemaining = fuseMs

    this.buildVisual()
    this.setDepth(1)
  }

  /**
   * Build or rebuild the visual sprite.
   * @param textureKey  Optional PNG key. Falls back to rectangle if not loaded.
   */
  buildVisual(textureKey?: string): void {
    // Remove old sprite from container (no-op on first call)
    if (this.bombSprite) {
      this.remove(this.bombSprite, true)
    }

    if (textureKey && this.scene.textures.exists(textureKey)) {
      const img = this.scene.add.image(0, 0, textureKey)
      // Target: 72% of tile width, maintaining aspect ratio
      const targetSize = Math.round(TILE_SIZE * 0.72)
      const baseScale = targetSize / Math.max(img.width || targetSize, img.height || targetSize)
      img.setScale(baseScale)
      this._baseScale = baseScale
      this.bombSprite = img
    } else {
      // Rectangle is already sized correctly (TILE_SIZE - 16), base scale = 1
      const size = TILE_SIZE - 16
      const rect = this.scene.add.rectangle(0, 0, size, size, 0xffaa00)
      rect.setStrokeStyle(2, 0xff6600)
      this._baseScale = 1
      this.bombSprite = rect
    }
    this.add(this.bombSprite)
  }

  /** Swap to a new texture (called on SHIFT EVENT while bomb is live). */
  setThemeTexture(textureKey: string): void {
    if (this.state !== BombState.FUSING) return  // don't update a detonating/done bomb
    this.buildVisual(textureKey)
  }

  // ── Fuse tick ─────────────────────────────────────────────────────────────────

  update(delta: number): void {
    if (this.state !== BombState.FUSING) return

    this.fuseRemaining -= delta

    // Pulse scale: ±8% oscillation on top of the base scale, accelerates as fuse runs out
    const progress = 1 - Math.max(0, this.fuseRemaining) / 3000
    const pulse = 1 + Math.sin(progress * Math.PI * 8) * 0.08 * (1 + progress)
    this.bombSprite.setScale(this._baseScale * pulse)

    if (this.fuseRemaining <= 0) {
      this.detonate()
    }
  }

  /** Trigger immediate detonation (called by chain reaction or fuse expiry). */
  detonate(): void {
    if (this.state !== BombState.FUSING) return
    this.state = BombState.DETONATING
    this.onDetonate?.()
  }

  markDone(): void {
    this.state = BombState.DONE
    this.setVisible(false)
  }
}
