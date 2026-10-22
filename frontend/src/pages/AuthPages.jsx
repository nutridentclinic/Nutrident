import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Check, HeartPulse, ShieldCheck } from 'lucide-react'
import { api } from '../api/domains.js'
import { useAuthStore } from '../store/auth.js'
import { Field, TextInput, useToast } from '../components/ui.jsx'

function AuthShell({ eyebrow, title, description, children, asideTitle = 'A calmer way to care for your smile.' }) {
  return <main className="auth-page"><section className="auth-aside"><Link to="/" className="brand-lockup"><span className="brand-mark"><HeartPulse size={21} /></span><span>DrNutrident<span className="brand-sub">Dental care, clearly.</span></span></Link><div className="auth-aside-copy"><span className="eyebrow">Care that connects</span><h2>{asideTitle}</h2><p>Appointments, treatment plans and your records, thoughtfully brought together.</p><span className="auth-aside-rule" /></div><div className="auth-aside-bottom"><ShieldCheck size={16} /><span>Your account is protected by the clinic’s secure sign-in.</span></div></section><section className="auth-form-wrap"><div className="auth-form"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="auth-description">{description}</p>{children}</div></section></main>
}

function getHome(role) {
  return { patient: '/app', dentist: '/dentist', receptionist: '/reception', admin: '/admin' }[role] || '/app'
}

const loginSchema = z.object({ email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') })
const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.'),
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  phone: z.string().trim().min(8, 'Enter a valid phone number.'),
  password: z.string().min(6, 'Use at least 6 characters.'),
})

export function LoginPage() {
  const [error, setError] = useState('')
  const { register, handleSubmit, setError: setFieldError, formState: { errors: fieldErrors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })
  const setSession = useAuthStore((state) => state.setSession)
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const expired = params.get('reason') === 'expired'
  const submit = async (fields) => {
    setError('')
    try {
      const result = await api.auth.login(fields)
      setSession(result.data)
      navigate(location.state?.returnTo || getHome(result.data.user?.role), { replace: true })
    } catch (cause) {
      Object.entries(cause.fieldErrors || {}).forEach(([name, message]) => setFieldError(name, { type: 'server', message }))
      setError(cause.message)
    }
  }
  return <AuthShell eyebrow="Welcome back" title="Sign in to your care." description="Use your clinic account to continue."><form onSubmit={handleSubmit(submit)} className="stack-form">{expired && <div className="notice notice-warn">Your session expired. Sign in again to continue.</div>}{error && <div className="notice notice-error" role="alert">{error}</div>}<Field label="Email address" error={fieldErrors.email?.message}><TextInput type="email" autoComplete="email" {...register('email')} /></Field><Field label="Password" error={fieldErrors.password?.message}><TextInput type="password" autoComplete="current-password" {...register('password')} /></Field><div className="form-meta"><Link to="/forgot-password">Forgot password?</Link></div><button disabled={isSubmitting} className="button button-primary button-wide">{isSubmitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} /></button><p className="auth-switch">New to DrNutrident? <Link to="/register">Create a patient account</Link></p></form></AuthShell>
}

export function RegisterPage() {
  const [error, setError] = useState('')
  const { register, handleSubmit, setError: setFieldError, formState: { errors: fieldErrors, isSubmitting } } = useForm({ resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '', phone: '', password: '' } })
  const setSession = useAuthStore((state) => state.setSession)
  const navigate = useNavigate()
  const submit = async (fields) => {
    setError('')
    try {
      const result = await api.auth.register(fields)
      setSession(result.data)
      navigate(`/verify-otp?userId=${encodeURIComponent(result.data.user?._id || '')}`, { replace: true })
    } catch (cause) {
      Object.entries(cause.fieldErrors || {}).forEach(([name, message]) => setFieldError(name, { type: 'server', message }))
      setError(cause.message)
    }
  }
  return <AuthShell eyebrow="Your care, in one place" title="Create your account." description="Patient accounts can book visits, keep records and follow their treatment plan."><form onSubmit={handleSubmit(submit)} className="stack-form">{error && <div className="notice notice-error" role="alert">{error}</div>}<Field label="Full name" error={fieldErrors.name?.message}><TextInput autoComplete="name" {...register('name')} /></Field><Field label="Email address" error={fieldErrors.email?.message}><TextInput type="email" autoComplete="email" {...register('email')} /></Field><Field label="Phone number" error={fieldErrors.phone?.message}><TextInput type="tel" autoComplete="tel" {...register('phone')} /></Field><Field label="Password" hint="At least 6 characters" error={fieldErrors.password?.message}><TextInput type="password" autoComplete="new-password" {...register('password')} /></Field><button disabled={isSubmitting} className="button button-primary button-wide">{isSubmitting ? 'Creating account…' : 'Create account'} <ArrowRight size={16} /></button><p className="auth-legal">By continuing, you agree to the clinic’s <Link to="/terms">terms</Link> and <Link to="/privacy">privacy notice</Link>.</p><p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p></form></AuthShell>
}

export function VerifyOtpPage() {
  const [params] = useSearchParams()
  const userId = params.get('userId')
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const notify = useToast()
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(false)
  const verify = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await api.auth.verifyOtp({ userId: userId || user?._id, otp }); notify('Email verified.'); navigate('/app', { replace: true }) }
    catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  const resend = async () => {
    setError('')
    try { await api.auth.resendOtp({ userId: userId || user?._id }); notify('A new code was requested. Check your email.'); setCooldown(true); window.setTimeout(() => setCooldown(false), 60000) }
    catch (cause) { setError(cause.message) }
  }
  return <AuthShell eyebrow="One last step" title="Check your email." description="Enter the one-time code sent to your email. Verification is optional; you can continue to your account now."><form onSubmit={verify} className="stack-form">{error && <div className="notice notice-error" role="alert">{error}</div>}<Field label="One-time code"><TextInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} /></Field><button disabled={busy || !userId && !user?._id} className="button button-primary button-wide">{busy ? 'Checking…' : 'Verify email'} <Check size={16} /></button><button type="button" className="button button-quiet button-wide" disabled={cooldown || !userId && !user?._id} onClick={resend}>{cooldown ? 'Wait before requesting another code' : 'Resend code'}</button><Link className="text-link auth-continue" to="/app">Continue without verifying <ArrowRight size={15} /></Link></form></AuthShell>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await api.auth.forgotPassword({ email }); setSent(true) } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <AuthShell eyebrow="Account recovery" title="Reset your password." description="We’ll send a one-time code if an account matches that email address."><form onSubmit={submit} className="stack-form">{error && <div className="notice notice-error">{error}</div>}{sent && <div className="notice notice-success">If an account exists for this email, a code has been sent. Continue to password reset.</div>}<Field label="Email address"><TextInput type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field><button disabled={busy} className="button button-primary button-wide">{busy ? 'Requesting code…' : 'Send reset code'} <ArrowRight size={16} /></button>{sent && <Link className="button button-outline button-wide" to={`/reset-password?email=${encodeURIComponent(email)}`}>Enter code and reset <ArrowRight size={16} /></Link>}<Link className="text-link auth-continue" to="/login"><ArrowLeft size={15} /> Back to sign in</Link></form></AuthShell>
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const [fields, setFields] = useState({ email: params.get('email') || '', otp: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setSession = useAuthStore((state) => state.setSession)
  const setTokens = useAuthStore((state) => state.setTokens)
  const navigate = useNavigate()
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api.auth.resetPassword(fields)
      setTokens(result.data)
      const profile = await api.auth.me()
      setSession({ ...result.data, ...profile.data })
      navigate('/app', { replace: true })
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <AuthShell eyebrow="Account recovery" title="Choose a new password." description="Use the one-time code sent to your inbox. The code expires after ten minutes."><form onSubmit={submit} className="stack-form">{error && <div className="notice notice-error" role="alert">{error}</div>}<Field label="Email address"><TextInput type="email" required value={fields.email} onChange={(event) => setFields({ ...fields, email: event.target.value })} /></Field><Field label="One-time code"><TextInput inputMode="numeric" maxLength={6} required value={fields.otp} onChange={(event) => setFields({ ...fields, otp: event.target.value.replace(/\D/g, '') })} /></Field><Field label="New password"><TextInput type="password" minLength={6} autoComplete="new-password" required value={fields.password} onChange={(event) => setFields({ ...fields, password: event.target.value })} /></Field><button disabled={busy} className="button button-primary button-wide">{busy ? 'Updating password…' : 'Update password'} <ArrowRight size={16} /></button></form></AuthShell>
}