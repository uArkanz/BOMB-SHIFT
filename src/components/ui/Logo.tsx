// src/components/ui/Logo.tsx
// BOMB//SHIFT logotype — neon cyan with optional glow intensity.

import styles from './Logo.module.css'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  animate?: boolean
}

export function Logo({ size = 'md', animate = false }: LogoProps) {
  return (
    <div
      className={[styles.logo, styles[size], animate ? styles.animate : '']
        .filter(Boolean)
        .join(' ')}
      aria-label="BOMB//SHIFT"
    >
      <span className={styles.bomb}>BOMB</span>
      <span className={styles.slash}>//</span>
      <span className={styles.shift}>SHIFT</span>
    </div>
  )
}
