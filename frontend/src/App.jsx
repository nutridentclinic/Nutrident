import { lazy, Suspense, useEffect } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { api } from './api/domains.js'
import { useAuthStore } from './store/auth.js'
import PortalLayout from './layouts/PortalLayout.jsx'
import { LoadingState } from './components/ui.jsx'
import { AboutPage, ContactPage, DentistDirectory, DentistProfile, DoctorProfilePage, LegalPage, PricingPage, PublicHome, PublicLayout, ServicesPage, SimplePublicPage } from './pages/PublicPages.jsx'
import { PatientAppointments, AppointmentBooking, AppointmentDetail, PatientBilling, PatientCare, PatientDashboard, PatientFamily, PatientProfile, PatientProfilePhoto, PatientRecords, PatientTreatmentPlans, PatientDentalChart, PatientTreatmentsPage } from './pages/PatientPages.jsx'
import { ClinicalRecord, DentistAvailability, DentistDashboard, DentistProfilePage, DentistReviews, DentistSchedule, PatientDirectory, QueuePage } from './pages/TeamPages.jsx'
import { AppointmentLookup, InvoiceCreator, NotificationsPage, ReceptionPage } from './pages/ReceptionPages.jsx'
import { Patient360 } from './pages/Patient360.jsx'
import SharedSettingsPage from './pages/SharedSettingsPage.jsx'
import { CookieConsentBanner } from './components/CookieConsentBanner.jsx'
import './App.css'
import { roleHome, getPortalBase } from './auth/routes.js'
const AdminPage = lazy(() => import('./pages/AdminPages.jsx').then((module) => ({ default: module.AdminPage })))
const LoginPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.LoginPage })))
const RegisterPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.RegisterPage })))
const VerifyOtpPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.VerifyOtpPage })))
const ForgotPasswordPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.ForgotPasswordPage })))
const ResetPasswordVerifyPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.ResetPasswordVerifyPage })))
const ResetPasswordNewPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.ResetPasswordNewPage })))
const ResetPasswordPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.ResetPasswordPage })))

import { logout } from './auth/session.js'

function GuestOnly({ children }) {
  const { status, user } = useAuthStore()
  if (status === 'booting') {
    return <LoadingState label="Verifying session…" />
  }
  if (user && !(user.role === 'patient' && user.isEmailVerified === false)) {
    return <Navigate to={roleHome[user.role] || '/app'} replace />
  }
  return children
}

function RequireRole({ roles }) {
  const { accessToken, user, status, setUserAndProfile } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const handleUnverified = () => {
      navigate('/verify-otp')
    }
    window.addEventListener('clinic:email-not-verified', handleUnverified)
    return () => window.removeEventListener('clinic:email-not-verified', handleUnverified)
  }, [navigate])

  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: api.auth.me,
    enabled: status === 'authed' || !!accessToken || !!user,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      const s = error?.response?.status || error?.status
      if (s === 401 || s === 403) return false
      return failureCount < 2
    },
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    if (status === 'anon' && !accessToken && !user) {
      logout({ reason: 'expired' })
    }
  }, [status, accessToken, user])

  useEffect(() => {
    const handleRevalidate = (event) => {
      if (
        ((event.type === 'pageshow' && event.persisted) ||
          event.type === 'popstate' ||
          event.type === 'focus' ||
          (event.type === 'visibilitychange' && document.visibilityState === 'visible')) &&
        meQuery.isStale
      ) {
        meQuery.refetch()
      }
    }

    window.addEventListener('pageshow', handleRevalidate)
    window.addEventListener('popstate', handleRevalidate)
    window.addEventListener('focus', handleRevalidate)
    document.addEventListener('visibilitychange', handleRevalidate)

    return () => {
      window.removeEventListener('pageshow', handleRevalidate)
      window.removeEventListener('popstate', handleRevalidate)
      window.removeEventListener('focus', handleRevalidate)
      document.removeEventListener('visibilitychange', handleRevalidate)
    }
  }, [meQuery])

  useEffect(() => {
    if (meQuery.data?.data?.user) {
      setUserAndProfile(meQuery.data.data.user, meQuery.data.data.profile)
    }
  }, [meQuery.data, setUserAndProfile])

  useEffect(() => {
    if (meQuery.isError) {
      const s = meQuery.error?.response?.status || meQuery.error?.status
      if (s === 401 || s === 403) {
        logout({ reason: 'expired' })
      }
    }
  }, [meQuery.isError, meQuery.error])

  if (status === 'booting') {
    return <LoadingState label="Verifying your secure session…" />
  }

  const currentUser = meQuery.data?.data?.user || user

  if (!currentUser) {
    if (meQuery.isError && (meQuery.error?.response?.status === 401 || meQuery.error?.status === 401)) {
      return <Navigate to="/login?reason=expired" replace state={{ returnTo: location.pathname + location.search }} />
    }
    if (status === 'anon' || (!accessToken && !user)) {
      return <Navigate to="/login?reason=expired" replace state={{ returnTo: location.pathname + location.search }} />
    }
    return <LoadingState label="Verifying your secure session…" />
  }
  const currentProfile = meQuery.data?.data?.profile || useAuthStore.getState().profile

  if (meQuery.isLoading && !currentUser) {
    return <LoadingState label="Verifying your secure session…" />
  }

  if (!currentUser) {
    if (meQuery.isError) {
      return (
        <div className="center-shell" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Connection issue</h2>
          <p>We could not connect to the clinic server. Please check your connection or retry.</p>
          <button className="primary-button" onClick={() => meQuery.refetch()}>
            Retry connection
          </button>
        </div>
      )
    }
    return <Navigate to="/login?reason=expired" replace />
  }

  if (currentUser.role === 'patient' && currentUser.isEmailVerified === false) {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pendingVerification', JSON.stringify({ email: currentUser.email }))
    }
    return <Navigate to="/verify-otp" replace />
  }

  if (!roles.includes(currentUser.role)) {
    return <Navigate to={roleHome[currentUser.role] || '/'} replace />
  }

  if (
    currentUser.role === 'dentist' &&
    currentProfile &&
    !(currentProfile.weeklyAvailability || []).some((day) => day.slots?.length) &&
    location.pathname !== '/dentist/availability'
  ) {
    return <Navigate to="/dentist/availability" replace />
  }

  return <Outlet />
}

function Landing() {
  const { accessToken, user } = useAuthStore()
  if (accessToken && user) return <Navigate to={roleHome[user.role] || '/app'} replace />
  return <PublicHome />
}

export function PortalNotFound({ homePath, portalName }) {
  const { user } = useAuthStore()
  const role = user?.role || 'patient'
  const computedHome = homePath || getPortalBase(role)
  const computedName = portalName || (role === 'receptionist' ? 'Reception' : role === 'dentist' ? 'Dentist' : role === 'admin' ? 'Admin' : 'Care')
  return (
    <div className="section-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem', margin: '2rem auto', maxWidth: '540px' }}>
      <span className="eyebrow" style={{ color: '#d97706' }}>Page not found</span>
      <h2 style={{ fontSize: '1.5rem', margin: '0.5rem 0 1rem' }}>This {computedName} page does not exist.</h2>
      <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
        The {computedName.toLowerCase()} view or tool you are looking for may have been moved, removed, or is temporarily unavailable.
      </p>
      <Link to={computedHome} className="button button-primary">
        Return to {computedName} overview <ArrowRight size={16} />
      </Link>
    </div>
  )
}

function LegacyRedirect({ toPrefix, stripPrefix }) {
  const location = useLocation()
  const subpath = location.pathname.replace(new RegExp(`^${stripPrefix}`), '')
  return <Navigate to={`${toPrefix}${subpath}${location.search}`} replace />
}

function NotFound() {
  return <main className="not-found"><span className="eyebrow">404 / Page not found</span><h1>This page isn’t here.</h1><Link className="button button-primary" to="/">Return home <ArrowRight size={16} /></Link></main>
}

function PatientProfileWorkspace() {
  return <><PatientProfile /><PatientProfilePhoto /></>
}

export default function App() {
  const { status, setSession, setStatus } = useAuthStore()

  useEffect(() => {
    let active = true
    if (status === 'booting') {
      api.auth.me()
        .then((res) => {
          if (active && res?.data?.user) {
            setSession({
              user: res.data.user,
              profile: res.data.profile || null,
              accessToken: 'cookie-session',
              status: 'authed',
            })
          }
        })
        .catch(() => {
          if (active) {
            setStatus('anon')
          }
        })
    }
    return () => {
      active = false
    }
  }, [status, setSession, setStatus])

  return (
    <>
      <Suspense fallback={<LoadingState label="Preparing your workspace…" />}>
        <Routes>
    <Route element={<PublicLayout />}>
      <Route path="/" element={<Landing />} />
      <Route path="/doctor" element={<DoctorProfilePage />} />
      <Route path="/dentists" element={<Navigate to="/doctor" replace />} />
      <Route path="/dentists/:id" element={<Navigate to="/doctor" replace />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/privacy" element={<LegalPage type="privacy" />} />
      <Route path="/terms" element={<LegalPage type="terms" />} />
    </Route>
    <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
    <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
    <Route path="/verify-otp" element={<GuestOnly><VerifyOtpPage /></GuestOnly>} />
    <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
    <Route path="/reset-password/verify" element={<GuestOnly><ResetPasswordVerifyPage /></GuestOnly>} />
    <Route path="/reset-password/new" element={<GuestOnly><ResetPasswordNewPage /></GuestOnly>} />
    <Route path="/reset-password" element={<GuestOnly><ResetPasswordPage /></GuestOnly>} />
    <Route path="/receptionist" element={<Navigate to="/reception" replace />} />
    <Route path="/receptionist/*" element={<LegacyRedirect toPrefix="/reception" stripPrefix="/receptionist" />} />
    <Route element={<RequireRole roles={['patient']} />}>
      <Route path="/app" element={<PortalLayout />}>
        <Route index element={<PatientDashboard />} /><Route path="appointments" element={<PatientAppointments />} /><Route path="appointments/:id" element={<AppointmentDetail />} />
        <Route path="book" element={<AppointmentBooking />} />
        <Route path="book/:dentistId" element={<Navigate to="/app/book" replace />} />
        <Route path="records" element={<PatientRecords />} />
        <Route path="treatment-plans" element={<PatientTreatmentPlans />} />
        <Route path="treatments" element={<PatientTreatmentsPage />} />
        <Route path="dental-chart" element={<PatientDentalChart />} />
        <Route path="care" element={<Navigate to="/app/treatment-plans" replace />} />
        <Route path="billing" element={<PatientBilling />} /><Route path="family" element={<PatientFamily />} />
        <Route path="profile" element={<PatientProfileWorkspace />} />
        <Route path="settings" element={<SharedSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<PortalNotFound />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['dentist']} />}>
      <Route path="/dentist" element={<PortalLayout />}>
        <Route index element={<DentistDashboard />} /><Route path="appointments" element={<DentistSchedule />} /><Route path="availability" element={<DentistAvailability />} />
        <Route path="patients" element={<PatientDirectory mode="dentist" />} /><Route path="patients/:patientId" element={<Patient360 />} />
        <Route path="reviews" element={<DentistReviews />} /><Route path="queue" element={<QueuePage role="dentist" />} /><Route path="profile" element={<DentistProfilePage />} />
        <Route path="settings" element={<SharedSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<PortalNotFound />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['receptionist']} />}>
      <Route path="/reception" element={<PortalLayout />}>
        <Route index element={<ReceptionPage page="dashboard" />} /><Route path="appointments" element={<AppointmentLookup />} /><Route path="patients" element={<PatientDirectory />} />
        <Route path="patients/:patientId" element={<Patient360 readOnly />} /><Route path="queue" element={<QueuePage role="receptionist" />} /><Route path="invoices" element={<InvoiceCreator />} />
        <Route path="settings" element={<SharedSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<PortalNotFound />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['admin']} />}>
      <Route path="/admin" element={<PortalLayout />}>
        <Route index element={<AdminPage page="dashboard" />} />
        <Route path="appointments" element={<AdminPage page="appointments" />} />
        <Route path="dentists" element={<AdminPage page="dentists" />} />
        <Route path="staff" element={<AdminPage page="staff" />} />
        <Route path="patients" element={<AdminPage page="patients" />} />
        <Route path="patients/:patientId" element={<Patient360 readOnly />} />
        <Route path="treatments" element={<AdminPage page="treatments" />} />
        <Route path="coupons" element={<AdminPage page="coupons" />} />
        <Route path="payments" element={<AdminPage page="payments" />} />
        <Route path="reviews" element={<AdminPage page="reviews" />} />
        <Route path="clinics" element={<AdminPage page="clinics" />} />
        <Route path="settings" element={<AdminPage page="settings" />} />
        <Route path="account" element={<SharedSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<PortalNotFound />} />
      </Route>
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
</Suspense>
<CookieConsentBanner />
</>
  )
}