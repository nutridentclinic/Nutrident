import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, RotateCcw, ShieldCheck } from 'lucide-react'
import { api } from '../api/domains.js'
import { useAuthStore } from '../store/auth.js'
import { Field, TextInput, useToast } from '../components/ui.jsx'
import { OtpInput } from '../components/OtpInput.jsx'

export function maskEmail(email = '') {
  if (!email || !email.includes('@')) return email
  const [local, domain] = email.split('@')
  if (local.length <= 1) return `${local}***@${domain}`
  return `${local[0]}***@${domain}`
}

export function getSecondsRemaining(targetIsoDate) {
  if (!targetIsoDate) return 0
  const target = new Date(targetIsoDate).getTime()
  if (isNaN(target)) return 0
  const diff = Math.ceil((target - Date.now()) / 1000)
  return Math.max(0, diff)
}

function AuthShell({ eyebrow, title, description, children, asideTitle = 'A calmer way to care for your smile.' }) {
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">
            <img src="/favicon.svg" alt="Nutrident logo" className="brand-logo-img" />
          </span>
          <span>
            Nutrident<span className="brand-sub">Dental and Diet Clinic</span>
          </span>
        </Link>
        <div className="auth-aside-copy">
          <span className="eyebrow">Care that connects</span>
          <h2>{asideTitle}</h2>
          <p>Appointments, treatment plans and your records, thoughtfully brought together.</p>
          <span className="auth-aside-rule" />
        </div>
        <div className="auth-aside-bottom">
          <ShieldCheck size={16} />
          <span>Your account is protected by the clinic’s secure sign-in.</span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  )
}

function getHome(role) {
  return { patient: '/app', dentist: '/dentist', receptionist: '/reception', admin: '/admin' }[role] || '/app'
}

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.'),
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  phone: z.string().trim().min(8, 'Enter a valid phone number.'),
  password: z.string().min(6, 'Use at least 6 characters.'),
})

export function LoginPage() {
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const expired = params.get('reason') === 'expired'
  const stateNotice = location.state?.notice || ''
  const prefilledEmail = location.state?.email || ''

  const {
    register,
    handleSubmit,
    setValue,
    setError: setFieldError,
    formState: { errors: fieldErrors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: prefilledEmail, password: '' },
  })

  const setSession = useAuthStore((state) => state.setSession)

  const submit = async (fields) => {
    setError('')
    try {
      const result = await api.auth.login(fields)
      setSession(result.data)
      navigate(location.state?.returnTo || getHome(result.data.user?.role), { replace: true })
    } catch (cause) {
      setValue('password', '')
      if (cause.code === 'EMAIL_NOT_VERIFIED') {
        sessionStorage.setItem(
          'pendingVerification',
          JSON.stringify({
            email: cause.email || fields.email,
            resendAvailableAt: cause.resendAvailableAt || null,
          }),
        )
        navigate('/verify-otp', {
          replace: true,
          state: { notice: 'We sent you a new code' },
        })
        return
      }
      Object.entries(cause.fieldErrors || {}).forEach(([name, message]) => setFieldError(name, { type: 'server', message }))
      setError(cause.message)
    }
  }

  return (
    <AuthShell eyebrow="Welcome back" title="Sign in to your care." description="Use your clinic account to continue.">
      <form onSubmit={handleSubmit(submit)} className="stack-form">
        {stateNotice && <div className="notice notice-success">{stateNotice}</div>}
        {expired && <div className="notice notice-warn">Your session expired. Sign in again to continue.</div>}
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Email address" error={fieldErrors.email?.message}>
          <TextInput type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" error={fieldErrors.password?.message}>
          <TextInput type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        <div className="form-meta">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button disabled={isSubmitting} className="button button-primary button-wide">
          {isSubmitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
        </button>
        <p className="auth-switch">
          New to DrNutrident? <Link to="/register">Create a patient account</Link>
        </p>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors: fieldErrors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', phone: '', password: '' },
  })
  const navigate = useNavigate()

  const submit = async (fields) => {
    setError('')
    try {
      const result = await api.auth.register(fields)
      const data = result.data || {}
      sessionStorage.setItem(
        'pendingVerification',
        JSON.stringify({
          email: data.email || fields.email,
          otpSent: data.otpSent ?? true,
          resendAvailableAt: data.resendAvailableAt || null,
        }),
      )
      navigate('/verify-otp', { replace: true })
    } catch (cause) {
      Object.entries(cause.fieldErrors || {}).forEach(([name, message]) => setFieldError(name, { type: 'server', message }))
      setError(cause.message)
    }
  }

  return (
    <AuthShell
      eyebrow="Your care, in one place"
      title="Create your account."
      description="Patient accounts can book visits, keep records and follow their treatment plan."
    >
      <form onSubmit={handleSubmit(submit)} className="stack-form">
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Full name" error={fieldErrors.name?.message}>
          <TextInput autoComplete="name" {...register('name')} />
        </Field>
        <Field label="Email address" error={fieldErrors.email?.message}>
          <TextInput type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Phone number" error={fieldErrors.phone?.message}>
          <TextInput type="tel" autoComplete="tel" {...register('phone')} />
        </Field>
        <Field label="Password" hint="At least 6 characters" error={fieldErrors.password?.message}>
          <TextInput type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <button disabled={isSubmitting} className="button button-primary button-wide">
          {isSubmitting ? 'Creating account…' : 'Create account'} <ArrowRight size={16} />
        </button>
        <p className="auth-legal">
          By continuing, you agree to the clinic’s <Link to="/terms">terms</Link> and <Link to="/privacy">privacy notice</Link>.
        </p>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  )
}

export function VerifyOtpPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const notify = useToast()
  const setSession = useAuthStore((state) => state.setSession)

  const [email, setEmail] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState(null)
  const [otpSent, setOtpSent] = useState(true)
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lockCountdown, setLockCountdown] = useState(0)
  const [resendCountdown, setResendCountdown] = useState(0)

  // Load pending email from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem('pendingVerification')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed.email) {
          setEmail(parsed.email)
          if (parsed.resendAvailableAt) setResendAvailableAt(parsed.resendAvailableAt)
          if (parsed.otpSent === false) setOtpSent(false)
          return
        }
      } catch {
        // ignore JSON parse error
      }
    }
    const queryEmail = params.get('email')
    if (queryEmail) {
      setEmail(queryEmail)
      return
    }
    // No email to verify -> redirect to login
    navigate('/login', { replace: true })
  }, [navigate, params])

  // Resend countdown timer
  useEffect(() => {
    if (!resendAvailableAt) return
    const update = () => {
      const remaining = getSecondsRemaining(resendAvailableAt)
      setResendCountdown(remaining)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [resendAvailableAt])

  // Lockout countdown timer
  useEffect(() => {
    if (lockCountdown <= 0) return
    const timer = setInterval(() => {
      setLockCountdown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [lockCountdown])

  const verify = async (event) => {
    event.preventDefault()
    if (otp.length !== 6) return
    setBusy(true)
    setError('')

    try {
      const result = await api.auth.verifyOtp({ email, otp })
      sessionStorage.removeItem('pendingVerification')
      setSession(result.data)
      try {
        await api.auth.me()
      } catch {
        // best-effort me query
      }
      notify('Email verified successfully.')
      navigate(location.state?.returnTo || '/app', { replace: true })
    } catch (cause) {
      setError(cause.message)
      if (cause.status === 429 && cause.retryAfterSeconds) {
        setLockCountdown(cause.retryAfterSeconds)
      }
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (resendCountdown > 0 || busy) return
    setError('')
    try {
      const result = await api.auth.resendOtp({ email })
      notify('A new verification code has been sent. Check your email.')
      setOtpSent(true)
      const nextAvailable = result.data?.resendAvailableAt || new Date(Date.now() + 60 * 1000).toISOString()
      setResendAvailableAt(nextAvailable)
      sessionStorage.setItem(
        'pendingVerification',
        JSON.stringify({ email, resendAvailableAt: nextAvailable, otpSent: true }),
      )
    } catch (cause) {
      setError(cause.message)
      if (cause.status === 429 && cause.retryAfterSeconds) {
        setLockCountdown(cause.retryAfterSeconds)
      }
    }
  }

  const handleStartOver = () => {
    sessionStorage.removeItem('pendingVerification')
    navigate('/register', { replace: true })
  }

  return (
    <AuthShell
      eyebrow="Verification required"
      title="Check your email."
      description={`Enter the 6-digit code sent to ${maskEmail(email)} to access your care.`}
    >
      <form onSubmit={verify} className="stack-form">
        {location.state?.notice && <div className="notice notice-info">{location.state.notice}</div>}
        {!otpSent && (
          <div className="notice notice-warn">
            We could not send the code. Tap Resend.
          </div>
        )}
        {lockCountdown > 0 && (
          <div className="notice notice-error" role="alert">
            Account temporarily locked. Please wait {Math.floor(lockCountdown / 60)}m {lockCountdown % 60}s before trying again.
          </div>
        )}
        {error && lockCountdown === 0 && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}

        <Field label="6-digit verification code">
          <OtpInput
            value={otp}
            onChange={(val) => {
              setOtp(val)
              setError('')
            }}
            disabled={busy || lockCountdown > 0}
          />
        </Field>

        <button
          disabled={busy || otp.length !== 6 || lockCountdown > 0}
          className="button button-primary button-wide"
        >
          {busy ? 'Verifying…' : 'Verify email'} <Check size={16} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="button button-quiet button-wide"
            disabled={resendCountdown > 0 || busy || lockCountdown > 0}
            onClick={resend}
          >
            {resendCountdown > 0 ? (
              `Resend code in ${resendCountdown}s`
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <RotateCcw size={14} /> Resend code
              </span>
            )}
          </button>

          <button
            type="button"
            className="text-link"
            onClick={handleStartOver}
            style={{ fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}
          >
            Wrong email? Start over
          </button>
        </div>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api.auth.forgotPassword({ email })
      sessionStorage.setItem(
        'pendingReset',
        JSON.stringify({
          email,
          resendAvailableAt: result.data?.resendAvailableAt || new Date(Date.now() + 60 * 1000).toISOString(),
        }),
      )
      navigate('/reset-password/verify')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery · Step 1 of 3"
      title="Reset your password."
      description="Enter your account email. We’ll send you a 6-digit verification code."
    >
      <form onSubmit={submit} className="stack-form">
        {error && <div className="notice notice-error">{error}</div>}
        <Field label="Email address">
          <TextInput
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <button disabled={busy} className="button button-primary button-wide">
          {busy ? 'Sending code…' : 'Send verification code'} <ArrowRight size={16} />
        </button>
        <Link className="text-link auth-continue" to="/login">
          <ArrowLeft size={15} /> Back to sign in
        </Link>
      </form>
    </AuthShell>
  )
}

export function ResetPasswordVerifyPage() {
  const navigate = useNavigate()
  const notify = useToast()
  const [email, setEmail] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState(null)
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lockCountdown, setLockCountdown] = useState(0)
  const [resendCountdown, setResendCountdown] = useState(0)

  useEffect(() => {
    const raw = sessionStorage.getItem('pendingReset')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed.email) {
          setEmail(parsed.email)
          if (parsed.resendAvailableAt) setResendAvailableAt(parsed.resendAvailableAt)
          return
        }
      } catch {
        // ignore
      }
    }
    navigate('/forgot-password', { replace: true })
  }, [navigate])

  useEffect(() => {
    if (!resendAvailableAt) return
    const update = () => {
      const remaining = getSecondsRemaining(resendAvailableAt)
      setResendCountdown(remaining)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [resendAvailableAt])

  useEffect(() => {
    if (lockCountdown <= 0) return
    const timer = setInterval(() => {
      setLockCountdown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [lockCountdown])

  const verify = async (event) => {
    event.preventDefault()
    if (otp.length !== 6) return
    setBusy(true)
    setError('')

    try {
      const result = await api.auth.verifyResetOtp({ email, otp })
      const resetToken = result.data?.resetToken
      if (!resetToken) throw new Error('Verification failed. No reset token returned.')

      sessionStorage.setItem('resetToken', resetToken)
      navigate('/reset-password/new', { state: { resetToken } })
    } catch (cause) {
      setError(cause.message)
      if (cause.status === 429 && cause.retryAfterSeconds) {
        setLockCountdown(cause.retryAfterSeconds)
      }
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (resendCountdown > 0 || busy) return
    setError('')
    try {
      const result = await api.auth.forgotPassword({ email })
      notify('A new reset code has been sent. Check your email.')
      const nextAvailable = result.data?.resendAvailableAt || new Date(Date.now() + 60 * 1000).toISOString()
      setResendAvailableAt(nextAvailable)
      sessionStorage.setItem('pendingReset', JSON.stringify({ email, resendAvailableAt: nextAvailable }))
    } catch (cause) {
      setError(cause.message)
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery · Step 2 of 3"
      title="Verify code."
      description={`Enter the 6-digit code sent to ${maskEmail(email)}.`}
    >
      <form onSubmit={verify} className="stack-form">
        {lockCountdown > 0 && (
          <div className="notice notice-error" role="alert">
            Account temporarily locked. Please wait {Math.floor(lockCountdown / 60)}m {lockCountdown % 60}s before trying again.
          </div>
        )}
        {error && lockCountdown === 0 && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}

        <Field label="6-digit reset code">
          <OtpInput
            value={otp}
            onChange={(val) => {
              setOtp(val)
              setError('')
            }}
            disabled={busy || lockCountdown > 0}
          />
        </Field>

        <button
          disabled={busy || otp.length !== 6 || lockCountdown > 0}
          className="button button-primary button-wide"
        >
          {busy ? 'Verifying…' : 'Continue'} <ArrowRight size={16} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="button button-quiet button-wide"
            disabled={resendCountdown > 0 || busy || lockCountdown > 0}
            onClick={resend}
          >
            {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : 'Resend code'}
          </button>

          <Link to="/forgot-password" className="text-link" style={{ fontSize: '0.875rem' }}>
            <ArrowLeft size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Wrong email? Start over
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}

export function ResetPasswordNewPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const rawReset = sessionStorage.getItem('pendingReset')
    if (rawReset) {
      try {
        const parsed = JSON.parse(rawReset)
        if (parsed.email) setEmail(parsed.email)
      } catch {
        // ignore
      }
    }

    const stateToken = location.state?.resetToken
    const sessionToken = sessionStorage.getItem('resetToken')
    const activeToken = stateToken || sessionToken
    if (!activeToken) {
      navigate('/forgot-password', { replace: true })
      return
    }
    setToken(activeToken)
  }, [location.state, navigate])

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword

  const submit = async (event) => {
    event.preventDefault()
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    setError('')

    try {
      await api.auth.resetPassword({ resetToken: token, password })
      sessionStorage.removeItem('pendingReset')
      sessionStorage.removeItem('resetToken')
      useAuthStore.getState().clearSession()

      navigate('/login', {
        replace: true,
        state: {
          notice: 'Password updated. Sign in with your new password.',
          email,
        },
      })
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery · Step 3 of 3"
      title="Create new password."
      description="Choose a new, secure password with at least 6 characters."
    >
      <form onSubmit={submit} className="stack-form">
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
            {error.includes('expired') && (
              <div style={{ marginTop: '0.5rem' }}>
                <Link to="/forgot-password" className="text-link">
                  Request a new reset code
                </Link>
              </div>
            )}
          </div>
        )}

        <Field label="New password" hint="Minimum 6 characters">
          <div style={{ position: 'relative' }}>
            <TextInput
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowPassword((p) => !p)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : null}>
          <div style={{ position: 'relative' }}>
            <TextInput
              type={showConfirm ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowConfirm((p) => !p)}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <button disabled={busy || mismatch || password.length < 6} className="button button-primary button-wide">
          {busy ? 'Updating password…' : 'Set new password'} <ArrowRight size={16} />
        </button>

        <Link className="text-link auth-continue" to="/forgot-password">
          <ArrowLeft size={15} /> Back to recovery start
        </Link>
      </form>
    </AuthShell>
  )
}

// Legacy redirect component for /reset-password?email=...
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const email = params.get('email')
    if (email) {
      sessionStorage.setItem('pendingReset', JSON.stringify({ email }))
      navigate('/reset-password/verify', { replace: true })
    } else {
      navigate('/forgot-password', { replace: true })
    }
  }, [navigate, params])

  return null
}