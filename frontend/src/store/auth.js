import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = 'drn-auth'
const SESSION_HINT_KEY = 'drn_has_session'

const getInitialStorageState = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { hasSession: false, status: 'anon' }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const state = parsed?.state
      if (state?.user && state?.accessToken) {
        return { hasSession: true, status: 'authed', user: state.user, profile: state.profile || null, accessToken: state.accessToken, refreshToken: state.refreshToken || null }
      }
    }
    const hasHint = window.localStorage.getItem(SESSION_HINT_KEY) === 'true'
    return { hasSession: hasHint, status: hasHint ? 'booting' : 'anon' }
  } catch {
    return { hasSession: false, status: 'anon' }
  }
}

const initial = getInitialStorageState()

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: initial.user || null,
      profile: initial.profile || null,
      accessToken: initial.accessToken || null,
      refreshToken: initial.refreshToken || null,
      status: initial.status,
      hasSession: initial.hasSession,

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
        set((state) => ({
          user,
          profile: profile !== undefined ? profile : state.profile,
          status: user ? 'authed' : 'anon',
          hasSession: Boolean(user),
        }))
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
            window.localStorage.removeItem(STORAGE_KEY)
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
      name: STORAGE_KEY,
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.user && state?.accessToken) {
          state.setStatus('authed')
        } else if (state?.accessToken || state?.user) {
          state.setStatus('booting')
        } else {
          state.setStatus('anon')
        }
      },
    },
  ),
)

// Cross-tab logout synchronization via localStorage storage event
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if ((event.key === SESSION_HINT_KEY && event.newValue === null) ||
        (event.key === STORAGE_KEY && event.newValue === null)) {
      useAuthStore.getState().clearSession()
    }
  })
}
