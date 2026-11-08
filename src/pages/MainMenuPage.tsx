// src/pages/MainMenuPage.tsx
// Main menu — hero logo, navigation items, auth-aware header.

import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import styles from './MainMenuPage.module.css'

const MENU_ITEMS = [
  { icon: '⚡', label: 'Jogar', to: '/play' },
  { icon: '🏆', label: 'Rankings', to: '/rankings' },
  { icon: '👤', label: 'Perfil', to: '/profile' },
  { icon: '⚙', label: 'Configurações', to: '/settings' },
]

export function MainMenuPage() {
  const { isAuthenticated, profile, logout, loading } = useAuth()

  return (
    <div className={styles.page}>
      {/* Auth header — top-right */}
      <div className={styles.header}>
        {!loading && (
          isAuthenticated ? (
            <>
              <span className={styles.username}>
                Olá, <span>{profile?.username ?? '…'}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => logout()}>
                Sair
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth/login">
                <Button variant="ghost" size="sm">Entrar</Button>
              </Link>
              <Link to="/auth/register">
                <Button variant="primary" size="sm">Criar conta</Button>
              </Link>
            </>
          )
        )}
      </div>

      <div className={styles.inner}>
        {/* Hero */}
        <div className={styles.hero}>
          <Logo size="lg" animate />
          <div className={styles.tagline}>Arena · Bombas · Estratégia</div>
        </div>

        {/* Navigation */}
        <nav className={styles.menu} aria-label="Menu principal">
          {MENU_ITEMS.map(({ icon, label, to }) => (
            <Link key={to} to={to} className={styles.menuItem}>
              <span className={styles.menuIcon}>{icon}</span>
              <span className={styles.menuLabel}>{label}</span>
              <span className={styles.menuArrow}>›</span>
            </Link>
          ))}
        </nav>

        <div className={styles.footer}>BOMB//SHIFT v0.1 · Em desenvolvimento</div>
      </div>
    </div>
  )
}
