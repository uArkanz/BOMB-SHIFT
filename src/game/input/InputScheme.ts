// src/game/input/InputScheme.ts
// Defines the interface for a player's keyboard input bindings.
// Each field holds a Phaser Key object created by the scene's KeyboardPlugin.

import type Phaser from 'phaser'

export interface InputScheme {
  up: Phaser.Input.Keyboard.Key
  down: Phaser.Input.Keyboard.Key
  left: Phaser.Input.Keyboard.Key
  right: Phaser.Input.Keyboard.Key
  bomb: Phaser.Input.Keyboard.Key
  shift: Phaser.Input.Keyboard.Key
}
