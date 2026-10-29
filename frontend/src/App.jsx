import { lazy, Suspense, useEffect } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { api } from './api/domains.js'
import { useAuthStore } from './store/auth.js'
import PortalLayout from './layouts/PortalLayout.jsx'
import { LoadingState } from './components/ui.jsx'
import { AboutPage, ContactPage, DentistDirectory, DentistProfile, DoctorProfilePage, LegalPage, PricingPage, PublicHome, PublicLayout, ServicesPage, SimplePublicPage } from './pages/PublicPages.jsx'
import { PatientAppointments, AppointmentBooking, AppointmentDetail, PatientBilling, PatientCare, PatientDashboard, PatientFamily, PatientPrescriptions, PatientProfile, PatientProfilePhoto, PatientRecords, PatientTreatmentPlans, PatientDentalChart } from './pages/PatientPages.jsx'
import { ClinicalRecord, DentistAvailability, DentistDashboard, DentistProfilePage, DentistReviews, DentistSchedule, PatientDirectory, QueuePage } from './pages/TeamPages.jsx'
import { AppointmentLookup, InvoiceCreator, NotificationsPage, ReceptionPage } from './pages/ReceptionPages.jsx'
import { Patient360 } from './pages/Patient360.jsx'
import SharedSettingsPage from './pages/SharedSettingsPage.jsx'
import './App.css'

const roleHome = { patient: '/app', dentist: '/dentist', receptionist: '/reception', admin: '/admin' }
const ConsultationCall = lazy(() => import('./pages/ConsultationPages.jsx').then((module) => ({ default: module.ConsultationCall })))
const ConsultationLobby = lazy(() => import('./pages/ConsultationPages.jsx').then((module) => ({ default: module.ConsultationLobby })))
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
  const { accessToken, user } = useAuthStore()
  if (accessToken && user && !(user.role === 'patient' && user.isEmailVerified === false)) {
    return <Navigate to={roleHome[user.role] || '/app'} replace />
  }
  return children
}

function RequireRole({ roles }) {
  const { accessToken, setUserAndProfile } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const handleUnverified = () => {
      navigate('/verify-otp')
    }
    window.addEventListener('clinic:email-not-verified', handleUnverified)
    return () => window.removeEventListener('clinic:email-not-verified', handleUnverified)
  }, [navigate])

  useEffect(() => {
    if (!accessToken) {
      logout({ reason: 'expired' })
    }
  }, [accessToken])

  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: api.auth.me,
    enabled: !!accessToken,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      const status = error?.response?.status || error?.status
      if (status === 401 || status === 403) return false
      return failureCount < 2
    },
    staleTime: 60 * 1000,
  })

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
    if (meQuery.data?.data?.user && accessToken) {
      setUserAndProfile(meQuery.data.data.user, meQuery.data.data.profile)
    }
  }, [meQuery.data, accessToken, setUserAndProfile])

  useEffect(() => {
    if (meQuery.isError) {
      const status = meQuery.error?.response?.status || meQuery.error?.status
      // Only logout when refresh itself fails with 401/403 (invalid/expired/revoked)
      if (status === 401 || status === 403) {
        logout({ reason: 'expired' })
      }
    }
  }, [meQuery.isError, meQuery.error])

  if (!accessToken) {
    return <Navigate to="/login?reason=expired" replace state={{ returnTo: location.pathname + location.search }} />
  }

  const currentUser = meQuery.data?.data?.user || useAuthStore.getState().user
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

export function PortalNotFound({ homePath = '/reception', portalName = 'Reception' }) {
  return (
    <div className="section-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem', margin: '2rem auto', maxWidth: '540px' }}>
      <span className="eyebrow" style={{ color: '#d97706' }}>Page not found</span>
      <h2 style={{ fontSize: '1.5rem', margin: '0.5rem 0 1rem' }}>This {portalName} page does not exist.</h2>
      <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
        The reception view or tool you are looking for may have been moved, removed, or is temporarily unavailable.
      </p>
      <Link to={homePath} className="button button-primary">
        Return to {portalName} overview <ArrowRight size={16} />
      </Link>
    </div>
  )
}

function NotFound() {
  return <main className="not-found"><span className="eyebrow">404 / Page not found</span><h1>This page isn’t here.</h1><Link className="button button-primary" to="/">Return home <ArrowRight size={16} /></Link></main>
}

function PatientProfileWorkspace() {
  return <><PatientProfile /><PatientProfilePhoto /></>
}

export default function App() {
  return <Suspense fallback={<LoadingState label="Preparing your workspace…" />}><Routes>
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
    <Route element={<RequireRole roles={['patient']} />}>
      <Route path="/app" element={<PortalLayout />}>
        <Route index element={<PatientDashboard />} /><Route path="appointments" element={<PatientAppointments />} /><Route path="appointments/:id" element={<AppointmentDetail />} />
        <Route path="book" element={<AppointmentBooking />} />
        <Route path="book/:dentistId" element={<Navigate to="/app/book" replace />} />
        <Route path="prescriptions" element={<PatientPrescriptions />} /><Route path="records" element={<PatientRecords />} />
        <Route path="treatment-plans" element={<PatientTreatmentPlans />} />
        <Route path="dental-chart" element={<PatientDentalChart />} />
        <Route path="care" element={<Navigate to="/app/treatment-plans" replace />} />
        <Route path="billing" element={<PatientBilling />} /><Route path="family" element={<PatientFamily />} />
        <Route path="profile" element={<PatientProfileWorkspace />} />
        <Route path="settings" element={<SharedSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['dentist']} />}>
      <Route path="/dentist" element={<PortalLayout />}>
        <Route index element={<DentistDashboard />} /><Route path="appointments" element={<DentistSchedule />} /><Route path="availability" element={<DentistAvailability />} />
        <Route path="patients" element={<PatientDirectory mode="dentist" />} /><Route path="patients/:patientId" element={<Patient360 />} />
        <Route path="reviews" element={<DentistReviews />} /><Route path="queue" element={<QueuePage role="dentist" />} /><Route path="profile" element={<DentistProfilePage />} />
        <Route path="settings" element={<SharedSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
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
      </Route>
    </Route>
    <Route element={<RequireRole roles={['patient', 'dentist']} />}>
      <Route path="/consultation/:id/lobby" element={<ConsultationLobby />} /><Route path="/consultation/:id" element={<ConsultationCall />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense>
}