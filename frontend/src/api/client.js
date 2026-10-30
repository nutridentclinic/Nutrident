import axios from 'axios'
import { useAuthStore } from '../store/auth.js'

const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl) return envUrl
  if (import.meta.env.PROD) {
    throw new Error('VITE_API_BASE_URL environment variable is required in production.')
  }
  return '/api'
}

const client = axios.create({
  baseURL: getBaseUrl(),
  timeout: 60000, // 60s for Render cold-start tolerance
  withCredentials: true,
})

let refreshPromise
let pendingRequestsCount = 0
let wakingTimer = null
const pendingControllers = new Set()
let proactiveTimer = null

export const abortInFlightRequests = () => {
  for (const controller of pendingControllers) {
    try {
      controller.abort()
    } catch {
      // ignore
    }
  }
  pendingControllers.clear()
}

const notifyWakingState = (waking) => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('clinic-server-waking', { detail: { waking } }))
  }
}

export const notifyReconnectingState = (reconnecting) => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('clinic-network-reconnecting', { detail: { reconnecting } }))
  }
}

const startTracking = () => {
  pendingRequestsCount += 1
  if (pendingRequestsCount === 1) {
    wakingTimer = setTimeout(() => {
      if (pendingRequestsCount > 0) {
        notifyWakingState(true)
      }
    }, 5000)
  }
}

const settleRequest = () => {
  pendingRequestsCount = Math.max(0, pendingRequestsCount - 1)
  if (pendingRequestsCount === 0) {
    if (wakingTimer) {
      clearTimeout(wakingTimer)
      wakingTimer = null
    }
    notifyWakingState(false)
  }
}

// Routes that strictly must not trigger token refresh on failure
const NON_REFRESHABLE_AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/verify-otp',
  '/auth/verify-reset-otp',
  '/auth/verify-phone',
  '/auth/reset-password',
  '/auth/logout',
  '/auth/me',
]

const isNonRefreshableAuth = (url = '') => {
  const clean = url.split('?')[0].replace(/\/+$/, '')
  return NON_REFRESHABLE_AUTH_ROUTES.some((route) => clean.endsWith(route))
}

// Proactive refresh: decodes JWT expiration and refreshes ~60s before expiry
export const setupProactiveRefresh = (accessToken) => {
  if (!accessToken || typeof window === 'undefined') return
  if (proactiveTimer) {
    clearTimeout(proactiveTimer)
    proactiveTimer = null
  }
  try {
    const parts = accessToken.split('.')
    if (parts.length !== 3) return
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.exp) return
    const msUntilExpiry = payload.exp * 1000 - Date.now()
    const refreshDelay = Math.max(5000, msUntilExpiry - 60000) // Refresh 60s before exp

    proactiveTimer = setTimeout(async () => {
      const { refreshToken } = useAuthStore.getState()
      if (refreshToken) {
        try {
          await executeTokenRefresh(refreshToken)
        } catch {
          // Will retry on actual request if still valid or network restored
        }
      }
    }, refreshDelay)
  } catch {
    // Ignore malformed JWT in test environment
  }
}

// Single-flight cross-tab token refresh using Web Locks API when available
export const executeTokenRefresh = async (refreshToken) => {
  const doRefreshCall = async () => {
    const { data } = await axios.post(
      `${client.defaults.baseURL}/auth/refresh-token`,
      { refreshToken: refreshToken || undefined },
      { timeout: 60000, withCredentials: true },
    )
    const tokens = data?.data || {}
    if (!tokens.accessToken || !tokens.refreshToken) {
      throw new Error('The session could not be refreshed.')
    }
    useAuthStore.getState().setTokens(tokens)
    setupProactiveRefresh(tokens.accessToken)
    notifyReconnectingState(false)
    return tokens
  }

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('drn-token-refresh', doRefreshCall)
  }
  return doRefreshCall()
}

// Initialize proactive refresh on startup if token is already present
if (typeof window !== 'undefined') {
  const initialToken = useAuthStore.getState().accessToken
  if (initialToken) setupProactiveRefresh(initialToken)

  window.addEventListener('focus', () => {
    const { accessToken, refreshToken } = useAuthStore.getState()
    if (!accessToken || !refreshToken) return
    try {
      const parts = accessToken.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload.exp && payload.exp * 1000 - Date.now() < 90000) {
          executeTokenRefresh(refreshToken).catch(() => {})
        }
      }
    } catch {
      // ignore
    }
  })
}

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`

  // For multipart file uploads, allow 90s timeout
  if (config.data instanceof FormData) {
    config.timeout = 90000
    // Delete explicit Content-Type if set, allowing axios to build boundary
    if (config.headers['Content-Type']?.includes('multipart/form-data')) {
      delete config.headers['Content-Type']
    }
    if (config.headers['content-type']?.includes('multipart/form-data')) {
      delete config.headers['content-type']
    }
  }

  // Register AbortController to support immediate abort on logout
  if (!config.signal) {
    const controller = new AbortController()
    config.signal = controller.signal
    config._controller = controller
    pendingControllers.add(controller)
  }

  startTracking()
  return config
})

// Auto-retry helper for network errors / 502 / 503 / 504 on idempotent requests
const shouldRetry = (error) => {
  if (import.meta.env.MODE === 'test') return false
  const config = error.config
  if (!config) return false
  if (config._retryCount && config._retryCount >= 3) return false
  const method = (config.method || 'get').toLowerCase()
  const isIdempotent = ['get', 'head', 'options'].includes(method)
  const isNetworkOrTimeout = !error.response || error.code === 'ECONNABORTED' || error.message?.includes('timeout')
  const isServerError = [502, 503, 504].includes(error.response?.status)
  return (isIdempotent || isNetworkOrTimeout) && (isNetworkOrTimeout || isServerError)
}

client.interceptors.response.use(
  (response) => {
    if (response.config?._controller) {
      pendingControllers.delete(response.config._controller)
    }
    settleRequest()
    notifyReconnectingState(false)
    return response
  },
  async (error) => {
    if (error.config?._controller) {
      pendingControllers.delete(error.config._controller)
    }
    settleRequest()

    const request = error.config
    const url = request?.url || ''

    // 1. Check if token refresh is needed (401 on protected route, not in non-refreshable list)
    if (error.response?.status === 401 && request && !request._retried && !isNonRefreshableAuth(url)) {
      request._retried = true
      const { refreshToken } = useAuthStore.getState()

      if (refreshToken) {
        try {
          refreshPromise ||= executeTokenRefresh(refreshToken).finally(() => {
            refreshPromise = undefined
          })
          const tokens = await refreshPromise
          request.headers.Authorization = `Bearer ${tokens.accessToken}`
          return client(request)
        } catch (refreshErr) {
          const refreshStatus = refreshErr.response?.status || refreshErr.status
          // Only log out if refresh itself failed with 401 or 403 (invalid, expired, revoked)
          if (refreshStatus === 401 || refreshStatus === 403) {
            import('../auth/session.js').then(({ logout }) => {
              logout({ reason: 'expired' })
            })
          } else {
            // Network error, timeout, 429, 5xx: keep session & cached user, show reconnecting banner
            notifyReconnectingState(true)
          }
        }
      } else {
        import('../auth/session.js').then(({ logout }) => {
          logout({ reason: 'expired' })
        })
      }
    }

    // 2. Exponential backoff retry for network/timeout/502/503/504
    if (shouldRetry(error)) {
      request._retryCount = (request._retryCount || 0) + 1
      notifyReconnectingState(true)
      const backoffMs = Math.pow(2, request._retryCount - 1) * 1000
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
      return client(request)
    }

    const body = error.response?.data
    const status = error.response?.status || 0

    let message = body?.message || error.message || 'Unable to reach the clinic service.'
    if (status === 429) {
      const retrySec = body?.retryAfterSeconds || error.response?.headers?.['retry-after'] || 60
      message = body?.message || `Too many attempts, try again in ${retrySec} s.`
    }

    const normalized = new Error(message)
    normalized.status = status
    normalized.fieldErrors = Object.fromEntries((body?.errors || []).map(({ field, message: msg }) => [field, msg]))
    normalized.code = body?.code || null
    normalized.email = body?.email || null
    normalized.retryAfterSeconds = body?.retryAfterSeconds ?? (status === 429 ? 60 : null)
    normalized.resendAvailableAt = body?.resendAvailableAt || null
    normalized.attemptsLeft = body?.attemptsLeft ?? null
    normalized.retryAfter = normalized.retryAfterSeconds
    normalized.cause = error

    if (status === 403 && body?.code === 'EMAIL_NOT_VERIFIED') {
      if (typeof window !== 'undefined') {
        if (body.email) {
          sessionStorage.setItem('pendingVerification', JSON.stringify({ email: body.email }))
        }
        window.dispatchEvent(new CustomEvent('clinic:email-not-verified', { detail: { email: body.email } }))
      }
    }

    return Promise.reject(normalized)
  },
)

export const request = async (config) => {
  const response = await client(config)
  const body = response.data
  return { data: body?.data ?? null, message: body?.message || '', meta: body?.meta || null }
}

export const apiBaseUrl = client.defaults.baseURL
export default client