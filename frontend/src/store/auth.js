import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const storageKey = 'drn-auth'

// Purge any legacy authentication tokens from localStorage immediately
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw && (raw.includes('accessToken') || raw.includes('refreshToken'))) {
      window.localStorage.removeItem(storageKey)
    }
  } catch {
    // Ignore storage access errors
  }
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      accessToken: null,
      refreshToken: null,
      status: 'booting', // 'booting' | 'authed' | 'anon'
      hasSession: false,

      setSession: ({ user, profile = null, accessToken, refreshToken, status }) =>
        set((state) => ({
          user: user !== undefined ? user : state.user,
          profile: profile !== undefined ? profile : state.profile,
          accessToken: accessToken !== undefined ? accessToken : state.accessToken,
          refreshToken: refreshToken !== undefined ? refreshToken : state.refreshToken,
          status: status || (user || accessToken || state.accessToken ? 'authed' : 'anon'),
          hasSession: Boolean(user || accessToken || state.accessToken),
        })),

      setUserAndProfile: (user, profile = null) =>
        set((state) => ({
          user,
          profile,
          status: user ? 'authed' : 'anon',
          hasSession: Boolean(user),
        })),

      setTokens: ({ accessToken, refreshToken }) =>
        set((state) => ({
          accessToken: accessToken !== undefined ? accessToken : state.accessToken,
          refreshToken: refreshToken !== undefined ? refreshToken : state.refreshToken,
          status: accessToken ? (state.user ? 'authed' : 'booting') : 'anon',
          hasSession: Boolean(accessToken || state.user),
        })),

      setProfile: (profile) => set({ profile }),

      setStatus: (status) =>
        set({
          status,
          hasSession: status === 'authed',
        }),

      clearSession: () =>
        set({
          user: null,
          profile: null,
          accessToken: null,
          refreshToken: null,
          status: 'anon',
          hasSession: false,
        }),
    }),
    {
      name: storageKey,
      // CRITICAL SECURITY FIX: Persist ONLY non-sensitive session hint.
      // NEVER persist JWT access or refresh tokens in localStorage.
      partialize: ({ hasSession }) => ({ hasSession: Boolean(hasSession) }),
      onRehydrateStorage: () => (state) => {
        // When hydrating, initiate boot verification of HTTP-Only cookies
        if (state?.hasSession) {
          state?.setStatus?.('booting')
        } else {
          state?.setStatus?.('booting')
        }
      },
    },
  ),
)

// Cross-tab storage event handler
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey) return
    if (!event.newValue) {
      // Key was removed in another tab
      import('../auth/session.js').then(({ logout }) => {
        logout({ reason: 'cross-tab', broadcast: false })
      })
    } else {
      useAuthStore.persist.rehydrate()
    }
  })
}