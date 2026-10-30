import React from 'react'
import { Server } from 'lucide-react'

/**
 * Friendly notice component shown when a frontend feature requires
 * a newly added backend endpoint that has not yet been deployed to Render.
 */
export function BackendPendingNotice({
  featureName = 'This feature',
  endpoint = '',
  description = 'A backend update is pending deployment on Render. Once the owner redeploys, this section will automatically activate.',
  onRetry = null,
}) {
  return (
    <div className="notice notice-warn" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
      <div style={{ color: 'var(--coral)', flexShrink: 0, marginTop: '2px' }}>
        <Server size={20} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <strong style={{ color: 'var(--ink)' }}>{featureName} — Backend Update Pending</strong>
          <span className="status-badge status-pending">Pending Redeploy</span>
        </div>
        <p style={{ marginTop: '0.25rem', color: 'var(--body)', fontSize: '13.5px' }}>{description}</p>
        {endpoint && (
          <code style={{ display: 'inline-block', marginTop: '0.5rem', fontSize: '12px' }}>
            Endpoint: {endpoint}
          </code>
        )}
        {onRetry && (
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              onClick={onRetry}
              className="button button-quiet button-small"
            >
              Check Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default BackendPendingNotice

