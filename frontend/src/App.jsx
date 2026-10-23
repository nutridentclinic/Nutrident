import { lazy, Suspense, useEffect } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { api } from './api/domains.js'
import { useAuthStore } from './store/auth.js'
import PortalLayout from './layouts/PortalLayout.jsx'
import { LoadingState } from './components/ui.jsx'
import { AboutPage, ContactPage, DentistDirectory, DentistProfile, DoctorProfilePage, LegalPage, PricingPage, PublicHome, PublicLayout, ServicesPage, SimplePublicPage } from './pages/PublicPages.jsx'
import { PatientAppointments, AppointmentBooking, AppointmentDetail, PatientBilling, PatientCare, PatientDashboard, PatientFamily, PatientPrescriptions, PatientProfile, PatientProfilePhoto, PatientRecords } from './pages/PatientPages.jsx'
import { ClinicalRecord, DentistAvailability, DentistDashboard, DentistProfilePage, DentistReviews, DentistSchedule, PatientDirectory, QueuePage } from './pages/TeamPages.jsx'
import { AppointmentLookup, InvoiceCreator, NotificationsPage, ReceptionPage } from './pages/ReceptionPages.jsx'
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
const ResetPasswordPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.ResetPasswordPage })))

import { logout } from './auth/session.js'

function GuestOnly({ children }) {
  const { accessToken, user } = useAuthStore()
  if (accessToken && user) {
    return <Navigate to={roleHome[user.role] || '/app'} replace />
  }
  return children
}

function RequireRole({ roles }) {
  const { accessToken, setUserAndProfile } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    if (!accessToken) {
      logout({ reason: 'expired' })
    }
  }, [accessToken])

  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: api.auth.me,
    enabled: !!accessToken,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 0,
  })

  useEffect(() => {
    const handleRevalidate = (event) => {
      if (
        (event.type === 'pageshow' && event.persisted) ||
        event.type === 'popstate' ||
        event.type === 'focus' ||
        (event.type === 'visibilitychange' && document.visibilityState === 'visible')
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
      logout({ reason: 'expired' })
    }
  }, [meQuery.isError])

  if (!accessToken) {
    return <Navigate to="/login?reason=expired" replace state={{ returnTo: location.pathname + location.search }} />
  }

  if (meQuery.isLoading || !meQuery.data?.data?.user) {
    return <LoadingState label="Verifying your secure session…" />
  }

  const currentUser = meQuery.data.data.user
  const currentProfile = meQuery.data.data.profile

  if (!currentUser) {
    return <Navigate to="/login?reason=expired" replace />
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
    <Route path="/reset-password" element={<GuestOnly><ResetPasswordPage /></GuestOnly>} />
    <Route element={<RequireRole roles={['patient']} />}>
      <Route path="/app" element={<PortalLayout />}>
        <Route index element={<PatientDashboard />} /><Route path="appointments" element={<PatientAppointments />} /><Route path="appointments/:id" element={<AppointmentDetail />} />
        <Route path="book" element={<AppointmentBooking />} />
        <Route path="book/:dentistId" element={<Navigate to="/app/book" replace />} />
        <Route path="prescriptions" element={<PatientPrescriptions />} /><Route path="records" element={<PatientRecords />} />
        <Route path="care" element={<PatientCare />} /><Route path="billing" element={<PatientBilling />} /><Route path="family" element={<PatientFamily />} />
        <Route path="profile" element={<PatientProfileWorkspace />} />
        <Route path="settings" element={<SharedSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['dentist']} />}>
      <Route path="/dentist" element={<PortalLayout />}>
        <Route index element={<DentistDashboard />} /><Route path="appointments" element={<DentistSchedule />} /><Route path="availability" element={<DentistAvailability />} />
        <Route path="patients" element={<PatientDirectory mode="dentist" />} /><Route path="patients/:patientId" element={<ClinicalRecord />} />
        <Route path="reviews" element={<DentistReviews />} /><Route path="queue" element={<QueuePage role="dentist" />} /><Route path="profile" element={<DentistProfilePage />} />
        <Route path="settings" element={<SharedSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['receptionist']} />}>
      <Route path="/reception" element={<PortalLayout />}>
        <Route index element={<ReceptionPage page="dashboard" />} /><Route path="appointments" element={<AppointmentLookup />} /><Route path="patients" element={<PatientDirectory />} />
        <Route path="patients/:patientId" element={<ClinicalRecord readOnly />} /><Route path="queue" element={<QueuePage role="receptionist" />} /><Route path="invoices" element={<InvoiceCreator />} />
        <Route path="settings" element={<SharedSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['admin']} />}>
      <Route path="/admin" element={<PortalLayout />}>
        <Route index element={<AdminPage page="dashboard" />} /><Route path="dentists" element={<AdminPage page="dentists" />} /><Route path="staff" element={<AdminPage page="staff" />} />
        <Route path="patients" element={<AdminPage page="patients" />} /><Route path="patients/:patientId" element={<ClinicalRecord readOnly />} />
        <Route path="treatments" element={<AdminPage page="treatments" />} /><Route path="coupons" element={<AdminPage page="coupons" />} />
        <Route path="payments" element={<AdminPage page="payments" />} /><Route path="settings" element={<AdminPage page="settings" />} />
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