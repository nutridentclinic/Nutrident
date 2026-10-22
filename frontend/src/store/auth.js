import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const storageKey = 'drn-auth'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      profile: null,
      accessToken: null,
      refreshToken: null,
      setSession: ({ user, profile = null, accessToken, refreshToken }) =>
        set({ user, profile, accessToken, refreshToken }),
      setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),
      setProfile: (profile) => set({ profile }),
      clearSession: () => set({ user: null, profile: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: storageKey,
      partialize: ({ user, profile, accessToken, refreshToken }) => ({ user, profile, accessToken, refreshToken }),
    },
  ),
)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey) return
    if (!event.newValue) useAuthStore.getState().clearSession()
    else useAuthStore.persist.rehydrate()
  })
}