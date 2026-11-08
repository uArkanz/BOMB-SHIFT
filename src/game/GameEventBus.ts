// src/game/GameEventBus.ts
// Typed event bridge between React and Phaser.
// React components emit events; Phaser scenes listen (and vice-versa).
// Uses a simple EventTarget-based emitter so there is no external dependency.

// ─── Event name registry ──────────────────────────────────────────────────────

export const GameEvents = {
  // Bomb lifecycle
  BOMB_PLACED: 'bomb:placed',
  BOMB_EXPLODED: 'bomb:exploded',

  // Player
  PLAYER_STATS_CHANGED: 'player:stats_changed',
  PLAYER_DIED: 'player:died',

  // SHIFT mechanic
  SHIFT_USED: 'shift:used',
  SHIFT_READY: 'shift:ready',

  // Wave system
  WAVE_START: 'wave:start',
  WAVE_COMPLETE: 'wave:complete',

  // Arena dynamic events
  ARENA_SHIFT_EVENT: 'arena:shift_event',

  // Game lifecycle
  GAME_OVER: 'game:over',
  GAME_READY: 'game:ready',

  // UI → Phaser
  SET_PLAYER2_NAME: 'ui:set_player2_name',
  SET_GAME_MODE: 'ui:set_game_mode',
} as const

export type GameEventName = (typeof GameEvents)[keyof typeof GameEvents]

// ─── Typed payload map ────────────────────────────────────────────────────────

export interface GameEventPayloads {
  [GameEvents.BOMB_PLACED]: { gridX: number; gridY: number; playerId: string }
  [GameEvents.BOMB_EXPLODED]: { cells: Array<{ gx: number; gy: number }> }
  [GameEvents.PLAYER_STATS_CHANGED]: {
    playerId: string
    activeBombs: number
    maxBombs: number
    bombRange: number
    lives: number
    shiftCooldownRemainingMs: number
    shiftCooldownMs: number
  }
  [GameEvents.PLAYER_DIED]: { playerId: string }
  [GameEvents.SHIFT_USED]: { playerId: string; fromGx: number; fromGy: number; toGx: number; toGy: number }
  [GameEvents.SHIFT_READY]: { playerId: string }
  [GameEvents.WAVE_START]: { waveNumber: number; enemyCount: number }
  [GameEvents.WAVE_COMPLETE]: { waveNumber: number; score: number }
  [GameEvents.ARENA_SHIFT_EVENT]: { mutationType: string }
  [GameEvents.GAME_OVER]: {
    mode: 'solo' | '1v1'
    // Solo fields
    score?: number
    /** Number of fully completed waves (length of waveNumbers / waveDurations arrays). */
    wavesReached?: number
    kills?: number
    totalDurationSeconds?: number
    /** Duration (s) of each completed wave. Length = wavesReached. */
    waveDurations?: number[]
    /** 1-based wave index for each completed wave. Same length as waveDurations. */
    waveNumbers?: number[]
    /** Kills per slot. Length = wavesReached or wavesReached+1 (extra = partial wave kills). */
    killsPerWave?: number[]
    // 1v1 fields
    winner?: 'p1' | 'p2'
    result?: 'win' | 'loss' | 'draw'
    durationSeconds?: number
  }
  [GameEvents.GAME_READY]: Record<string, never>
  [GameEvents.SET_PLAYER2_NAME]: { name: string }
  [GameEvents.SET_GAME_MODE]: { mode: 'solo' | '1v1' }
}

// ─── Bus implementation ───────────────────────────────────────────────────────

type Listener<K extends GameEventName> = (payload: GameEventPayloads[K]) => void

class GameEventBusClass {
  private readonly target = new EventTarget()

  emit<K extends GameEventName>(event: K, payload: GameEventPayloads[K]): void {
    this.target.dispatchEvent(new CustomEvent(event, { detail: payload }))
  }

  on<K extends GameEventName>(event: K, listener: Listener<K>): () => void {
    const handler = (e: Event) => listener((e as CustomEvent<GameEventPayloads[K]>).detail)
    this.target.addEventListener(event, handler)
    // Returns an unsubscribe function — always call this in useEffect cleanup or scene destroy()
    return () => this.target.removeEventListener(event, handler)
  }

  off<K extends GameEventName>(event: K, listener: Listener<K>): void {
    // Kept for compatibility; prefer the returned unsubscribe fn from on()
    this.target.removeEventListener(event, listener as unknown as EventListener)
  }
}

/** Singleton bus — import this everywhere. */
export const GameEventBus = new GameEventBusClass()
