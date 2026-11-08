// src/game/config.ts
// Phaser 3 game configuration.
// Canvas: 832×832 (64px × 13 tiles). Scenes registered in startup order.
//
// Pure constants live in constants.ts (no Phaser dependency — safe for tests).
// This file adds Phaser-specific config on top.

import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { PreloadScene } from './scenes/PreloadScene'
import { GameScene } from './scenes/GameScene'
import { HUDScene } from './scenes/HUDScene'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants'

// Re-export constants so existing imports of config.ts continue to work.
export { TILE_SIZE, GRID_COLS, GRID_ROWS, CANVAS_WIDTH, CANVAS_HEIGHT, cellToPixel } from './constants'

export function buildPhaserConfig(parent: HTMLDivElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#0a0a0f',
    parent,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Scene list — startup order matters.
    // BootScene shows a splash, starts PreloadScene.
    // PreloadScene creates textures and starts GameScene + HUDScene.
    scene: [BootScene, PreloadScene, GameScene, HUDScene],
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    audio: {
      disableWebAudio: false,
    },
  }
}
