// src/game/scenes/BootScene.ts
// Brief splash screen shown on first load.
// Immediately starts PreloadScene which creates all textures.

import Phaser from 'phaser'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../config'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload(): void {
    // Nothing to preload here — all assets are created programmatically
    // in PreloadScene using Phaser Graphics.
  }

  create(): void {
    const cx = CANVAS_WIDTH / 2
    const cy = CANVAS_HEIGHT / 2

    // Dark background
    this.add.rectangle(cx, cy, CANVAS_WIDTH, CANVAS_HEIGHT, 0x0a0a0f)

    // Title
    this.add
      .text(cx, cy - 40, 'BOMB//SHIFT', {
        fontFamily: 'monospace',
        fontSize: '42px',
        color: '#00fff7',
      })
      .setOrigin(0.5)

    // Loading indicator
    this.add
      .text(cx, cy + 20, 'Carregando…', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#555577',
      })
      .setOrigin(0.5)

    // Transition to PreloadScene on next frame so the splash is visible briefly
    this.time.delayedCall(300, () => {
      this.scene.start('PreloadScene')
    })
  }
}
