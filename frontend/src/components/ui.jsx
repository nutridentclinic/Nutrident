import { createContext, forwardRef, useContext, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, X } from 'lucide-react'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => {
    setToast({ message, type })
    window.clearTimeout(notify.timeout)
    notify.timeout = window.setTimeout(() => setToast(null), 4800)
  }

  useEffect(() => {
    const handleWaking = (e) => {
      if (e.detail?.waking) {
        setToast({ message: 'The clinic server is waking up from idle, please hold on…', type: 'info' })
      } else {
        setToast((current) => (current?.type === 'info' ? null : current))
      }
    }
    const handleReconnecting = (e) => {
      if (e.detail?.reconnecting) {
        setToast({ message: 'Reconnecting to clinic server…', type: 'info' })
      }
    }
    const handleReconnected = () => {
      setToast({ message: 'Connection restored', type: 'success' })
      window.setTimeout(() => {
        setToast((current) => (current?.message === 'Connection restored' ? null : current))
      }, 3000)
    }

    window.addEventListener('clinic-server-waking', handleWaking)
    window.addEventListener('clinic:reconnecting', handleReconnecting)
    window.addEventListener('clinic:reconnected', handleReconnected)
    return () => {
      window.removeEventListener('clinic-server-waking', handleWaking)
      window.removeEventListener('clinic:reconnecting', handleReconnecting)
      window.removeEventListener('clinic:reconnected', handleReconnected)
    }
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          {toast.type === 'error' ? <AlertCircle size={18} /> : toast.type === 'info' ? <LoaderCircle className="spin" size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
          <button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16} /></button>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

export function PageTitle({ eyebrow, title, description, actions }) {
  return (
    <div className="page-title-row">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading clinic data…' }) {
  return <div className="state-view" role="status"><LoaderCircle className="spin" size={20} />{label}</div>
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state-view state-error" role="alert">
      <AlertCircle size={19} />
      <span>{error?.message || 'We could not load this information.'}</span>
      {onRetry && <button className="button button-quiet button-small" onClick={onRetry}><RefreshCw size={14} /> Retry</button>}
    </div>
  )
}

export function EmptyState({ title = 'Nothing here yet', children, action }) {
  return <div className="empty-state"><span className="empty-mark"><CheckCircle2 size={19} /></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>
}

export function StatusBadge({ value }) {
  const normalized = String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return <span className={`status-badge status-${normalized}`}>{String(value || 'Unknown').replaceAll('-', ' ')}</span>
}

export function Field({ label, error, hint, children, className = '' }) {
  return <label className={`field ${className}`}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}{error && <span className="field-error">{error}</span>}</label>
}

export const TextInput = forwardRef(function TextInput({ as: Component = 'input', className = '', ...props }, ref) {
  return <Component ref={ref} className={`input ${className}`} {...props} />
})

export function SectionPanel({ title, description, actions, children, className = '' }) {
  return <section className={`section-panel ${className}`}><div className="section-panel-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions}</div>{children}</section>
}

export function ConfirmDialog({
  open,
  title,
  description,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Keep',
  confirmText,
  cancelText,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}) {
  const cancelRef = useRef(null)
  const dialogRef = useRef(null)
  const finalDescription = description || message
  const finalConfirmLabel = confirmText || confirmLabel
  const finalCancelLabel = cancelText || cancelLabel

  useEffect(() => {
    if (!open) return undefined
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) {
        onCancel()
        return
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, busy, onCancel])

  if (!open) return null
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}
    >
      <section
        ref={dialogRef}
        className="modal-panel confirm-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{finalDescription}</p>
        {children}
        <div className="inline-actions">
          <button ref={cancelRef} className="button button-quiet" onClick={onCancel} disabled={busy}>{finalCancelLabel}</button>
          <button className={`button ${danger ? 'button-danger' : 'button-primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : finalConfirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

export function AsyncView({ query, empty = false, children, emptyTitle, emptyDescription, emptyAction, retry }) {
  if (query?.isLoading) return <LoadingState />
  if (query?.isError) return <ErrorState error={query.error} onRetry={retry || (() => query.refetch?.())} />
  if (empty) return <EmptyState title={emptyTitle} action={emptyAction}>{emptyDescription}</EmptyState>
  return children
}

export function useConfirm() {
  const [options, setOptions] = useState(null)
  const resolveRef = useRef(null)
  const confirm = (nextOptions) => new Promise((resolve) => {
    resolveRef.current = resolve
    setOptions(nextOptions)
  })
  const settle = (value) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setOptions(null)
  }
  const dialog = options && <ConfirmDialog {...options} open onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  return { confirm, dialog }
}
