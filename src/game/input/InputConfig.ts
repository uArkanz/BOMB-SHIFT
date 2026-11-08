// src/game/input/InputConfig.ts
// Creates InputScheme objects for P1 (WASD/Space/LShift) and P2 (Arrows/Enter/RShift).
// Call createSchemeP1 / createSchemeP2 inside a Phaser Scene that has a keyboard plugin.
//
// P1: W / S / A / D  +  Space  +  Left Shift  (KeyboardEvent.location === 1)
// P2: Up / Down / Left / Right  +  Enter       +  Right Shift (location === 2)
//
// Phaser's single SHIFT keycode (16) fires for both sides.  We use a thin wrapper
// that intercepts the native KeyboardEvent and checks `location` to disambiguate.

import Phaser from 'phaser'
import type { InputScheme } from './InputScheme'

const { KeyCodes } = Phaser.Input.Keyboard

// ─── LocationKey — wraps a raw keydown/keyup listener for location-specific keys ─

/**
 * Minimal stand-in for a Phaser.Input.Keyboard.Key that only fires
 * when the native key event's location matches the expected value.
 *
 * isDown is set true on keydown and false on keyup.
 * justDown resets to false after the first read (mirrors Phaser.Input.Keyboard.JustDown).
 */
export class LocationKey {
  isDown = false
  justDown = false

  private readonly onKeyDown: (e: KeyboardEvent) => void
  private readonly onKeyUp: (e: KeyboardEvent) => void

  /**
   * @param keyCode  The DOM keyCode value (e.g. 16 for Shift).
   * @param location The KeyboardEvent.location (1 = left, 2 = right, 0 = standard).
   */
  constructor(keyCode: number, location: number) {
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.keyCode === keyCode && e.location === location) {
        this.isDown = true
        this.justDown = true
      }
    }
    this.onKeyUp = (e: KeyboardEvent) => {
      if (e.keyCode === keyCode && e.location === location) {
        this.isDown = false
      }
    }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  /** Call this when the owning scene is destroyed to avoid memory leaks. */
  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }
}

// ─── Factory functions ────────────────────────────────────────────────────────

export function createSchemeP1(
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
): InputScheme {
  return {
    up:    keyboard.addKey(KeyCodes.W),
    down:  keyboard.addKey(KeyCodes.S),
    left:  keyboard.addKey(KeyCodes.A),
    right: keyboard.addKey(KeyCodes.D),
    bomb:  keyboard.addKey(KeyCodes.SPACE),
    // Left Shift only (location === 1)
    shift: new LocationKey(16, 1) as unknown as Phaser.Input.Keyboard.Key,
  }
}

export function createSchemeP2(
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
): InputScheme {
  return {
    up:    keyboard.addKey(KeyCodes.UP),
    down:  keyboard.addKey(KeyCodes.DOWN),
    left:  keyboard.addKey(KeyCodes.LEFT),
    right: keyboard.addKey(KeyCodes.RIGHT),
    bomb:  keyboard.addKey(KeyCodes.ENTER),
    // Right Shift only (location === 2)
    shift: new LocationKey(16, 2) as unknown as Phaser.Input.Keyboard.Key,
  }
}
