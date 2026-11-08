// src/test/auth.test.tsx
// Unit tests for AuthContext: error mapping, action shapes, and form rendering.
// These tests mock Supabase — no real network calls are made.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AuthProvider } from '@/contexts/AuthContext'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'

// ── Mock Supabase ─────────────────────────────────────────────────────────────
// vi.mock is hoisted to the top of the file by Vitest, so all references inside
// the factory must also be hoisted via vi.hoisted to avoid temporal dead zone errors.

const {
  mockSignIn,
  mockSignUp,
  mockSignOut,
  mockGetSession,
  mockOnAuthStateChange,
  mockFrom,
} = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: mockFrom,
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWithAuth(_ui: React.ReactNode, initialPath = '/auth/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />
          <Route path="/" element={<div data-testid="home">Home</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no active session
  mockGetSession.mockResolvedValue({ data: { session: null } })
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  })
})

// ── LoginPage ─────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  it('renders email, password fields and submit button', () => {
    renderWithAuth(<LoginPage />, '/auth/login')
    expect(screen.getByLabelText(/e-mail/i)).toBeTruthy()
    expect(screen.getByLabelText(/senha/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeTruthy()
  })

  it('submit is disabled when fields are empty', () => {
    renderWithAuth(<LoginPage />, '/auth/login')
    const btn = screen.getByRole('button', { name: /entrar/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('shows mapped error message on invalid credentials', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials', code: 'invalid_credentials' } })
    renderWithAuth(<LoginPage />, '/auth/login')

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('E-mail ou senha incorretos')
    })
  })

  it('navigates to home on successful login', async () => {
    mockSignIn.mockResolvedValue({ error: null })
    renderWithAuth(<LoginPage />, '/auth/login')

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('home')).toBeTruthy()
    })
  })
})

// ── RegisterPage ──────────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  it('renders three fields and a submit button', () => {
    renderWithAuth(<RegisterPage />, '/auth/register')
    expect(screen.getByLabelText(/e-mail/i)).toBeTruthy()
    expect(screen.getByLabelText(/^Senha$/i)).toBeTruthy()
    expect(screen.getByLabelText(/confirmar senha/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeTruthy()
  })

  it('shows error when passwords do not match', async () => {
    renderWithAuth(<RegisterPage />, '/auth/register')

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: 'abc123' } })
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: 'xyz999' } })
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('não coincidem')
    })
  })

  it('shows error when password is too short', async () => {
    renderWithAuth(<RegisterPage />, '/auth/register')

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('6 caracteres')
    })
  })

  it('shows success message when registration succeeds', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    renderWithAuth(<RegisterPage />, '/auth/register')

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'new@user.com' } })
    fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: 'secure123' } })
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: 'secure123' } })
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Verifique seu e-mail')
    })
  })

  it('shows mapped error on Supabase error', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'User already registered' } })
    renderWithAuth(<RegisterPage />, '/auth/register')

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'exists@user.com' } })
    fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: 'secure123' } })
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: 'secure123' } })
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('já está cadastrado')
    })
  })
})
