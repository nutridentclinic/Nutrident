import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui.jsx'
import PortalLayout, { getActiveNavItem, navigation } from '../layouts/PortalLayout.jsx'
import { ROLE_CONFIG, getRoleFriendlyName, getRolePortalName } from '../utils/roleConfig.js'
import { getTodayFormatted } from '../utils/formatDate.js'
import { PatientDashboard } from './PatientPages.jsx'
import { DentistDashboard } from './TeamPages.jsx'
import { ReceptionDashboard } from './ReceptionPages.jsx'
import { AdminDashboard } from './AdminPages.jsx'
import { useAuthStore } from '../store/auth.js'
import App from '../App.jsx'
import { api } from '../api/domains.js'

vi.mock('../hooks/usePrimaryDentist.js', () => ({
  usePrimaryDentist: vi.fn(() => ({
    isLoading: false,
    dentist: {
      _id: 'dentist-123',
      isActive: true,
      consultationFee: 600,
      user: { name: 'Dr. Patil' },
      specialization: 'Cosmetic Dentistry',
      isVerified: true,
      weeklyAvailability: [{ day: 1, slots: [{ startTime: '09:00', endTime: '13:00' }] }],
      slotDurationMinutes: 30,
    },
    dentistId: 'dentist-123',
  })),
}))

vi.mock('../api/capabilities.js', () => ({
  getCapabilities: vi.fn(() => ({ hasServerLogout: true, hasPrimaryDentist: true })),
  detectLogoutCapability: vi.fn(async () => true),
  fetchPrimaryDentistWithFallback: vi.fn(async () => ({
    _id: 'dentist-123',
    isActive: true,
    consultationFee: 600,
    user: { name: 'Dr. Patil' },
  })),
  fetchPrimarySlotsWithFallback: vi.fn(async () => [{ startTime: '09:00', endTime: '09:30' }]),
  fetchWeeklyAppointmentsWithFallback: vi.fn(async () => []),
  fetchAvailabilityRangeWithFallback: vi.fn(async () => []),
}))

function renderWithProviders(ui, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Role Portal Header & Sections (Workstream 3)', () => {
  afterEach(() => {
    cleanup()
  })

  describe('1. Central Role Configuration Map', () => {
    it('provides consistent friendly display names and portal titles for all roles', () => {
      expect(ROLE_CONFIG.patient).toEqual({ name: 'Patient', portal: 'Patient Portal' })
      expect(ROLE_CONFIG.dentist).toEqual({ name: 'Doctor', portal: 'Doctor Portal' })
      expect(ROLE_CONFIG.receptionist).toEqual({ name: 'Receptionist', portal: 'Receptionist Portal' })
      expect(ROLE_CONFIG.admin).toEqual({ name: 'Admin', portal: 'Admin Portal' })

      expect(getRoleFriendlyName('dentist')).toBe('Doctor')
      expect(getRoleFriendlyName('receptionist')).toBe('Receptionist')
      expect(getRoleFriendlyName('admin')).toBe('Admin')
      expect(getRoleFriendlyName('patient')).toBe('Patient')

      expect(getRolePortalName('dentist')).toBe('Doctor Portal')
      expect(getRolePortalName('receptionist')).toBe('Receptionist Portal')
      expect(getRolePortalName('admin')).toBe('Admin Portal')
      expect(getRolePortalName('patient')).toBe('Patient Portal')
    })
  })

  describe('2. Navigation Sections Defined per Role', () => {
    it('Patient navigation matches required sections', () => {
      const labels = navigation.patient.map((item) => item.label)
      expect(labels).toEqual([
        'Overview',
        'My appointments',
        'Book appointment',
        'Records',
        'Care & treatment plans',
        'Invoices/billing',
        'Family',
        'Profile',
        'Notifications',
        'Settings',
      ])
    })

    it('Doctor navigation matches required sections', () => {
      const labels = navigation.dentist.map((item) => item.label)
      expect(labels).toEqual([
        'Overview',
        'Schedule',
        'Live queue',
        'Patients',
        'Availability',
        'My profile',
        'Notifications',
        'Settings',
      ])
    })

    it('Receptionist navigation matches required sections', () => {
      const labels = navigation.receptionist.map((item) => item.label)
      expect(labels).toEqual([
        'Overview',
        'Appointments',
        'Patients',
        'Live queue',
        'Invoices',
        'Notifications',
        'Settings',
      ])
    })

    it('Admin navigation matches required sections', () => {
      const labels = navigation.admin.map((item) => item.label)
      expect(labels).toEqual([
        'Overview',
        'Appointments',
        'Doctor profile',
        'Staff',
        'Patients',
        'Treatment catalog',
        'Coupons',
        'Payments & refunds',
        'Reviews',
        'Clinic locations',
        'Clinic settings',
        'Notifications',
      ])
    })
  })

  describe('3. Portal Layout: Breadcrumbs, Friendly Roles, and Nested Route Highlighting', () => {
    it('renders Doctor Portal breadcrumb and friendly role chip for dentist', () => {
      useAuthStore.setState({
        status: 'authed',
        user: { _id: 'd-1', name: 'Dr. Siddhesh', role: 'dentist' },
      })

      renderWithProviders(<PortalLayout />, { route: '/dentist/appointments' })

      const breadcrumb = screen.getByLabelText(/Portal section navigation/i)
      expect(breadcrumb.textContent).toContain('Doctor Portal')
      expect(breadcrumb.textContent).toContain('Schedule')

      // Topbar profile chip shows friendly name "Doctor" instead of raw "dentist"
      const profile = screen.getByText('Doctor')
      expect(profile).toBeTruthy()
      expect(screen.queryByText('dentist')).toBeNull()
    })

    it('renders Receptionist Portal breadcrumb and highlights Patients on nested route /reception/patients/:id', () => {
      useAuthStore.setState({
        status: 'authed',
        user: { _id: 'r-1', name: 'Front Desk User', role: 'receptionist' },
      })

      renderWithProviders(<PortalLayout />, { route: '/reception/patients/patient-999' })

      const breadcrumb = screen.getByLabelText(/Portal section navigation/i)
      expect(breadcrumb.textContent).toContain('Receptionist Portal')
      expect(breadcrumb.textContent).toContain('Patients')

      // Check active item resolution helper directly
      const active = getActiveNavItem(navigation.receptionist, '/reception/patients/patient-999')
      expect(active?.label).toBe('Patients')
      expect(active?.to).toBe('/reception/patients')

      // Profile chip shows friendly name "Receptionist"
      expect(screen.getByText('Receptionist')).toBeTruthy()
    })

    it('renders Patient Portal breadcrumb and highlights My appointments on nested route /app/appointments/:id', () => {
      useAuthStore.setState({
        status: 'authed',
        user: { _id: 'p-1', name: 'Jayesh Landage', role: 'patient' },
      })

      renderWithProviders(<PortalLayout />, { route: '/app/appointments/appt-888' })

      const breadcrumb = screen.getByLabelText(/Portal section navigation/i)
      expect(breadcrumb.textContent).toContain('Patient Portal')
      expect(breadcrumb.textContent).toContain('My appointments')

      const active = getActiveNavItem(navigation.patient, '/app/appointments/appt-888')
      expect(active?.label).toBe('My appointments')
      expect(active?.to).toBe('/app/appointments')

      // Profile chip shows friendly name "Patient"
      expect(screen.getByText('Patient')).toBeTruthy()
    })

    it('renders Admin Portal breadcrumb on /admin/settings', () => {
      useAuthStore.setState({
        status: 'authed',
        user: { _id: 'a-1', name: 'Admin Manager', role: 'admin' },
      })

      renderWithProviders(<PortalLayout />, { route: '/admin/settings' })

      const breadcrumb = screen.getByLabelText(/Portal section navigation/i)
      expect(breadcrumb.textContent).toContain('Admin Portal')
      expect(breadcrumb.textContent).toContain('Clinic settings')

      // Profile chip shows friendly name "Admin"
      expect(screen.getByText('Admin')).toBeTruthy()
    })

    it('renders visible elements on mobile viewport (375 px simulation)', () => {
      useAuthStore.setState({
        status: 'authed',
        user: { _id: 'd-1', name: 'Dr. Siddhesh', role: 'dentist' },
      })

      window.innerWidth = 375
      renderWithProviders(<PortalLayout />, { route: '/dentist/queue' })

      const breadcrumb = screen.getByLabelText(/Portal section navigation/i)
      expect(breadcrumb).toBeTruthy()
      expect(breadcrumb.textContent).toContain('Doctor Portal')
      expect(breadcrumb.textContent).toContain('Live queue')

      const roleChip = screen.getByText('Doctor')
      expect(roleChip).toBeTruthy()
    })
  })

  describe('4. Overview Page Headers (H1) with Role Title, Subtitle, and Today Date', () => {
    it('PatientDashboard renders "Patient Portal Overview" with today date', () => {
      useAuthStore.setState({
        status: 'authed',
        user: { _id: 'p-1', name: 'Jayesh Landage', role: 'patient' },
      })

      vi.spyOn(api.appointments, 'mine').mockResolvedValue({ data: [] })
      vi.spyOn(api.patients, 'mine').mockResolvedValue({ data: {} })

      renderWithProviders(<PatientDashboard />)

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading.textContent).toBe('Patient Portal Overview')
      expect(screen.getByText(new RegExp(getTodayFormatted(), 'i'))).toBeTruthy()
    })

    it('DentistDashboard renders "Doctor Portal Overview" with today date', () => {
      useAuthStore.setState({
        status: 'authed',
        user: { _id: 'd-1', name: 'Dr. Patil', role: 'dentist' },
      })

      vi.spyOn(api.dashboard, 'dentist').mockResolvedValue({ data: {} })
      vi.spyOn(api.appointments, 'dentistMine').mockResolvedValue({ data: [] })

      renderWithProviders(<DentistDashboard />)

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading.textContent).toBe('Doctor Portal Overview')
      expect(screen.getByText(new RegExp(getTodayFormatted(), 'i'))).toBeTruthy()
    })

    it('ReceptionDashboard renders "Receptionist Portal Overview" with today date', () => {
      useAuthStore.setState({
        status: 'authed',
        user: { _id: 'r-1', name: 'Receptionist User', role: 'receptionist' },
      })

      vi.spyOn(api.dashboard, 'receptionist').mockResolvedValue({ data: {} })

      renderWithProviders(<ReceptionDashboard />)

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading.textContent).toBe('Receptionist Portal Overview')
      expect(screen.getByText(new RegExp(getTodayFormatted(), 'i'))).toBeTruthy()
    })

    it('AdminDashboard renders "Admin Portal Overview" with today date', () => {
      useAuthStore.setState({
        status: 'authed',
        user: { _id: 'a-1', name: 'Admin User', role: 'admin' },
      })

      vi.spyOn(api.dashboard, 'admin').mockResolvedValue({ data: {} })
      vi.spyOn(api.dashboard, 'revenue').mockResolvedValue({ data: [] })
      vi.spyOn(api.dashboard, 'specialties').mockResolvedValue({ data: [] })

      renderWithProviders(<AdminDashboard />)

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading.textContent).toBe('Admin Portal Overview')
      expect(screen.getByText(new RegExp(getTodayFormatted(), 'i'))).toBeTruthy()
    })
  })

  describe('5. Frontend RequireRole Route Guards', () => {
    it('blocks patient from accessing admin routes and redirects to /app', () => {
      useAuthStore.setState({
        status: 'authed',
        accessToken: 'token-mock',
        user: { _id: 'p-1', name: 'Patient User', role: 'patient', isEmailVerified: true },
      })

      vi.spyOn(api.auth, 'me').mockResolvedValue({
        data: { user: { _id: 'p-1', role: 'patient', isEmailVerified: true } },
      })

      renderWithProviders(<App />, { route: '/admin/staff' })

      // Patient must be redirected away from admin to patient portal home (/app)
      expect(screen.getByText('Patient Portal Overview')).toBeTruthy()
      expect(screen.queryByText('Admin Portal Overview')).toBeNull()
    })

    it('blocks receptionist from accessing dentist routes and redirects to /reception', () => {
      useAuthStore.setState({
        status: 'authed',
        accessToken: 'token-mock',
        user: { _id: 'r-1', name: 'Receptionist User', role: 'receptionist', isEmailVerified: true },
      })

      vi.spyOn(api.auth, 'me').mockResolvedValue({
        data: { user: { _id: 'r-1', role: 'receptionist', isEmailVerified: true } },
      })
      vi.spyOn(api.dashboard, 'receptionist').mockResolvedValue({ data: {} })

      renderWithProviders(<App />, { route: '/dentist/appointments' })

      // Receptionist must be redirected to receptionist portal home (/reception)
      expect(screen.getByText('Receptionist Portal Overview')).toBeTruthy()
      expect(screen.queryByText('Doctor Portal Overview')).toBeNull()
    })
  })
})
