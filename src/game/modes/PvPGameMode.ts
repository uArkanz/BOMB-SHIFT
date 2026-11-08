// src/game/modes/PvPGameMode.ts
// Describes the 1v1 mode contract used by PostMatchPage.
// Draw detection and GAME_OVER emission live in GameScene.checkPvPGameOver().

export interface PvPResult {
  mode: '1v1'
  winner?: 'p1' | 'p2'  // undefined = draw
  result: 'win' | 'draw'
  durationSeconds: number
  player2Name?: string   // collected by PreMatchPage, stored in location state
}

/** Type guard — narrows a GAME_OVER payload to 1v1 shape. */
export function isPvPResult(payload: unknown): payload is PvPResult {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as Record<string, unknown>)['mode'] === '1v1'
  )
}
