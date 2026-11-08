// src/game/audio/AudioManager.ts
// Synthesizes game SFX and BGM using the Web Audio API — no asset files needed.
// BGM is pre-rendered into AudioBuffers (loop) for zero per-frame CPU.
// Volume preferences are persisted to localStorage under 'bombshift_audio'.
//
// SINGLETON — import `audioManager` everywhere; never call `new AudioManager()`.
// Two BGM tracks: 'menu' (calm synthwave) and 'game' (action arcade).
// Only one plays at a time; transitions fade smoothly.
//
// Usage:
//   import { audioManager } from '@/game/audio/AudioManager'
//   audioManager.startMenuMusic()
//   audioManager.startGameMusic()
//   audioManager.stopMusic()
//   audioManager.playBombPlace()
//   audioManager.setVolumes({ sfx: 0.5, music: 0.2 })

const LS_KEY = 'bombshift_audio'

export interface AudioPrefs {
  sfx: number    // 0.0 – 1.0
  music: number  // 0.0 – 1.0
}

const DEFAULT_PREFS: AudioPrefs = { sfx: 0.7, music: 0.4 }

// ─── BGM constants ────────────────────────────────────────────────────────────

const BPM          = 128
const BEAT_SEC     = 60 / BPM                   // ≈ 0.46875 s
const LOOP_BARS    = 2
const LOOP_BEATS   = LOOP_BARS * 4              // 8 beats
const LOOP_SEC     = LOOP_BEATS * BEAT_SEC       // ≈ 3.75 s

// A minor pentatonic: A2 C3 E3 A3 C4 E4 (MIDI 45,48,52,57,60,64)
const SCALE_HZ = [110, 130.81, 164.81, 220, 261.63, 329.63]

// Lead melody: 16 eighth-note slots over 2 bars (index into SCALE_HZ, -1 = rest)
const LEAD_PATTERN = [0, -1, 2, -1, 1, -1, 3, -1, 2, -1, 4, -1, 3, -1, 2, -1] as const

export class AudioManager {
  private ctx: AudioContext | null = null
  private prefs: AudioPrefs

  // BGM nodes (live while music plays)
  private musicGain: GainNode | null = null
  private musicSource: AudioBufferSourceNode | null = null
  // Cached buffers — built once, reused on restart
  private menuBuffer:  AudioBuffer | null = null
  private gameBuffer:  AudioBuffer | null = null
  private activeTrack: 'menu' | 'game' | null = null

  constructor() {
    this.prefs = this._loadPrefs()
  }

  // ── Prefs ─────────────────────────────────────────────────────────────────────

  getVolumes(): AudioPrefs {
    return { ...this.prefs }
  }

  setVolumes(partial: Partial<AudioPrefs>): void {
    if (partial.sfx   !== undefined) this.prefs.sfx   = Math.max(0, Math.min(1, partial.sfx))
    if (partial.music !== undefined) this.prefs.music = Math.max(0, Math.min(1, partial.music))
    // Update live gain immediately without restart
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(this.prefs.music * 0.35, this._ctx()!.currentTime, 0.05)
    }
    this._savePrefs()
  }

  // ── BGM ───────────────────────────────────────────────────────────────────────

  /**
   * Start the menu music (calm synthwave).
   * No-op if menu music is already playing.
   * Stops any game music first.
   */
  startMenuMusic(): void {
    if (this.activeTrack === 'menu') return
    this._startTrack('menu')
  }

  /**
   * Start the in-game music (action arcade).
   * No-op if game music is already playing.
   * Stops menu music first.
   */
  startGameMusic(): void {
    if (this.activeTrack === 'game') return
    this._startTrack('game')
  }

  /** Fade out and stop all music. */
  stopMusic(): void {
    this._stopCurrent(0.3)
    this.activeTrack = null
  }

  /** @deprecated — kept for backwards-compat with GameScene; routes to startGameMusic */
  startMusic(): void { this.startGameMusic() }

  private _startTrack(track: 'menu' | 'game'): void {
    const ctx = this._ctx()
    if (!ctx) return

    // Fade out current track before starting new one
    this._stopCurrent(0.25)

    const buffer = this._getBuffer(ctx, track)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(this.prefs.music * 0.35, ctx.currentTime + 0.5)
    gain.connect(ctx.destination)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(gain)
    source.start()

    this.musicGain   = gain
    this.musicSource = source
    this.activeTrack = track
  }

  private _stopCurrent(fadeTimeSec: number): void {
    const ctx = this._ctx()
    if (!this.musicSource || !this.musicGain || !ctx) return

    const gain   = this.musicGain
    const source = this.musicSource
    this.musicSource = null
    this.musicGain   = null

    gain.gain.setTargetAtTime(0, ctx.currentTime, fadeTimeSec / 3)
    setTimeout(() => {
      try { source.stop() } catch { /* already stopped */ }
      source.disconnect()
      gain.disconnect()
    }, fadeTimeSec * 1000 + 500)
  }

  private _getBuffer(ctx: AudioContext, track: 'menu' | 'game'): AudioBuffer {
    if (track === 'menu') {
      if (!this.menuBuffer) this.menuBuffer = this._buildMenuBuffer(ctx)
      return this.menuBuffer
    }
    if (!this.gameBuffer) this.gameBuffer = this._buildGameBuffer(ctx)
    return this.gameBuffer
  }

  // ── Named SFX ─────────────────────────────────────────────────────────────────

  playBombPlace(): void {
    this._tone(220, 'square', 0.06, 0.12, this.prefs.sfx * 0.5)
  }

  playExplosion(chainCount = 0): void {
    const vol = this.prefs.sfx * Math.min(1, 0.6 + chainCount * 0.15)
    this._noise(0.03, 0.3 + chainCount * 0.1, vol)
    this._tone(80 + chainCount * 10, 'sawtooth', 0.02, 0.25, vol * 0.6)
  }

  playShift(): void {
    this._sweep(300, 1200, 'sine', 0.02, 0.2, this.prefs.sfx * 0.6)
  }

  playPlayerDeath(): void {
    this._sweep(600, 60, 'sawtooth', 0.05, 0.5, this.prefs.sfx * 0.8)
  }

  playWaveStart(): void {
    this._tone(440, 'sine', 0.02, 0.15, this.prefs.sfx * 0.6)
    setTimeout(() => this._tone(660, 'sine', 0.02, 0.15, this.prefs.sfx * 0.6), 160)
  }

  playArenaEvent(): void {
    this._sweep(200, 800, 'square', 0.03, 0.3, this.prefs.sfx * 0.5)
  }

  playUIClick(): void {
    this._tone(880, 'sine', 0.005, 0.06, this.prefs.sfx * 0.4)
  }

  // ── BGM buffer construction ───────────────────────────────────────────────────
  // All buffers are pre-rendered once, then cached. Zero per-frame CPU.

  /** Game BGM: action arcade, 128 BPM, A minor pentatonic. ~3.75 s loop. */
  private _buildGameBuffer(ctx: AudioContext): AudioBuffer {
    const sampleRate = ctx.sampleRate
    const totalSamples = Math.ceil(LOOP_SEC * sampleRate)
    const buffer = ctx.createBuffer(2, totalSamples, sampleRate)
    const L = buffer.getChannelData(0)
    const R = buffer.getChannelData(1)

    // Helper: write a sine wave burst at [startSec, startSec+durSec)
    const addSine = (freq: number, amp: number, startSec: number, durSec: number, pan = 0) => {
      const start = Math.floor(startSec * sampleRate)
      const end   = Math.min(totalSamples, Math.floor((startSec + durSec) * sampleRate))
      for (let i = start; i < end; i++) {
        const t    = (i - start) / sampleRate
        const env  = Math.min(1, t / 0.005) * Math.exp(-t * 6)   // fast attack, exp decay
        const s    = Math.sin(2 * Math.PI * freq * t) * amp * env
        L[i] += s * (1 - pan * 0.4)
        R[i] += s * (1 + pan * 0.4)
      }
    }

    // Helper: kick drum (pitched noise burst + sine thump)
    const addKick = (startSec: number) => {
      const start = Math.floor(startSec * sampleRate)
      const dur   = Math.floor(0.18 * sampleRate)
      const end   = Math.min(totalSamples, start + dur)
      for (let i = start; i < end; i++) {
        const t   = (i - start) / sampleRate
        const env = Math.exp(-t * 22)
        // Pitch sweep: 150 → 40 Hz
        const freq = 150 * Math.exp(-t * 30)
        const kick = Math.sin(2 * Math.PI * freq * t) * 0.7 * env
        // Noise transient
        const noise = (Math.random() * 2 - 1) * 0.15 * Math.exp(-t * 80)
        L[i] += kick + noise
        R[i] += kick + noise
      }
    }

    // Helper: hi-hat tick
    const addHat = (startSec: number, amp: number) => {
      const start = Math.floor(startSec * sampleRate)
      const dur   = Math.floor(0.04 * sampleRate)
      const end   = Math.min(totalSamples, start + dur)
      for (let i = start; i < end; i++) {
        const t   = (i - start) / sampleRate
        const env = Math.exp(-t * 120)
        L[i] += (Math.random() * 2 - 1) * amp * env
        R[i] += (Math.random() * 2 - 1) * amp * env
      }
    }

    // Helper: sub-bass pulse (sine, two octaves below lead)
    const addBass = (startSec: number) => {
      addSine(55, 0.45, startSec, BEAT_SEC * 0.7)    // A1
    }

    // Helper: pad note (triangle approximation via additive harmonics)
    const addPad = (freq: number, amp: number, startSec: number, durSec: number, pan = 0) => {
      // triangle = fundamental + odd harmonics with 1/n² amplitude
      for (let h = 1; h <= 5; h += 2) {
        const sign = ((h - 1) / 2) % 2 === 0 ? 1 : -1
        addSine(freq * h, (amp / (h * h)) * sign, startSec, durSec, pan)
      }
    }

    // ── Pattern: 2 bars × 4 beats at 128 BPM ─────────────────────────────────

    for (let beat = 0; beat < LOOP_BEATS; beat++) {
      const t = beat * BEAT_SEC

      // Kick: every beat (4-on-floor)
      addKick(t)

      // Hi-hat: every 8th note
      addHat(t,                0.06)
      addHat(t + BEAT_SEC / 2, 0.04)

      // Bass: beats 1 and 3 of each bar (0, 2, 4, 6 → 0 and 2 in local bar index)
      if (beat % 2 === 0) addBass(t)
    }

    // Pad: A minor chord (A2 + C3 + E3) held across the whole loop, slowly swelling
    const padDur = LOOP_SEC * 0.95   // slightly shorter to allow tiny release click prevention
    addPad(SCALE_HZ[0], 0.08, 0, padDur, -0.3)   // A2, panned left
    addPad(SCALE_HZ[1], 0.06, 0, padDur,  0.0)   // C3, centre
    addPad(SCALE_HZ[2], 0.05, 0, padDur,  0.3)   // E3, panned right

    // Lead melody: 16 eighth-note slots
    const eighthNote = BEAT_SEC / 2
    for (let slot = 0; slot < LEAD_PATTERN.length; slot++) {
      const noteIdx = LEAD_PATTERN[slot]
      if (noteIdx < 0) continue
      const freq = SCALE_HZ[noteIdx] * 2   // one octave up from scale
      addSine(freq, 0.12, slot * eighthNote, eighthNote * 0.7, (slot % 3 - 1) * 0.2)
    }

    // Soft limiter: clip to ±0.95 to avoid harsh clipping at mix peaks
    for (let i = 0; i < totalSamples; i++) {
      L[i] = Math.max(-0.95, Math.min(0.95, L[i]))
      R[i] = Math.max(-0.95, Math.min(0.95, R[i]))
    }

    return buffer
  }

  /** Menu BGM: calm synthwave, 96 BPM, F major. ~5 s loop. */
  private _buildMenuBuffer(ctx: AudioContext): AudioBuffer {
    const sampleRate    = ctx.sampleRate
    const BPM_M         = 96
    const BEAT_M        = 60 / BPM_M               // ≈ 0.625 s
    const LOOP_BEATS_M  = 8                         // 2 bars
    const LOOP_SEC_M    = LOOP_BEATS_M * BEAT_M     // = 5 s
    const totalSamples  = Math.ceil(LOOP_SEC_M * sampleRate)
    const buffer        = ctx.createBuffer(2, totalSamples, sampleRate)
    const L = buffer.getChannelData(0)
    const R = buffer.getChannelData(1)

    // F major pentatonic: F3 A3 C4 F4 A4 (Hz)
    const SCALE_M = [174.61, 220, 261.63, 349.23, 440]

    // Melody: 16 eighth-note slots (2 bars at 96 BPM)
    // Pattern: flowing arpeggio, relaxed, with rests
    const MELODY_M = [0, -1, 2, 1, -1, 3, 2, -1, 1, -1, 3, 2, -1, 4, 3, -1] as const

    const addSine = (freq: number, amp: number, startSec: number, durSec: number, pan = 0) => {
      const start = Math.floor(startSec * sampleRate)
      const end   = Math.min(totalSamples, Math.floor((startSec + durSec) * sampleRate))
      for (let i = start; i < end; i++) {
        const t   = (i - start) / sampleRate
        const env = Math.min(1, t / 0.012) * Math.exp(-t * 3)  // slower attack, slower decay
        L[i] += Math.sin(2 * Math.PI * freq * t) * amp * env * (1 - pan * 0.4)
        R[i] += Math.sin(2 * Math.PI * freq * t) * amp * env * (1 + pan * 0.4)
      }
    }

    // Soft kick — gentler than game kick
    const addSoftKick = (startSec: number) => {
      const start = Math.floor(startSec * sampleRate)
      const dur   = Math.floor(0.2 * sampleRate)
      const end   = Math.min(totalSamples, start + dur)
      for (let i = start; i < end; i++) {
        const t    = (i - start) / sampleRate
        const env  = Math.exp(-t * 14)
        const freq = 90 * Math.exp(-t * 18)
        L[i] += Math.sin(2 * Math.PI * freq * t) * 0.4 * env
        R[i] += Math.sin(2 * Math.PI * freq * t) * 0.4 * env
      }
    }

    // Kick on beats 1 and 3 of each bar (beats 0, 2, 4, 6)
    for (let beat = 0; beat < LOOP_BEATS_M; beat++) {
      if (beat % 2 === 0) addSoftKick(beat * BEAT_M)
    }

    // Bass line: sub-bass on beats 1 and 3
    for (let beat = 0; beat < LOOP_BEATS_M; beat++) {
      if (beat % 2 === 0) {
        // F1 = 43.65 Hz, slow pulse
        addSine(43.65, 0.3, beat * BEAT_M, BEAT_M * 0.8)
      }
    }

    // Pad: F major triad (F3 + A3 + C4), long sustain across loop
    const padSustain = LOOP_SEC_M * 0.95
    for (let h = 1; h <= 3; h += 2) {
      addSine(SCALE_M[0] * h, 0.06 / h, 0, padSustain, -0.25)  // F
      addSine(SCALE_M[1] * h, 0.05 / h, 0, padSustain,  0.0)   // A
      addSine(SCALE_M[2] * h, 0.04 / h, 0, padSustain,  0.25)  // C
    }

    // Shimmer: high-frequency sine pad (one octave above A4 = 880 Hz)
    // gentle vibrato approximation — alternating two close frequencies
    for (let beat = 0; beat < LOOP_BEATS_M; beat++) {
      const t = beat * BEAT_M
      addSine(880,   0.025, t, BEAT_M * 1.5, 0.4)
      addSine(987.77, 0.02, t + BEAT_M * 0.5, BEAT_M * 1.2, -0.4)
    }

    // Melody (one octave above scale)
    const eighthNote = BEAT_M / 2
    for (let slot = 0; slot < MELODY_M.length; slot++) {
      const idx = MELODY_M[slot]
      if (idx < 0) continue
      const freq = SCALE_M[idx] * 2
      const pan  = (slot % 4 - 1.5) * 0.15
      addSine(freq, 0.10, slot * eighthNote, eighthNote * 0.85, pan)
    }

    // Soft limiter
    for (let i = 0; i < totalSamples; i++) {
      L[i] = Math.max(-0.9, Math.min(0.9, L[i]))
      R[i] = Math.max(-0.9, Math.min(0.9, R[i]))
    }

    return buffer
  }

  // ── Private synthesis helpers (SFX) ──────────────────────────────────────────

  private _ctx(): AudioContext | null {
    if (this.ctx) return this.ctx
    try {
      this.ctx = new AudioContext()
      return this.ctx
    } catch {
      return null  // no-audio environment (tests, old browsers)
    }
  }

  private _tone(freq: number, type: OscillatorType, attack: number, decay: number, vol: number): void {
    if (vol <= 0) return
    const ctx = this._ctx()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + attack)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + attack + decay)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + attack + decay + 0.01)
  }

  private _sweep(freqStart: number, freqEnd: number, type: OscillatorType, attack: number, decay: number, vol: number): void {
    if (vol <= 0) return
    const ctx = this._ctx()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = type
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + attack + decay)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + attack)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + attack + decay)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + attack + decay + 0.01)
  }

  private _noise(attack: number, decay: number, vol: number): void {
    if (vol <= 0) return
    const ctx = this._ctx()
    if (!ctx) return

    const bufferSize = Math.ceil(ctx.sampleRate * (attack + decay))
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }

    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
    source.connect(gain)
    gain.connect(ctx.destination)

    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + attack)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + attack + decay)
    source.start(ctx.currentTime)
  }

  private _loadPrefs(): AudioPrefs {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return { ...DEFAULT_PREFS }
      const parsed = JSON.parse(raw) as Partial<AudioPrefs>
      return {
        sfx:   typeof parsed.sfx   === 'number' ? Math.max(0, Math.min(1, parsed.sfx))   : DEFAULT_PREFS.sfx,
        music: typeof parsed.music === 'number' ? Math.max(0, Math.min(1, parsed.music)) : DEFAULT_PREFS.music,
      }
    } catch {
      return { ...DEFAULT_PREFS }
    }
  }

  private _savePrefs(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.prefs))
    } catch {
      // localStorage unavailable — silently skip
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
// All app code imports `audioManager` directly — one instance, one AudioContext.
export const audioManager = new AudioManager()
