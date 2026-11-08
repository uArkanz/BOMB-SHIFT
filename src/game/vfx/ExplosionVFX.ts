// src/game/vfx/ExplosionVFX.ts
// Renders neon flash tiles + particle bursts for each explosion cell.
// Screen shake intensity scales with chain count (plan ST-13 formula).

import Phaser from 'phaser'
import { TILE_SIZE, cellToPixel } from '../constants'
import { ParticleManager } from './ParticleManager'
import type { AudioManager } from '../audio/AudioManager'

const FLASH_DURATION_MS = 350
const FLASH_COLOR       = 0xffdd00
const ARM_END_COLOR     = 0xff4400

export class ExplosionVFX {
  private readonly scene: Phaser.Scene
  private readonly particles: ParticleManager
  private audio: AudioManager | null = null

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.particles = new ParticleManager(scene)
  }

  /** Optional: wire after AudioManager is created in GameScene. */
  setAudio(audio: AudioManager): void {
    this.audio = audio
  }

  /**
   * Plays the explosion visual for a set of cells.
   * @param cells      All blast cells (origin + arm cells).
   * @param chainCount Determines screen-shake intensity and SFX volume.
   */
  play(
    cells: Array<{ gx: number; gy: number; isArmEnd: boolean }>,
    chainCount: number,
  ): void {
    this.shakeCamera(chainCount)
    this.audio?.playExplosion(chainCount)

    for (const { gx, gy, isArmEnd } of cells) {
      const { x, y } = cellToPixel(gx, gy)
      const color = isArmEnd ? ARM_END_COLOR : FLASH_COLOR

      // Flash tile (existing effect)
      const rect = this.scene.add.rectangle(x, y, TILE_SIZE - 4, TILE_SIZE - 4, color, 0.85)
      rect.setDepth(3)
      this.scene.tweens.add({
        targets: rect,
        alpha: 0,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: FLASH_DURATION_MS,
        ease: 'Quad.easeOut',
        onComplete: () => rect.destroy(),
      })

      // Particle burst (ST-13)
      this.particles.burstExplosion(x, y, isArmEnd)
    }
  }

  private shakeCamera(chainCount: number): void {
    // Formula from plan ST-13: 200 + chainCount * 50 ms, 0.005 * chainCount intensity
    const duration  = 200 + chainCount * 50
    const intensity = 0.005 * (1 + chainCount)
    this.scene.cameras.main.shake(duration, intensity)
  }
}
