import { useEffect, useRef, useState } from 'react'
import { logout } from '../auth/session.js'
import { useAuthStore } from '../store/auth.js'

export function useIdleLogout() {
  const user = useAuthStore((state) => state.user)
  const isStaff = user && ['dentist', 'receptionist', 'admin'].includes(user.role)
  const defaultMinutes = user?.role === 'receptionist' ? 60 : 30
  const idleMinutes = isStaff ? Number(import.meta.env.VITE_IDLE_LOGOUT_MINUTES || defaultMinutes) : 0

  const [warningOpen, setWarningOpen] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(60)

  const warningTimerRef = useRef(null)
  const logoutTimerRef = useRef(null)
  const countdownIntervalRef = useRef(null)

  const clearTimers = () => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
  }

  const resetTimer = () => {
    if (!idleMinutes || idleMinutes <= 0) return
    clearTimers()
    setWarningOpen(false)
    setSecondsRemaining(60)

    const warningMs = Math.max(1000, (idleMinutes * 60 - 60) * 1000)
    warningTimerRef.current = setTimeout(() => {
      setWarningOpen(true)
      let sec = 60
      countdownIntervalRef.current = setInterval(() => {
        sec -= 1
        setSecondsRemaining(sec)
        if (sec <= 0) {
          clearInterval(countdownIntervalRef.current)
          logout({ reason: 'idle' })
        }
      }, 1000)
    }, warningMs)
  }

  useEffect(() => {
    if (!idleMinutes || idleMinutes <= 0) return

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    const handleActivity = () => {
      if (!warningOpen) {
        resetTimer()
      }
    }

    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }))
    resetTimer()

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity))
      clearTimers()
    }
  }, [idleMinutes, warningOpen])

  return {
    warningOpen,
    secondsRemaining,
    stayLoggedIn: resetTimer,
    logoutNow: () => logout({ reason: 'manual' }),
  }
}

export function IdleWarningModal({ open, secondsRemaining, onStayLoggedIn, onLogout }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="modal-card">
        <h2 id="idle-title" className="modal-title">Session Expiring Soon</h2>
        <p className="modal-copy">
          You have been inactive. For security on clinic workstations, your session will end in{' '}
          <strong>{secondsRemaining} seconds</strong>.
        </p>
        <div className="modal-actions">
          <button className="button button-quiet" onClick={onLogout}>
            Sign out now
          </button>
          <button className="button button-primary" onClick={onStayLoggedIn}>
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  )
}
