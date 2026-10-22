import { lazy, Suspense, useEffect } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { api } from './api/domains.js'
import { useAuthStore } from './store/auth.js'
import PortalLayout from './layouts/PortalLayout.jsx'
import { LoadingState } from './components/ui.jsx'
import { DentistDirectory, DentistProfile, PublicHome, PublicLayout, PricingPage, ServicesPage, SimplePublicPage } from './pages/PublicPages.jsx'
import { PatientAppointments, AppointmentBooking, AppointmentDetail, PatientBilling, PatientCare, PatientDashboard, PatientFamily, PatientPrescriptions, PatientProfile, PatientProfilePhoto, PatientRecords } from './pages/PatientPages.jsx'
import { ClinicalRecord, DentistAvailability, DentistDashboard, DentistProfilePage, DentistReviews, DentistSchedule, PatientDirectory, QueuePage } from './pages/TeamPages.jsx'
import { AppointmentLookup, InvoiceCreator, NotificationsPage, ReceptionPage } from './pages/ReceptionPages.jsx'
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

function RequireRole({ roles }) {
  const { user, profile, accessToken, setSession } = useAuthStore()
  const location = useLocation()
  const shouldLoadProfile = !!accessToken && (!user || (user.role === 'dentist' && !profile))
  const bootstrap = useQuery({ queryKey: ['auth-bootstrap'], queryFn: api.auth.me, enabled: shouldLoadProfile, retry: false })

  useEffect(() => {
    if (bootstrap.data?.data) setSession({ ...bootstrap.data.data, accessToken: useAuthStore.getState().accessToken, refreshToken: useAuthStore.getState().refreshToken })
  }, [bootstrap.data, setSession])

  if (!accessToken) return <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />
  if (shouldLoadProfile && bootstrap.isLoading) return <LoadingState label="Restoring your secure session…" />
  const currentUser = user || bootstrap.data?.data?.user
  const currentProfile = profile || bootstrap.data?.data?.profile
  if (!currentUser) return <Navigate to="/login?reason=expired" replace />
  if (!roles.includes(currentUser.role)) return <Navigate to={roleHome[currentUser.role] || '/'} replace />
  if (currentUser.role === 'dentist' && currentProfile && !(currentProfile.weeklyAvailability || []).some((day) => day.slots?.length) && location.pathname !== '/dentist/availability') {
    return <Navigate to="/dentist/availability" replace />
  }
  return <Outlet />
}

function Landing() {
  const { accessToken, user } = useAuthStore()
  if (accessToken && user) return <Navigate to={roleHome[user.role] || '/app'} replace />
  return <PublicHome />
}

function ContactPage() {
  const query = useQuery({ queryKey: ['clinic-settings'], queryFn: api.settings.get })
  const settings = query.data?.data
  return <main className="catalog-page"><div className="eyebrow">Contact</div><h1 className="page-title">Get in touch with your clinic.</h1>{query.isLoading ? <LoadingState /> : query.isError ? <p className="muted-copy">{query.error.message}</p> : settings?.contactPhone || settings?.contactEmail || settings?.address ? <div className="contact-details">{settings.clinicName && <h2>{settings.clinicName}</h2>}{settings.address && <p>{settings.address}</p>}{settings.contactPhone && <a href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a>}{settings.contactEmail && <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>}</div> : <p className="muted-copy">Clinic contact information is not configured.</p>}</main>
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
      <Route path="/about" element={<SimplePublicPage eyebrow="About" title="A more considered dental visit."><p className="muted-copy">Clinic-approved information about the practice can be added here.</p></SimplePublicPage>} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/dentists" element={<DentistDirectory />} />
      <Route path="/dentists/:id" element={<DentistProfile />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/privacy" element={<SimplePublicPage eyebrow="Legal information" title="Privacy notice"><p className="muted-copy">Privacy terms are a client-provided legal document and have not been supplied. This page is a placeholder and is not legal advice.</p></SimplePublicPage>} />
      <Route path="/terms" element={<SimplePublicPage eyebrow="Legal information" title="Terms of service"><p className="muted-copy">Terms are a client-provided legal document and have not been supplied. This page is a placeholder and is not legal advice.</p></SimplePublicPage>} />
    </Route>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/verify-otp" element={<VerifyOtpPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route element={<RequireRole roles={['patient']} />}>
      <Route path="/app" element={<PortalLayout />}>
        <Route index element={<PatientDashboard />} /><Route path="appointments" element={<PatientAppointments />} /><Route path="appointments/:id" element={<AppointmentDetail />} />
        <Route path="book/:dentistId" element={<AppointmentBooking />} /><Route path="prescriptions" element={<PatientPrescriptions />} /><Route path="records" element={<PatientRecords />} />
        <Route path="care" element={<PatientCare />} /><Route path="billing" element={<PatientBilling />} /><Route path="family" element={<PatientFamily />} />
        <Route path="profile" element={<PatientProfileWorkspace />} /><Route path="notifications" element={<NotificationsPage />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['dentist']} />}>
      <Route path="/dentist" element={<PortalLayout />}>
        <Route index element={<DentistDashboard />} /><Route path="appointments" element={<DentistSchedule />} /><Route path="availability" element={<DentistAvailability />} />
        <Route path="patients" element={<PatientDirectory mode="dentist" />} /><Route path="patients/:patientId" element={<ClinicalRecord />} />
        <Route path="reviews" element={<DentistReviews />} /><Route path="queue" element={<QueuePage role="dentist" />} /><Route path="profile" element={<DentistProfilePage />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['receptionist']} />}>
      <Route path="/reception" element={<PortalLayout />}>
        <Route index element={<ReceptionPage page="dashboard" />} /><Route path="appointments" element={<AppointmentLookup />} /><Route path="patients" element={<PatientDirectory />} />
        <Route path="patients/:patientId" element={<ClinicalRecord readOnly />} /><Route path="queue" element={<QueuePage role="receptionist" />} /><Route path="invoices" element={<InvoiceCreator />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['admin']} />}>
      <Route path="/admin" element={<PortalLayout />}>
        <Route index element={<AdminPage page="dashboard" />} /><Route path="dentists" element={<AdminPage page="dentists" />} /><Route path="staff" element={<AdminPage page="staff" />} />
        <Route path="patients" element={<AdminPage page="patients" />} /><Route path="patients/:patientId" element={<ClinicalRecord readOnly />} />
        <Route path="treatments" element={<AdminPage page="treatments" />} /><Route path="coupons" element={<AdminPage page="coupons" />} />
        <Route path="clinics" element={<AdminPage page="clinics" />} /><Route path="payments" element={<AdminPage page="payments" />} /><Route path="settings" element={<AdminPage page="settings" />} />
      </Route>
    </Route>
    <Route element={<RequireRole roles={['patient', 'dentist']} />}>
      <Route path="/consultation/:id/lobby" element={<ConsultationLobby />} /><Route path="/consultation/:id" element={<ConsultationCall />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense>
}