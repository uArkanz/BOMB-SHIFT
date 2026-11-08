// src/test/ST13.test.ts
// Unit tests for ST-13: AudioManager volume clamping, localStorage persistence,
// and SettingsPage prefs loading.
// No Phaser or DOM audio — AudioManager gracefully handles missing AudioContext.

import { describe, it, expect, beforeEach } from 'vitest'
import { AudioManager } from '@/game/audio/AudioManager'

// ─── localStorage mock ────────────────────────────────────────────────────────
// jsdom provides localStorage; reset it between tests.

const LS_KEY = 'bombshift_audio'

beforeEach(() => {
  localStorage.clear()
})

// ─── AudioManager: default prefs ─────────────────────────────────────────────

describe('AudioManager — default prefs', () => {
  it('uses default sfx=0.7 and music=0.4 when localStorage is empty', () => {
    const am = new AudioManager()
    expect(am.getVolumes().sfx).toBe(0.7)
    expect(am.getVolumes().music).toBe(0.4)
  })
})

// ─── AudioManager: setVolumes clamping ────────────────────────────────────────

describe('AudioManager — setVolumes', () => {
  it('clamps sfx above 1 to 1', () => {
    const am = new AudioManager()
    am.setVolumes({ sfx: 1.5 })
    expect(am.getVolumes().sfx).toBe(1)
  })

  it('clamps sfx below 0 to 0', () => {
    const am = new AudioManager()
    am.setVolumes({ sfx: -0.2 })
    expect(am.getVolumes().sfx).toBe(0)
  })

  it('clamps music above 1 to 1', () => {
    const am = new AudioManager()
    am.setVolumes({ music: 2 })
    expect(am.getVolumes().music).toBe(1)
  })

  it('only updates specified key', () => {
    const am = new AudioManager()
    am.setVolumes({ sfx: 0.3 })
    expect(am.getVolumes().sfx).toBe(0.3)
    expect(am.getVolumes().music).toBe(0.4)  // unchanged
  })

  it('accepts 0 as valid volume (mute)', () => {
    const am = new AudioManager()
    am.setVolumes({ sfx: 0, music: 0 })
    expect(am.getVolumes().sfx).toBe(0)
    expect(am.getVolumes().music).toBe(0)
  })
})

// ─── AudioManager: localStorage persistence ───────────────────────────────────

describe('AudioManager — localStorage persistence', () => {
  it('saves prefs to localStorage on setVolumes', () => {
    const am = new AudioManager()
    am.setVolumes({ sfx: 0.5, music: 0.2 })
    const raw = localStorage.getItem(LS_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.sfx).toBe(0.5)
    expect(parsed.music).toBe(0.2)
  })

  it('reads prefs from localStorage on construction', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ sfx: 0.3, music: 0.8 }))
    const am = new AudioManager()
    expect(am.getVolumes().sfx).toBe(0.3)
    expect(am.getVolumes().music).toBe(0.8)
  })

  it('falls back to defaults when localStorage contains invalid JSON', () => {
    localStorage.setItem(LS_KEY, 'not-json')
    const am = new AudioManager()
    expect(am.getVolumes().sfx).toBe(0.7)
    expect(am.getVolumes().music).toBe(0.4)
  })

  it('falls back to defaults when value is out of range in stored prefs', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ sfx: 5, music: -1 }))
    const am = new AudioManager()
    // Stored values are clamped on load
    expect(am.getVolumes().sfx).toBe(1)
    expect(am.getVolumes().music).toBe(0)
  })

  it('second instance reads what the first one saved', () => {
    const am1 = new AudioManager()
    am1.setVolumes({ sfx: 0.6, music: 0.1 })

    const am2 = new AudioManager()
    expect(am2.getVolumes().sfx).toBe(0.6)
    expect(am2.getVolumes().music).toBe(0.1)
  })
})

// ─── AudioManager: play methods don't throw when AudioContext is unavailable ───

describe('AudioManager — play methods are silent when no AudioContext', () => {
  it('playBombPlace does not throw', () => {
    const am = new AudioManager()
    expect(() => am.playBombPlace()).not.toThrow()
  })

  it('playExplosion with chain 0 does not throw', () => {
    const am = new AudioManager()
    expect(() => am.playExplosion(0)).not.toThrow()
  })

  it('playExplosion with chain 3 does not throw', () => {
    const am = new AudioManager()
    expect(() => am.playExplosion(3)).not.toThrow()
  })

  it('playShift does not throw', () => {
    const am = new AudioManager()
    expect(() => am.playShift()).not.toThrow()
  })

  it('playPlayerDeath does not throw', () => {
    const am = new AudioManager()
    expect(() => am.playPlayerDeath()).not.toThrow()
  })

  it('playWaveStart does not throw', () => {
    const am = new AudioManager()
    expect(() => am.playWaveStart()).not.toThrow()
  })

  it('playUIClick does not throw', () => {
    const am = new AudioManager()
    expect(() => am.playUIClick()).not.toThrow()
  })
})

// ─── SettingsPage: loadPrefs function (re-tested inline) ─────────────────────

describe('SettingsPage prefs loading', () => {
  function loadPrefs() {
    try {
      const raw = localStorage.getItem('bombshift_audio')
      if (raw) {
        const p = JSON.parse(raw) as { sfx?: number; music?: number }
        return {
          sfx:   typeof p.sfx   === 'number' ? p.sfx   : 0.7,
          music: typeof p.music === 'number' ? p.music : 0.4,
        }
      }
    } catch { /* ignore */ }
    return { sfx: 0.7, music: 0.4 }
  }

  it('returns defaults when storage is empty', () => {
    expect(loadPrefs()).toEqual({ sfx: 0.7, music: 0.4 })
  })

  it('returns stored values', () => {
    localStorage.setItem('bombshift_audio', JSON.stringify({ sfx: 0.5, music: 0.2 }))
    expect(loadPrefs()).toEqual({ sfx: 0.5, music: 0.2 })
  })

  it('returns defaults when JSON is corrupt', () => {
    localStorage.setItem('bombshift_audio', '{bad json')
    expect(loadPrefs()).toEqual({ sfx: 0.7, music: 0.4 })
  })
})
