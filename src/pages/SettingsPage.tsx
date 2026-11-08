// src/pages/SettingsPage.tsx
// Audio volume controls for BOMB//SHIFT.
// Reads initial values from localStorage (via AudioManager) and saves on change.
// AudioManager is instantiated locally here for the UI — GameScene has its own instance
// that also reads from the same localStorage key on init.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { audioManager } from '@/game/audio/AudioManager'
import styles from './SettingsPage.module.css'

// Shared localStorage key — same as AudioManager's LS_KEY
const AUDIO_LS_KEY = 'bombshift_audio'

function loadPrefs(): { sfx: number; music: number } {
  try {
    const raw = localStorage.getItem(AUDIO_LS_KEY)
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

export function SettingsPage() {
  const initial = loadPrefs()
  const [sfx,   setSfx]   = useState(initial.sfx)
  const [music, setMusic] = useState(initial.music)

  function handleSfxChange(val: number) {
    setSfx(val)
    audioManager.setVolumes({ sfx: val, music })
    audioManager.playUIClick()  // preview
  }

  function handleMusicChange(val: number) {
    setMusic(val)
    audioManager.setVolumes({ sfx, music: val })
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to="/" className={styles.back}>← Voltar ao menu</Link>
        <div className={styles.title}>⚙ Configurações</div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Áudio</div>

          <div className={styles.sliderRow}>
            <label className={styles.sliderLabel} htmlFor="sfx-vol">Efeitos Sonoros</label>
            <input
              id="sfx-vol"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sfx}
              className={styles.slider}
              onChange={(e) => handleSfxChange(parseFloat(e.target.value))}
              aria-label="Volume dos efeitos sonoros"
            />
            <span className={styles.sliderValue}>{Math.round(sfx * 100)}%</span>
          </div>

          <div className={styles.sliderRow}>
            <label className={styles.sliderLabel} htmlFor="music-vol">Música</label>
            <input
              id="music-vol"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={music}
              className={styles.slider}
              onChange={(e) => handleMusicChange(parseFloat(e.target.value))}
              aria-label="Volume da música"
            />
            <span className={styles.sliderValue}>{Math.round(music * 100)}%</span>
          </div>

          <p className={styles.hint}>
            As preferências são salvas automaticamente no seu navegador.
          </p>
        </div>
      </div>
    </div>
  )
}
