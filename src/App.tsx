// src/App.tsx
// Root component — BrowserRouter, AuthProvider, and all routes.

import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { MainMenuPage } from '@/pages/MainMenuPage'
import { ModeSelectPage } from '@/pages/ModeSelectPage'
import { GamePage } from '@/pages/GamePage'
import { PreMatchPage } from '@/pages/PreMatchPage'
import { PostMatchPage } from '@/pages/PostMatchPage'
import { RankingsPage } from '@/pages/RankingsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { audioManager } from '@/game/audio/AudioManager'
import '@/styles/global.css'

/**
 * Manages menu music: starts on first non-game route visit; stops on game routes.
 * Must be inside BrowserRouter so useLocation works.
 */
function MusicController() {
  const location = useLocation()
  const isGameRoute = location.pathname.startsWith('/play/')

  useEffect(() => {
    // Non-game routes: ensure menu music is playing (no-op if already playing).
    // Game routes: GamePage handles its own switch via its own useEffect.
    if (!isGameRoute) {
      audioManager.startMenuMusic()
    }
  }, [isGameRoute])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MusicController />
        <Routes>
          {/* Main menu */}
          <Route path="/" element={<MainMenuPage />} />

          {/* Mode selection + game screens */}
          <Route path="/play" element={<ModeSelectPage />} />
          <Route path="/play/:mode" element={<GamePage />} />

          {/* Pre-match (1v1 name collection) */}
          <Route path="/pre-match/1v1" element={<PreMatchPage />} />

          {/* Post-match result */}
          <Route path="/post-match" element={<PostMatchPage />} />

          {/* Rankings — public */}
          <Route path="/rankings" element={<RankingsPage />} />

          {/* Settings — public */}
          <Route path="/settings" element={<SettingsPage />} />

          {/* Profile — protected */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Auth */}
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
