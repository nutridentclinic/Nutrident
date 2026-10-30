import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CookieConsentBanner } from './CookieConsentBanner.jsx'
import { CookiePreferencesModal } from './CookiePreferencesModal.jsx'
import {
  getCookieConsent,
  saveCookieConsent,
  acceptAllCookies,
  rejectOptionalCookies,
  isCategoryAllowed,
  executeIfAllowed,
  CONSENT_STORAGE_KEY,
} from '../utils/cookieConsent.js'

describe('Cookie Consent Management & Components', () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('1. Cookie banner appears for a first-time visitor (no stored consent)', async () => {
    render(
      <MemoryRouter>
        <CookieConsentBanner />
      </MemoryRouter>
    )

    // Initially banner appears after timer
    await waitFor(() => {
      expect(screen.getByText('We Value Your Privacy')).toBeTruthy()
    }, { timeout: 1500 })

    expect(screen.getByText(/NutriDent Dental & Diet Clinic uses essential cookies/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /accept all/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reject optional cookies/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /customize preferences/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /privacy policy/i })).toBeTruthy()
  })

  it('2. Accept All saves all optional preferences and hides the banner', async () => {
    render(
      <MemoryRouter>
        <CookieConsentBanner />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('We Value Your Privacy')).toBeTruthy()
    })

    const acceptBtn = screen.getByRole('button', { name: /accept all/i })
    fireEvent.click(acceptBtn)

    const saved = getCookieConsent()
    expect(saved).not.toBeNull()
    expect(saved.essential).toBe(true)
    expect(saved.analytics).toBe(true)
    expect(saved.functional).toBe(true)
    expect(saved.timestamp).toBeDefined()

    expect(isCategoryAllowed('essential')).toBe(true)
    expect(isCategoryAllowed('analytics')).toBe(true)
    expect(isCategoryAllowed('functional')).toBe(true)

    await waitFor(() => {
      expect(screen.queryByText('We Value Your Privacy')).toBeNull()
    })
  })

  it('3. Reject Optional Cookies disables optional cookies', async () => {
    render(
      <MemoryRouter>
        <CookieConsentBanner />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('We Value Your Privacy')).toBeTruthy()
    })

    const rejectBtn = screen.getByRole('button', { name: /reject optional cookies/i })
    fireEvent.click(rejectBtn)

    const saved = getCookieConsent()
    expect(saved).not.toBeNull()
    expect(saved.essential).toBe(true)
    expect(saved.analytics).toBe(false)
    expect(saved.functional).toBe(false)

    expect(isCategoryAllowed('essential')).toBe(true)
    expect(isCategoryAllowed('analytics')).toBe(false)
    expect(isCategoryAllowed('functional')).toBe(false)

    await waitFor(() => {
      expect(screen.queryByText('We Value Your Privacy')).toBeNull()
    })
  })

  it('4. Customize Preferences allows selecting specific categories', async () => {
    const handleClose = vi.fn()
    render(
      <MemoryRouter>
        <CookiePreferencesModal isOpen={true} onClose={handleClose} />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Cookie Preferences' })).toBeTruthy()
    expect(screen.getByText('Essential Cookies')).toBeTruthy()
    expect(screen.getByText('Always Active')).toBeTruthy()

    // Enable analytics toggle, leave functional toggle off
    const analyticsToggle = screen.getByLabelText(/Analytics Cookies/i, { selector: 'input' })
    expect(analyticsToggle.checked).toBe(false)
    fireEvent.click(analyticsToggle)
    expect(analyticsToggle.checked).toBe(true)

    const saveBtn = screen.getByRole('button', { name: /save preferences/i })
    fireEvent.click(saveBtn)

    const consent = getCookieConsent()
    expect(consent.essential).toBe(true)
    expect(consent.analytics).toBe(true)
    expect(consent.functional).toBe(false)
  })

  it('5. Refreshing the page preserves the consent decision and does not re-show banner', () => {
    // Save previous decision
    saveCookieConsent({ analytics: true, functional: false })

    render(
      <MemoryRouter>
        <CookieConsentBanner />
      </MemoryRouter>
    )

    // Should NOT show banner
    expect(screen.queryByText('We Value Your Privacy')).toBeNull()
    const current = getCookieConsent()
    expect(current.analytics).toBe(true)
    expect(current.functional).toBe(false)
  })

  it('6. Cookie Settings allows users to change preferences and update consent later', async () => {
    // Initial rejection
    rejectOptionalCookies()
    expect(isCategoryAllowed('analytics')).toBe(false)

    // User later changes decision
    const handleClose = vi.fn()
    render(
      <MemoryRouter>
        <CookiePreferencesModal isOpen={true} onClose={handleClose} />
      </MemoryRouter>
    )

    // Click "Accept All" inside modal
    const acceptAllBtn = screen.getByRole('button', { name: /accept all/i })
    fireEvent.click(acceptAllBtn)

    const updated = getCookieConsent()
    expect(updated.analytics).toBe(true)
    expect(updated.functional).toBe(true)
    expect(isCategoryAllowed('analytics')).toBe(true)
  })

  it('7. Optional tracking scripts do not execute without consent', () => {
    const analyticsCallback = vi.fn()
    const functionalCallback = vi.fn()

    // Without consent
    executeIfAllowed('analytics', analyticsCallback)
    executeIfAllowed('functional', functionalCallback)
    expect(analyticsCallback).not.toHaveBeenCalled()
    expect(functionalCallback).not.toHaveBeenCalled()

    // After consenting to analytics only
    saveCookieConsent({ analytics: true, functional: false })
    executeIfAllowed('analytics', analyticsCallback)
    executeIfAllowed('functional', functionalCallback)
    expect(analyticsCallback).toHaveBeenCalledTimes(1)
    expect(functionalCallback).not.toHaveBeenCalled()
  })

  it('8. Essential category is strictly required and cannot be toggled off', () => {
    // Even if false is passed, essential must remain true
    const result = saveCookieConsent({ essential: false, analytics: false, functional: false })
    expect(result.essential).toBe(true)
    expect(isCategoryAllowed('essential')).toBe(true)
  })
})
