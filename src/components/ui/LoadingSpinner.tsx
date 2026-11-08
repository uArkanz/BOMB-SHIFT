// src/components/ui/LoadingSpinner.tsx

import styles from './LoadingSpinner.module.css'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

export function LoadingSpinner({ size = 'md', label = 'Carregando…' }: LoadingSpinnerProps) {
  return (
    <div className={styles.wrapper} role="status" aria-label={label}>
      <div className={[styles.spinner, styles[size]].join(' ')} />
      <span className={styles.label}>{label}</span>
    </div>
  )
}
