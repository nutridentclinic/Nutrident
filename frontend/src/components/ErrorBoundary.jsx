import React, { Component } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    const isChunkError = /failed to fetch dynamically imported module|loading chunk/i.test(error?.message || '')
    if (isChunkError) {
      const alreadyReloaded = sessionStorage.getItem('drnutrident_chunk_reloaded')
      if (!alreadyReloaded) {
        sessionStorage.setItem('drnutrident_chunk_reloaded', '1')
        window.location.reload()
      }
    }
  }

  handleReset = () => {
    sessionStorage.removeItem('drnutrident_chunk_reloaded')
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error
      const isChunkError = /failed to fetch dynamically imported module|loading chunk/i.test(error?.message || '')
      const isDev = Boolean(import.meta.env.DEV)
      const dashboardPath = this.props.dashboardPath || '/app'

      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ error, reset: this.handleReset })
          : this.props.fallback
      }

      return (
        <div className="error-boundary-card" role="alert" style={{
          padding: '2rem',
          margin: '1.5rem auto',
          maxWidth: '680px',
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #fee2e2',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#fef2f2',
              color: '#dc2626',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}>
              <AlertTriangle size={22} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#111827', fontWeight: 700 }}>
                {isChunkError ? 'Application Update Available' : 'Something went wrong'}
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: '#4b5563', fontSize: '0.9rem' }}>
                {isChunkError
                  ? 'A new version of the application is available. Please reload the page to load updated assets.'
                  : 'An unexpected error occurred while loading this view. You can retry or return to your dashboard.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
            {isChunkError ? (
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  sessionStorage.removeItem('drnutrident_chunk_reloaded')
                  window.location.reload()
                }}
              >
                <RefreshCw size={15} /> Reload page
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary"
                onClick={this.handleReset}
              >
                <RefreshCw size={15} /> Try again
              </button>
            )}
            <Link
              to={dashboardPath}
              className="button button-outline"
              onClick={this.handleReset}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Home size={15} /> Go to dashboard
            </Link>
          </div>

          {isDev && error && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: '#dc2626',
              overflowX: 'auto',
            }}>
              <strong>Development Error Trace:</strong>
              <div style={{ marginTop: '0.4rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {error.toString()}
                {error.stack && `\n\n${error.stack}`}
              </div>
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

