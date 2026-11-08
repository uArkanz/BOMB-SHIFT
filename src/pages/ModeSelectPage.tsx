// src/pages/ModeSelectPage.tsx
// Mode selection screen — Solo vs 1v1 Local.
// Modes are navigable but gameplay is not implemented yet (ST-04+).

import { Link } from 'react-router-dom'
import styles from './ModeSelectPage.module.css'

export function ModeSelectPage() {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to="/" className={styles.backLink}>← Voltar ao menu</Link>

        <div className={styles.heading}>
          <div className={styles.title}>Selecionar Modo</div>
          <div className={styles.subtitle}>Escolha como quer jogar</div>
        </div>

        <div className={styles.cards}>
          {/* Solo */}
          <Link to="/play/solo" className={`${styles.modeCard} ${styles.solo}`}>
            <span className={styles.modeIcon}>🤖</span>
            <div className={styles.modeName}>Solo</div>
            <div className={styles.modeDesc}>
              Enfrente ondas progressivas de inimigos controlados por IA.
              Cada onda fica mais difícil. Use a mecânica SHIFT para sobreviver.
            </div>
            <span className={styles.modeTag}>1 jogador · IA adaptativa · Ranking</span>
          </Link>

          {/* 1v1 Local — goes through PreMatchPage for P2 name collection */}
          <Link to="/pre-match/1v1" className={`${styles.modeCard} ${styles.pvp}`}>
            <span className={styles.modeIcon}>⚔</span>
            <div className={styles.modeName}>1v1 Local</div>
            <div className={styles.modeDesc}>
              Dispute com outro jogador no mesmo computador.
              Controles independentes — teclado dividido entre os dois.
            </div>
            <span className={styles.modeTag}>2 jogadores · Mesmo PC · Ranking</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
