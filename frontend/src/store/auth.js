import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const SESSION_HINT_KEY = 'drn_has_session'
const LEGACY_STORAGE_KEY = 'drn-auth'

// Purge any legacy authentication tokens from localStorage immediately
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw && (raw.includes('accessToken') || raw.includes('refreshToken'))) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    }
  } catch {
    // Ignore storage access errors
  }
}

const checkInitialHasSession = () => {
  if (typeof window === 'undefined' || !window.localStorage) return false
  return window.localStorage.getItem(SESSION_HINT_KEY) === 'true'
}

const initialHasSession = checkInitialHasSession()

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      accessToken: null,
      refreshToken: null,
      status: initialHasSession ? 'booting' : 'anon',
      hasSession: initialHasSession,

      setSession: ({ user, profile = null, accessToken, refreshToken, status }) => {
        const authed = Boolean(user || accessToken)
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            if (authed) {
              window.localStorage.setItem(SESSION_HINT_KEY, 'true')
            } else {
              window.localStorage.removeItem(SESSION_HINT_KEY)
            }
          } catch {}
        }
        set((state) => ({
          user: user !== undefined ? user : state.user,
          profile: profile !== undefined ? profile : state.profile,
          accessToken: accessToken !== undefined ? accessToken : state.accessToken,
          refreshToken: refreshToken !== undefined ? refreshToken : state.refreshToken,
          status: status || (authed ? 'authed' : 'anon'),
          hasSession: authed,
        }))
      },

      setUserAndProfile: (user, profile = null) => {
        if (typeof window !== 'undefined' && window.localStorage && user) {
          try {
            window.localStorage.setItem(SESSION_HINT_KEY, 'true')
          } catch {}
        }
        set({
          user,
          profile,
          status: user ? 'authed' : 'anon',
          hasSession: Boolean(user),
        })
      },

      setTokens: ({ accessToken, refreshToken }) =>
        set((state) => ({
          accessToken: accessToken !== undefined ? accessToken : state.accessToken,
          refreshToken: refreshToken !== undefined ? refreshToken : state.refreshToken,
          status: accessToken ? (state.user ? 'authed' : 'booting') : 'anon',
          hasSession: Boolean(accessToken || state.user),
        })),

      setProfile: (profile) => set({ profile }),

      setStatus: (status) => {
        if (status === 'anon' && typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.removeItem(SESSION_HINT_KEY)
          } catch {}
        }
        set({
          status,
          hasSession: status === 'authed',
        })
      },

      clearSession: () => {
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.removeItem(SESSION_HINT_KEY)
            window.localStorage.removeItem(LEGACY_STORAGE_KEY)
          } catch {}
        }
        set({
          user: null,
          profile: null,
          accessToken: null,
          refreshToken: null,
          status: 'anon',
          hasSession: false,
        })
      },
    }),
    {
      name: LEGACY_STORAGE_KEY,
      // Never store JWT tokens in localStorage
      partialize: () => ({}),
    },
  ),
)

// Cross-tab logout synchronization via localStorage storage event
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_HINT_KEY && event.newValue === null) {
      useAuthStore.getState().clearSession()
    }
  })
}
