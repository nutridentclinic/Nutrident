import { useEffect, useState } from 'react'
import { Check, ShieldCheck, BarChart3, Settings2, X, Lock } from 'lucide-react'
import {
  getCookieConsent,
  saveCookieConsent,
  acceptAllCookies,
  rejectOptionalCookies,
} from '../utils/cookieConsent.js'
import { Link } from 'react-router-dom'

/**
 * Cookie Preferences Modal
 * Allows granular configuration of Essential, Analytics, and Functional cookies.
 */
export function CookiePreferencesModal({ isOpen, onClose }) {
  const [analytics, setAnalytics] = useState(false)
  const [functional, setFunctional] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState(false)

  // Initialize toggles from existing consent on open
  useEffect(() => {
    if (isOpen) {
      const consent = getCookieConsent()
      setAnalytics(Boolean(consent?.analytics))
      setFunctional(Boolean(consent?.functional))
      setSaveFeedback(false)
    }
  }, [isOpen])

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSave = () => {
    saveCookieConsent({ analytics, functional })
    setSaveFeedback(true)
    setTimeout(() => {
      onClose?.()
    }, 400)
  }

  const handleAcceptAll = () => {
    acceptAllCookies()
    setAnalytics(true)
    setFunctional(true)
    setSaveFeedback(true)
    setTimeout(() => {
      onClose?.()
    }, 400)
  }

  const handleRejectOptional = () => {
    rejectOptionalCookies()
    setAnalytics(false)
    setFunctional(false)
    setSaveFeedback(true)
    setTimeout(() => {
      onClose?.()
    }, 400)
  }

  return (
    <div
      className="modal-backdrop cookie-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="modal-dialog cookie-modal-panel">
        <div className="cookie-modal-header">
          <div className="cookie-modal-title-wrap">
            <div className="cookie-modal-icon-badge">
              <ShieldCheck size={22} className="text-teal" />
            </div>
            <div>
              <h2 id="cookie-modal-title" className="cookie-modal-title">
                Cookie Preferences
              </h2>
              <p className="cookie-modal-subtitle">
                Manage how NutriDent Clinic uses cookies on your device.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-button cookie-modal-close"
            onClick={onClose}
            aria-label="Close cookie preferences modal"
          >
            <X size={20} />
          </button>
        </div>

        <div className="cookie-modal-body">
          <p className="cookie-modal-intro">
            Cookies are small files stored on your device to keep you securely signed in,
            remember clinical portal preferences, and help us analyze clinic traffic. You
            can choose which optional cookie categories you allow below.
          </p>

          {/* Category A: Essential Cookies */}
          <section className="cookie-category-card">
            <div className="cookie-category-header">
              <div className="cookie-category-info">
                <span className="cookie-category-icon">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <div className="cookie-category-title-row">
                    <strong className="cookie-category-title">Essential Cookies</strong>
                    <span className="badge badge-required">
                      <Lock size={12} style={{ display: 'inline', marginRight: 4 }} />
                      Always Active
                    </span>
                  </div>
                  <p className="cookie-category-desc">
                    Strictly required for secure authentication (HttpOnly JWT access &amp; refresh
                    tokens), session integrity, CSRF defense, and core clinic operations. These
                    cannot be disabled.
                  </p>
                </div>
              </div>
            </div>
            <div className="cookie-details-snippet">
              <span>Examples: <code>accessToken</code>, <code>refreshToken</code> (HttpOnly)</span>
              <span>Duration: Session / 7–30 Days</span>
            </div>
          </section>

          {/* Category B: Analytics Cookies */}
          <section className="cookie-category-card">
            <div className="cookie-category-header">
              <div className="cookie-category-info">
                <span className="cookie-category-icon">
                  <BarChart3 size={18} />
                </span>
                <div>
                  <div className="cookie-category-title-row">
                    <strong className="cookie-category-title">Analytics Cookies</strong>
                    <label className="cookie-toggle-label" htmlFor="analytics-toggle">
                      <input
                        type="checkbox"
                        id="analytics-toggle"
                        aria-label="Analytics Cookies"
                        className="cookie-toggle-input"
                        checked={analytics}
                        onChange={(e) => setAnalytics(e.target.checked)}
                      />
                      <span className="cookie-toggle-slider" />
                    </label>
                  </div>
                  <p className="cookie-category-desc">
                    Used for anonymous website traffic measurement, page load performance, and
                    diagnostic analysis to help us improve the clinic website and portal speed.
                  </p>
                </div>
              </div>
            </div>
            <div className="cookie-details-snippet">
              <span>Status: {analytics ? 'Allowed' : 'Blocked'}</span>
              <span>Default: Disabled until consent</span>
            </div>
          </section>

          {/* Category C: Functional Cookies */}
          <section className="cookie-category-card">
            <div className="cookie-category-header">
              <div className="cookie-category-info">
                <span className="cookie-category-icon">
                  <Settings2 size={18} />
                </span>
                <div>
                  <div className="cookie-category-title-row">
                    <strong className="cookie-category-title">Functional Cookies</strong>
                    <label className="cookie-toggle-label" htmlFor="functional-toggle">
                      <input
                        type="checkbox"
                        id="functional-toggle"
                        aria-label="Functional Cookies"
                        className="cookie-toggle-input"
                        checked={functional}
                        onChange={(e) => setFunctional(e.target.checked)}
                      />
                      <span className="cookie-toggle-slider" />
                    </label>
                  </div>
                  <p className="cookie-category-desc">
                    Used for remembering your personal site preferences, view density, clinical chart
                    display preferences, and enhancing interactive portal features.
                  </p>
                </div>
              </div>
            </div>
            <div className="cookie-details-snippet">
              <span>Status: {functional ? 'Allowed' : 'Blocked'}</span>
              <span>Default: Disabled until consent</span>
            </div>
          </section>
        </div>

        <div className="cookie-modal-footer">
          <div className="cookie-modal-footer-links">
            <Link to="/privacy" onClick={onClose} className="cookie-policy-link">
              Read our Privacy Policy
            </Link>
          </div>
          <div className="cookie-modal-footer-actions">
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={handleRejectOptional}
            >
              Reject Optional
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={handleAcceptAll}
            >
              Accept All
            </button>
            <button
              type="button"
              className="button button-primary button-small"
              onClick={handleSave}
            >
              {saveFeedback ? (
                <>
                  <Check size={15} style={{ marginRight: 4 }} /> Saved
                </>
              ) : (
                'Save Preferences'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
