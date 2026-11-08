// src/game/vfx/ShiftVFX.ts
// Visual effects for the SHIFT teleport:
//   - Origin: scanline/glitch flash (magenta/cyan stripes) — 200 ms
//   - Destination: neon ring expand + particle burst — 300 ms
//   - Player sprite: instant position snap (grid updated by ShiftSystem)
//     followed by a 150 ms tween from old pixel pos to new pixel pos

import Phaser from 'phaser'
import { cellToPixel, TILE_SIZE } from '../constants'
import type { Player } from '../entities/Player'
import { ParticleManager } from './ParticleManager'
import type { AudioManager } from '../audio/AudioManager'

const SHIFT_TWEEN_MS    = 150
const ORIGIN_FLASH_MS   = 200
const DEST_RING_MS      = 300

export class ShiftVFX {
  private readonly scene: Phaser.Scene
  private readonly particles: ParticleManager
  private audio: AudioManager | null = null

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.particles = new ParticleManager(scene)
  }

  setAudio(audio: AudioManager): void {
    this.audio = audio
  }

  /**
   * Plays the full SHIFT teleport effect.
   * Call AFTER ShiftSystem has already updated player.gridX/gridY.
   *
   * @param player  The player that SHIFTed.
   * @param fromGx  Origin grid column (before teleport).
   * @param fromGy  Origin grid row (before teleport).
   */
  play(player: Player, fromGx: number, fromGy: number): void {
    const origin = cellToPixel(fromGx, fromGy)
    const dest   = cellToPixel(player.gridX, player.gridY)

    this.audio?.playShift()
    this.particles.burstShiftOrigin(fromGx, fromGy)
    this.particles.burstShiftDest(player.gridX, player.gridY)
    this.originEffect(origin.x, origin.y)
    this.destEffect(dest.x, dest.y)
    this.tweenPlayer(player, origin.x, origin.y, dest.x, dest.y)
  }

  // ── Origin: scanline glitch ───────────────────────────────────────────────────

  private originEffect(x: number, y: number): void {
    const half = TILE_SIZE / 2
    // 4 horizontal scanlines fading out
    for (let i = 0; i < 4; i++) {
      const oy = y - half + (TILE_SIZE / 4) * i + 8
      const line = this.scene.add.rectangle(x, oy, TILE_SIZE - 4, 3, i % 2 === 0 ? 0x00fff7 : 0xff00cc, 0.9)
      line.setDepth(4)
      this.scene.tweens.add({
        targets: line,
        alpha: 0,
        x: x + Phaser.Math.Between(-12, 12),
        duration: ORIGIN_FLASH_MS + i * 30,
        ease: 'Quad.easeOut',
        onComplete: () => line.destroy(),
      })
    }
  }

  // ── Destination: expanding neon ring ─────────────────────────────────────────

  private destEffect(x: number, y: number): void {
    // Outer ring
    const ring = this.scene.add.circle(x, y, 4, 0xffffff, 0)
    ring.setStrokeStyle(2, 0x00fff7, 1)
    ring.setDepth(4)
    this.scene.tweens.add({
      targets: ring,
      scaleX: (TILE_SIZE * 0.8) / 8,
      scaleY: (TILE_SIZE * 0.8) / 8,
      alpha: 0,
      duration: DEST_RING_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })

    // Inner flash dot
    const dot = this.scene.add.circle(x, y, 6, 0x00fff7, 0.95)
    dot.setDepth(4)
    this.scene.tweens.add({
      targets: dot,
      scaleX: 2.5,
      scaleY: 2.5,
      alpha: 0,
      duration: DEST_RING_MS * 0.6,
      ease: 'Quad.easeOut',
      onComplete: () => dot.destroy(),
    })
  }

  // ── Player tween: snap grid then animate pixel position ──────────────────────

  private tweenPlayer(player: Player, fromX: number, fromY: number, toX: number, toY: number): void {
    // Place sprite at the origin pixel position, then tween to destination
    player.setPosition(fromX, fromY)
    this.scene.tweens.add({
      targets: player,
      x: toX,
      y: toY,
      duration: SHIFT_TWEEN_MS,
      ease: 'Quad.easeOut',
    })
  }
}
