/**
 * NutriDent Clinic — Cookie Consent & Category Management System
 * Compliant with GDPR, ePrivacy Directive, and CCPA guidelines.
 *
 * Categories:
 * 1. Essential: Core authentication (HttpOnly JWTs), CSRF, security, session integrity (Always Enabled)
 * 2. Analytics: Anonymous performance monitoring, traffic and diagnostic metrics (Consent Required)
 * 3. Functional: User display preferences, accessibility settings, clinical layout states (Consent Required)
 */

export const CONSENT_STORAGE_KEY = 'drn_cookie_consent'
export const CONSENT_VERSION = '1.0'

export const COOKIE_CATEGORIES = {
  ESSENTIAL: 'essential',
  ANALYTICS: 'analytics',
  FUNCTIONAL: 'functional',
}

/**
 * Returns saved consent preferences from localStorage or null if no decision has been made.
 * @returns {{ essential: boolean, analytics: boolean, functional: boolean, timestamp: string, version: string } | null}
 */
export function getCookieConsent() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.essential === 'boolean') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/**
 * Checks if the user has completed the cookie consent decision.
 * @returns {boolean}
 */
export function hasUserConsented() {
  return getCookieConsent() !== null
}

/**
 * Checks whether a specific cookie category is currently permitted.
 * Essential cookies are ALWAYS permitted.
 *
 * @param {'essential' | 'analytics' | 'functional'} category
 * @returns {boolean}
 */
export function isCategoryAllowed(category) {
  if (category === COOKIE_CATEGORIES.ESSENTIAL) return true
  const consent = getCookieConsent()
  if (!consent) return false
  return Boolean(consent[category])
}

/**
 * Saves consent decision to localStorage and broadcasts update event.
 *
 * @param {{ analytics: boolean, functional: boolean }} preferences
 * @returns {{ essential: true, analytics: boolean, functional: boolean, timestamp: string, version: string }}
 */
export function saveCookieConsent(preferences = {}) {
  const record = {
    essential: true, // Essential is always true and cannot be disabled
    analytics: Boolean(preferences.analytics),
    functional: Boolean(preferences.functional),
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record))
      window.dispatchEvent(
        new CustomEvent('clinic:cookie-consent-updated', { detail: record })
      )
    } catch (err) {
      console.error('Failed to store cookie consent preferences:', err)
    }
  }

  return record
}

/**
 * Accepts all cookie categories (Essential + Analytics + Functional).
 */
export function acceptAllCookies() {
  return saveCookieConsent({ analytics: true, functional: true })
}

/**
 * Rejects all optional cookie categories (leaves only Essential enabled).
 */
export function rejectOptionalCookies() {
  return saveCookieConsent({ analytics: false, functional: false })
}

/**
 * Dispatches an event to open the Cookie Preferences Modal from anywhere (e.g. footer link).
 */
export function openCookiePreferencesModal() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('clinic:open-cookie-preferences'))
  }
}

/**
 * Executes a callback only if the specified category is allowed by user consent.
 * If user has not yet consented, optional scripts are prevented from executing.
 *
 * @param {'analytics' | 'functional'} category
 * @param {() => void} callback
 */
export function executeIfAllowed(category, callback) {
  if (isCategoryAllowed(category)) {
    try {
      callback()
    } catch (err) {
      console.warn(`[NutriDent Cookies] Error executing ${category} script:`, err)
    }
  }
}

