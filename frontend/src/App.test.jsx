import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { ToastProvider } from './components/ui.jsx'
import { useAuthStore } from './store/auth.js'
import { api } from './api/domains.js'

vi.mock('./api/domains.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api.auth,
        me: vi.fn(async () => {
          const user = useAuthStore.getState().user
          if (!user) {
            const err = new Error('Unauthorized')
            err.response = { status: 401 }
            throw err
          }
          return { success: true, data: { user, profile: null } }
        }),
      },
      settings: {
        get: vi.fn(async () => ({ success: true, data: { clinicName: 'Nutrident Clinic' } })),
      },
      dentists: {
        ...actual.api.dentists,
        list: vi.fn(async () => ({ success: true, data: [] })),
      },
    },
  }
})

function renderRoute(path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><ToastProvider><App /></ToastProvider></MemoryRouter></QueryClientProvider>)
}

afterEach(() => {
  useAuthStore.getState().clearSession()
  useAuthStore.persist.clearStorage()
})

describe('protected role routes', () => {
  it('redirects an anonymous visitor to login from patient routes', async () => {
    renderRoute('/app/appointments')
    expect(await screen.findByRole('heading', { name: 'Sign in to your care.' }, { timeout: 5000 })).toBeTruthy()
  })

  it('redirects an authenticated patient away from admin routes to their own home', async () => {
    useAuthStore.getState().setSession({
      user: { _id: 'patient-1', name: 'Patient One', role: 'patient' },
      accessToken: 'patient-access',
      refreshToken: 'patient-refresh',
    })
    renderRoute('/admin')
    expect(await screen.findByRole('heading', { name: /Good .*Patient/ })).toBeTruthy()
  })
})