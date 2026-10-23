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
  timeout: 30000,
})

let refreshPromise
let pendingRequestsCount = 0
let wakingTimer = null
const pendingControllers = new Set()

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

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`

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

client.interceptors.response.use(
  (response) => {
    if (response.config?._controller) {
      pendingControllers.delete(response.config._controller)
    }
    settleRequest()
    return response
  },
  async (error) => {
    if (error.config?._controller) {
      pendingControllers.delete(error.config._controller)
    }
    settleRequest()
    const request = error.config
    const url = request?.url || ''
    const isAuthRequest = /\/auth\//.test(url)

    if (error.response?.status === 401 && request && !request._retried && !isAuthRequest) {
      request._retried = true
      const { refreshToken, setTokens } = useAuthStore.getState()

      if (refreshToken) {
        refreshPromise ||= axios
          .post(`${client.defaults.baseURL}/auth/refresh-token`, { refreshToken }, { timeout: 30000 })
          .then(({ data }) => {
            const tokens = data?.data || {}
            if (!tokens.accessToken || !tokens.refreshToken) throw new Error('The session could not be refreshed.')
            setTokens(tokens)
            return tokens
          })
          .finally(() => {
            refreshPromise = undefined
          })

        try {
          const tokens = await refreshPromise
          request.headers.Authorization = `Bearer ${tokens.accessToken}`
          return client(request)
        } catch {
          import('../auth/session.js').then(({ logout }) => {
            logout({ reason: 'expired' })
          })
        }
      } else {
        import('../auth/session.js').then(({ logout }) => {
          logout({ reason: 'expired' })
        })
      }
    }

    const body = error.response?.data
    const normalized = new Error(body?.message || error.message || 'Unable to reach the clinic service.')
    normalized.status = error.response?.status || 0
    normalized.fieldErrors = Object.fromEntries((body?.errors || []).map(({ field, message }) => [field, message]))
    normalized.retryAfter = normalized.status === 429 ? 60 : null
    normalized.cause = error
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