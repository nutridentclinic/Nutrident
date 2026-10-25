import React from 'react'
import { Server, AlertCircle } from 'lucide-react'

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
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 my-4 text-amber-200">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 shrink-0">
          <Server className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-amber-300">{featureName} — Backend Update Pending</h4>
            <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
              Pending Redeploy
            </span>
          </div>
          <p className="text-sm text-slate-300 mt-1">{description}</p>
          {endpoint && (
            <p className="text-xs font-mono text-slate-400 mt-2 bg-slate-900/60 p-2 rounded border border-slate-700/50">
              Endpoint: {endpoint}
            </p>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 px-3 py-1.5 rounded-lg transition"
            >
              Check Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BackendPendingNotice
