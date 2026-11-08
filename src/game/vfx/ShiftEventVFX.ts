// src/game/vfx/ShiftEventVFX.ts
// Visuals for arena SHIFT Events:
//   - Full-screen scanline overlay flash (200ms)
//   - "⚡ SHIFT EVENT" banner with glitch jitter (1 s)
//   - Per-tile animated reveal for each changed cell (staggered)

import Phaser from 'phaser'
import { cellToPixel, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants'
import type { CellChange } from '../arena/ArenaMutations'

const SCANLINE_MS   = 200
const BANNER_MS     = 1200
const TILE_STAGGER  = 40   // ms between each tile animation
const TILE_ANIM_MS  = 180

export class ShiftEventVFX {
  private readonly scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Play the full event animation.
   * Call AFTER the mutation has been applied to ArenaState + tileSprites.
   */
  play(changes: CellChange[]): void {
    this.scanlineFlash()
    this.banner()
    this.tileReveal(changes)
  }

  // ── Scanline overlay ──────────────────────────────────────────────────────────

  private scanlineFlash(): void {
    const overlay = this.scene.add.rectangle(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2,
      CANVAS_WIDTH, CANVAS_HEIGHT,
      0x00ffff, 0.18,
    )
    overlay.setDepth(20)
    overlay.setScrollFactor(0)
    this.scene.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: SCANLINE_MS,
      ease: 'Quad.easeOut',
      onComplete: () => overlay.destroy(),
    })
  }

  // ── Banner ────────────────────────────────────────────────────────────────────

  private banner(): void {
    const text = this.scene.add.text(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      '⚡ SHIFT EVENT',
      {
        fontSize: '36px',
        fontFamily: 'monospace',
        color: '#00fff7',
        stroke: '#000000',
        strokeThickness: 6,
      },
    )
    text.setOrigin(0.5)
    text.setDepth(21)
    text.setScrollFactor(0)

    // Glitch jitter: random x offset on a fast repeating timer
    let jitterCount = 0
    const jitterTimer = this.scene.time.addEvent({
      delay: 60,
      repeat: Math.floor(BANNER_MS / 60),
      callback: () => {
        jitterCount++
        text.setX(CANVAS_WIDTH / 2 + Phaser.Math.Between(-4, 4))
        text.setAlpha(jitterCount % 3 === 0 ? 0.4 : 1)
      },
    })

    this.scene.tweens.add({
      targets: text,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      delay: BANNER_MS - 300,
      duration: 300,
      ease: 'Quad.easeIn',
      onComplete: () => {
        jitterTimer.destroy()
        text.destroy()
      },
    })
  }

  // ── Per-tile reveal ───────────────────────────────────────────────────────────

  private tileReveal(changes: CellChange[]): void {
    changes.forEach((c, i) => {
      const { x, y } = cellToPixel(c.gx, c.gy)
      const color = c.to === 'DESTRUCTIBLE' ? 0xff6600 : 0x00ffff
      const flash = this.scene.add.rectangle(x, y, TILE_SIZE - 4, TILE_SIZE - 4, color, 0.9)
      flash.setDepth(5)

      this.scene.tweens.add({
        targets: flash,
        alpha: 0,
        scaleX: 1.2,
        scaleY: 1.2,
        delay: i * TILE_STAGGER,
        duration: TILE_ANIM_MS,
        ease: 'Quad.easeOut',
        onComplete: () => flash.destroy(),
      })
    })
  }
}
