// src/game/constants.ts
// Pure grid/canvas constants with no Phaser dependency.
// Import this file in tests and non-Phaser modules instead of config.ts.

export const TILE_SIZE = 64
export const GRID_COLS = 13
export const GRID_ROWS = 13
export const CANVAS_WIDTH = TILE_SIZE * GRID_COLS   // 832
export const CANVAS_HEIGHT = TILE_SIZE * GRID_ROWS  // 832

/** Pixel coordinate of the centre of grid cell (gx, gy). */
export function cellToPixel(gx: number, gy: number): { x: number; y: number } {
  return {
    x: gx * TILE_SIZE + TILE_SIZE / 2,
    y: gy * TILE_SIZE + TILE_SIZE / 2,
  }
}
