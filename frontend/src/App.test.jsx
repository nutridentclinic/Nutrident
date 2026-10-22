import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App.jsx'
import { ToastProvider } from './components/ui.jsx'
import { useAuthStore } from './store/auth.js'

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
    expect(await screen.findByRole('heading', { name: 'Sign in to your care.' })).toBeTruthy()
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