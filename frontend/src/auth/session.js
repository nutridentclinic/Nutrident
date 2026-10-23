import client, { abortInFlightRequests } from '../api/client.js'
import queryClient from '../queryClient.js'
import { useAuthStore } from '../store/auth.js'

let isLoggingOut = false
const activeSockets = new Set()

export const registerSocket = (socket) => {
  if (socket) activeSockets.add(socket)
  return () => activeSockets.delete(socket)
}

export const disconnectAllSockets = () => {
  for (const socket of activeSockets) {
    try {
      socket.disconnect()
    } catch {
      // ignore
    }
  }
  activeSockets.clear()
}

// Cross-tab BroadcastChannel synchronization
let authChannel = null
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  authChannel = new BroadcastChannel('drn-auth')
  authChannel.onmessage = (event) => {
    if (event.data?.type === 'LOGOUT') {
      logout({ reason: event.data.reason || 'cross-tab', broadcast: false })
    }
  }
}

export async function logout({ reason, broadcast = true } = {}) {
  if (isLoggingOut) return
  isLoggingOut = true

  const { refreshToken, accessToken } = useAuthStore.getState()

  if (broadcast && authChannel) {
    try {
      authChannel.postMessage({ type: 'LOGOUT', reason })
    } catch {
      // ignore
    }
  }

  // 1. Best-effort POST /auth/logout (short timeout, never blocks navigation)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000)
    await client
      .post(
        '/auth/logout',
        { refreshToken },
        {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          signal: controller.signal,
          timeout: 2000,
        },
      )
      .catch(() => {
        // Ignore network errors or 404 before redeploy
      })
    clearTimeout(timeoutId)
  } catch {
    // Best-effort
  }

  // 2. Abort in-flight requests
  try {
    abortInFlightRequests()
  } catch {
    // ignore
  }

  // 3. Disconnect Socket.IO and stop all polling
  try {
    disconnectAllSockets()
  } catch {
    // ignore
  }

  // 4. queryClient.clear()
  try {
    queryClient.clear()
  } catch {
    // ignore
  }

  // 5. Clear the auth store
  try {
    useAuthStore.getState().clearSession()
  } catch {
    // ignore
  }

  // 6. localStorage.removeItem('drn-auth') and any other app keys
  try {
    localStorage.removeItem('drn-auth')
    sessionStorage.clear()
  } catch {
    // ignore
  }

  // 7. window.location.replace to wipe in-memory state
  const targetUrl = '/login' + (reason ? `?reason=${encodeURIComponent(reason)}` : '')
  if (typeof window !== 'undefined') {
    window.location.replace(targetUrl)
  }
}
