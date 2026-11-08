// src/components/ui/Card.tsx

import styles from './Card.module.css'

interface CardProps {
  children: React.ReactNode
  className?: string
  accent?: 'cyan' | 'magenta' | 'none'
  onClick?: () => void
  role?: string
  tabIndex?: number
}

export function Card({
  children,
  className = '',
  accent = 'none',
  onClick,
  role,
  tabIndex,
}: CardProps) {
  return (
    <div
      className={[styles.card, styles[accent], onClick ? styles.clickable : '', className]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
    >
      {children}
    </div>
  )
}
