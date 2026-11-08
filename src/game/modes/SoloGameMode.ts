// src/game/modes/SoloGameMode.ts
// Describes the solo mode contract used by PostMatchPage.
// All Phaser-side orchestration is in GameScene.ts.
// This module re-exports the GAME_OVER payload type for React consumers.

export interface SoloResult {
  mode: 'solo'
  score: number
  wavesReached: number
  kills: number
  totalDurationSeconds: number
  waveDurations: number[]
}

/** Type guard — narrows a GAME_OVER payload to solo shape. */
export function isSoloResult(payload: unknown): payload is SoloResult {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as Record<string, unknown>)['mode'] === 'solo'
  )
}
