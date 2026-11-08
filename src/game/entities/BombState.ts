// src/game/entities/BombState.ts
// Extracted BombState const — no Phaser dependency; safe to import in tests.

export const BombState = {
  FUSING:     'FUSING',
  DETONATING: 'DETONATING',
  DONE:       'DONE',
} as const
export type BombState = (typeof BombState)[keyof typeof BombState]
