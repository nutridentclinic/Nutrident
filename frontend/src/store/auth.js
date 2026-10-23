import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const storageKey = 'drn-auth'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      accessToken: null,
      refreshToken: null,
      status: 'booting', // 'booting' | 'authed' | 'anon'

      setSession: ({ user, profile = null, accessToken, refreshToken }) =>
        set((state) => ({
          user: user !== undefined ? user : state.user,
          profile: profile !== undefined ? profile : state.profile,
          accessToken: accessToken !== undefined ? accessToken : state.accessToken,
          refreshToken: refreshToken !== undefined ? refreshToken : state.refreshToken,
          status: (accessToken || state.accessToken) ? 'authed' : 'anon',
        })),

      setUserAndProfile: (user, profile = null) =>
        set((state) => ({
          user,
          profile,
          status: user && state.accessToken ? 'authed' : state.accessToken ? 'booting' : 'anon',
        })),

      setTokens: ({ accessToken, refreshToken }) =>
        set((state) => ({
          accessToken: accessToken !== undefined ? accessToken : state.accessToken,
          refreshToken: refreshToken !== undefined ? refreshToken : state.refreshToken,
          status: accessToken ? (state.user ? 'authed' : 'booting') : 'anon',
        })),

      setProfile: (profile) => set({ profile }),

      setStatus: (status) => set({ status }),

      clearSession: () =>
        set({
          user: null,
          profile: null,
          accessToken: null,
          refreshToken: null,
          status: 'anon',
        }),
    }),
    {
      name: storageKey,
      // CRITICAL SECURITY FIX (P3 / A4): Persist ONLY tokens; NEVER persist user or profile personal data
      partialize: ({ accessToken, refreshToken }) => ({ accessToken, refreshToken }),
      onRehydrateStorage: () => (state) => {
        if (!state?.accessToken) {
          state?.setStatus?.('anon')
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