// src/game/vfx/ParticleManager.ts
// Manages reusable Phaser particle emitters for explosion and SHIFT effects.
// Uses the Phaser 3.60+ particle API (scene.add.particles).
// All emitters are one-shot bursts — no persistent emitters are kept alive.

import Phaser from 'phaser'
import { cellToPixel, TILE_SIZE } from '../constants'

export class ParticleManager {
  private readonly scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this._createParticleTextures()
  }

  // ── Explosion burst ───────────────────────────────────────────────────────────

  /**
   * Emits an explosion particle burst at pixel position (x, y).
   * @param isArmEnd  Arm-end cells get a hotter (orange-red) colour.
   */
  burstExplosion(x: number, y: number, isArmEnd: boolean): void {
    const color = isArmEnd ? 0xff4400 : 0xffdd00
    const tintKey = isArmEnd ? 'particle_hot' : 'particle_warm'

    const emitter = this.scene.add.particles(x, y, tintKey, {
      speed:       { min: 30, max: 90 },
      angle:       { min: 0, max: 360 },
      scale:       { start: 0.8, end: 0 },
      alpha:       { start: 1, end: 0 },
      lifespan:    300,
      quantity:    6,
      blendMode:   Phaser.BlendModes.ADD,
      tint:        color,
      emitZone:    { type: 'random', source: new Phaser.Geom.Circle(0, 0, TILE_SIZE / 3) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    })
    emitter.setDepth(5)

    // Auto-destroy after all particles expire
    this.scene.time.delayedCall(350, () => {
      emitter.stop()
      emitter.destroy()
    })
  }

  // ── SHIFT origin sparkle ──────────────────────────────────────────────────────

  burstShiftOrigin(gx: number, gy: number): void {
    const { x, y } = cellToPixel(gx, gy)
    const emitter = this.scene.add.particles(x, y, 'particle_cyan', {
      speed:     { min: 20, max: 70 },
      angle:     { min: 0, max: 360 },
      scale:     { start: 1, end: 0 },
      alpha:     { start: 0.9, end: 0 },
      lifespan:  250,
      quantity:  10,
      blendMode: Phaser.BlendModes.ADD,
    })
    emitter.setDepth(5)
    this.scene.time.delayedCall(300, () => {
      emitter.stop()
      emitter.destroy()
    })
  }

  // ── SHIFT destination sparkle ─────────────────────────────────────────────────

  burstShiftDest(gx: number, gy: number): void {
    const { x, y } = cellToPixel(gx, gy)
    const emitter = this.scene.add.particles(x, y, 'particle_magenta', {
      speed:     { min: 30, max: 80 },
      angle:     { min: 0, max: 360 },
      scale:     { start: 0.9, end: 0 },
      alpha:     { start: 1, end: 0 },
      lifespan:  300,
      quantity:  14,
      blendMode: Phaser.BlendModes.ADD,
    })
    emitter.setDepth(5)
    this.scene.time.delayedCall(350, () => {
      emitter.stop()
      emitter.destroy()
    })
  }

  // ── Private: generate tiny square textures for particles ─────────────────────

  private _createParticleTextures(): void {
    const makeSquare = (key: string, color: number) => {
      if (this.scene.textures.exists(key)) return  // already created (scene restart)
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false)
      g.fillStyle(color, 1)
      g.fillRect(0, 0, 4, 4)
      g.generateTexture(key, 4, 4)
      g.destroy()
    }

    makeSquare('particle_warm',    0xffdd00)
    makeSquare('particle_hot',     0xff4400)
    makeSquare('particle_cyan',    0x00fff7)
    makeSquare('particle_magenta', 0xff00cc)
  }
}
