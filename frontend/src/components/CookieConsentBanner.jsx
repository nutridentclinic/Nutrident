import { useEffect, useState } from 'react'
import { Cookie, Shield, ChevronRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  hasUserConsented,
  acceptAllCookies,
  rejectOptionalCookies,
} from '../utils/cookieConsent.js'
import { CookiePreferencesModal } from './CookiePreferencesModal.jsx'

/**
 * Cookie Consent Banner component.
 * Appears for first-time visitors and provides quick choices:
 * - Accept All
 * - Reject Optional Cookies
 * - Customize Preferences
 * - Privacy Policy link
 */
export function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    // Check if user has already saved their consent preference
    if (!hasUserConsented()) {
      // Slight delay so initial page load render isn't jarring
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [])

  // Listen for custom event from footer or settings to open preferences modal
  useEffect(() => {
    const handleOpenModal = () => {
      setIsModalOpen(true)
    }
    const handleConsentUpdated = () => {
      setIsVisible(false)
    }

    window.addEventListener('clinic:open-cookie-preferences', handleOpenModal)
    window.addEventListener('clinic:cookie-consent-updated', handleConsentUpdated)

    return () => {
      window.removeEventListener('clinic:open-cookie-preferences', handleOpenModal)
      window.removeEventListener('clinic:cookie-consent-updated', handleConsentUpdated)
    }
  }, [])

  const handleAcceptAll = () => {
    acceptAllCookies()
    setIsVisible(false)
  }

  const handleRejectOptional = () => {
    rejectOptionalCookies()
    setIsVisible(false)
  }

  const handleOpenPreferences = () => {
    setIsModalOpen(true)
  }

  return (
    <>
      {isVisible && (
        <aside
          className="cookie-banner-wrapper"
          role="region"
          aria-label="Cookie consent banner"
        >
          <div className="cookie-banner-card">
            <div className="cookie-banner-content">
              <div className="cookie-banner-header">
                <span className="cookie-banner-icon-badge">
                  <Cookie size={20} className="text-teal" />
                </span>
                <h3 className="cookie-banner-title">We Value Your Privacy</h3>
              </div>
              <p className="cookie-banner-text">
                NutriDent Dental &amp; Diet Clinic uses essential cookies to safeguard authentication,
                protect your health appointments, and maintain clinical session integrity. With your
                consent, we also use optional cookies to measure traffic and remember your personalized
                portal settings. Read our{' '}
                <Link to="/privacy" className="cookie-inline-link">
                  Privacy Policy
                </Link>{' '}
                to learn more.
              </p>
            </div>

            <div className="cookie-banner-actions">
              <button
                type="button"
                className="button button-quiet button-small cookie-btn-customize"
                onClick={handleOpenPreferences}
              >
                Customize Preferences
              </button>
              <button
                type="button"
                className="button button-secondary button-small cookie-btn-reject"
                onClick={handleRejectOptional}
              >
                Reject Optional Cookies
              </button>
              <button
                type="button"
                className="button button-primary button-small cookie-btn-accept"
                onClick={handleAcceptAll}
              >
                Accept All
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Preferences Modal (can be opened from banner or footer link) */}
      <CookiePreferencesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}

