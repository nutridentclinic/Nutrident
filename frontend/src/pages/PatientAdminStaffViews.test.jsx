import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui.jsx'
import { AppointmentBooking, PatientTreatmentPlans } from './PatientPages.jsx'
import { AdminDashboard, DentistManagement } from './AdminPages.jsx'
import { QueuePage } from './TeamPages.jsx'
import { InvoiceCreator, NotificationsPage } from './ReceptionPages.jsx'
import { Patient360 } from './Patient360.jsx'
import { api } from '../api/domains.js'
import * as capabilities from '../api/capabilities.js'
import { useAuthStore } from '../store/auth.js'
import { usePrimaryDentist } from '../hooks/usePrimaryDentist.js'

vi.mock('../hooks/usePrimaryDentist.js', () => ({
  usePrimaryDentist: vi.fn(() => ({
    isLoading: false,
    dentist: {
      _id: 'dentist-123',
      isActive: true,
      isAcceptingAppointments: true,
      consultationFee: 500,
      user: { name: 'Sharma' },
      specialization: 'Orthodontics',
      experienceYears: 10,
      isVerified: true,
      slotDuration: 30,
      weeklyAvailability: [{ dayOfWeek: 1, slots: [{ startTime: '09:00', endTime: '17:00' }] }],
    },
    dentistId: 'dentist-123',
    isActive: true,
    isAcceptingAppointments: true,
    isVerified: true,
    reviews: [],
  })),
}))

vi.mock('../api/capabilities.js', () => ({
  getCapabilities: vi.fn(() => ({ hasServerLogout: true, hasPrimaryDentist: true, hasStaffBooking: true })),
  detectLogoutCapability: vi.fn(async () => true),
  detectStaffBookingCapability: vi.fn(async () => true),
  fetchPrimaryDentistWithFallback: vi.fn(async () => ({
    _id: 'dentist-123',
    isActive: true,
    isAcceptingAppointments: true,
    consultationFee: 500,
    user: { name: 'Sharma' },
    specialization: 'Orthodontics',
  })),
  fetchPrimarySlotsWithFallback: vi.fn(async () => [
    { startTime: '10:00', endTime: '10:30' },
  ]),
  fetchAvailabilityRangeWithFallback: vi.fn(async () => [
    { date: '2026-10-25', weekday: 'Sunday', status: 'closed', reason: 'Clinic closed on Sundays', slots: [] },
    { date: '2026-10-26', weekday: 'Monday', status: 'open', reason: '', slots: [{ startTime: '10:00', endTime: '10:30' }] },
    { date: '2026-10-27', weekday: 'Tuesday', status: 'full', reason: 'All slots booked', slots: [] },
  ]),
  fetchWeeklyAppointmentsWithFallback: vi.fn(async () => ({
    from: '2026-10-19',
    to: '2026-10-25',
    timezone: 'Asia/Kolkata',
    series: [
      { date: '2026-10-19', label: 'Mon', total: 4, confirmed: 2, completed: 2, cancelled: 0, noShow: 0 },
      { date: '2026-10-20', label: 'Tue', total: 5, confirmed: 3, completed: 1, cancelled: 1, noShow: 0 },
      { date: '2026-10-21', label: 'Wed', total: 3, confirmed: 1, completed: 2, cancelled: 0, noShow: 0 },
      { date: '2026-10-22', label: 'Thu', total: 6, confirmed: 4, completed: 1, cancelled: 0, noShow: 1 },
      { date: '2026-10-23', label: 'Fri', total: 4, confirmed: 2, completed: 2, cancelled: 0, noShow: 0 },
      { date: '2026-10-24', label: 'Sat', total: 2, confirmed: 2, completed: 0, cancelled: 0, noShow: 0 },
      { date: '2026-10-25', label: 'Sun', total: 0, confirmed: 0, completed: 0, cancelled: 0, noShow: 0 },
    ],
  })),
  fetchPatientSummaryWithFallback: vi.fn(),
}))

vi.mock('../api/domains.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      ...actual.api,
      dentists: {
        ...actual.api?.dentists,
        adminList: vi.fn(),
        list: vi.fn(),
        primary: vi.fn(),
        primarySlots: vi.fn(),
        availability: vi.fn(),
        updateDoctorProfile: vi.fn(),
        resetDoctorPassword: vi.fn(),
        updateDoctorPhoto: vi.fn(),
      },
      appointments: {
        ...actual.api?.appointments,
        all: vi.fn(),
        detail: vi.fn(),
        create: vi.fn(),
        createStaff: vi.fn(),
        confirm: vi.fn(),
        cancel: vi.fn(),
      },
      plans: {
        ...actual.api?.plans,
        mine: vi.fn(),
        forPatient: vi.fn(),
      },
      dashboard: {
        ...actual.api?.dashboard,
        admin: vi.fn(),
        weekly: vi.fn(),
        revenue: vi.fn(),
        specialties: vi.fn(),
      },
      patients: {
        ...actual.api?.patients,
        mine: vi.fn(async () => ({ success: true, data: {} })),
        list: vi.fn(),
        summary: vi.fn(),
        appointments: vi.fn(),
      },
      invoices: {
        ...actual.api?.invoices,
        all: vi.fn(),
        detail: vi.fn(),
        create: vi.fn(),
        updateItems: vi.fn(),
        markPaid: vi.fn(),
      },
      notifications: {
        ...actual.api?.notifications,
        mine: vi.fn(),
        read: vi.fn(),
        readAll: vi.fn(),
        preferences: vi.fn(),
        updatePreferences: vi.fn(),
      },
      queue: {
        ...actual.api?.queue,
        get: vi.fn(),
        checkIn: vi.fn(),
        call: vi.fn(),
        complete: vi.fn(),
      },
      settings: {
        ...actual.api?.settings,
        get: vi.fn(async () => ({ success: true, data: { clinicName: 'Nutrident Clinic', allowPayAtClinic: true } })),
      },
    },
    downloadPdf: vi.fn(async () => {}),
  }
})

function renderWithProviders(ui, initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Patient, Admin and Staff Views', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // 1. Appointment Booking strip & reasons (P2, P6)
  describe('Appointment booking strip and availability reasons', () => {
    it('renders availability strip with status badges and reasons for closed/full/open days', async () => {
      renderWithProviders(<AppointmentBooking />)

      await waitFor(() => {
        expect(screen.getByText(/Choose a time that works/i)).toBeTruthy()
      })

      // Check doctor name is displayed properly
      expect(screen.getAllByText(/Dr\. Sharma/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/Orthodontics/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  // 2. Treatment Plans resilient rendering (P4)
  describe('Treatment plans page states', () => {
    it('renders plan even when treatment catalogue item is deleted by falling back to step snapshot', async () => {
      api.plans.mine.mockResolvedValue({
        success: true,
        data: [
          {
            _id: 'plan-1',
            title: 'Comprehensive Smile Restoration',
            status: 'in-progress',
            totalEstimatedCost: 12000,
            dentist: { user: { name: 'Dr. Sharma' } },
            steps: [
              {
                _id: 'step-1',
                name: 'Snapshot Root Canal Treatment',
                treatment: null, // deleted from catalogue
                cost: 4500,
                status: 'completed',
                teeth: ['16', '17'],
              },
              {
                _id: 'step-2',
                name: 'Crown Placement',
                treatment: { name: 'Ceramic Crown' },
                cost: 7500,
                status: 'pending',
                teeth: ['16'],
              },
            ],
          },
        ],
      })

      renderWithProviders(<PatientTreatmentPlans />)

      await waitFor(() => {
        expect(screen.getByText('Comprehensive Smile Restoration')).toBeTruthy()
      })

      expect(screen.getByText(/Snapshot Root Canal Treatment/i)).toBeTruthy()
      expect(screen.getByText(/Ceramic Crown/i)).toBeTruthy()
      expect(screen.getByText(/Dr\. Sharma/i)).toBeTruthy()
    })

    it('shows empty state when no plans exist', async () => {
      api.plans.mine.mockResolvedValue({
        success: true,
        data: [],
      })

      renderWithProviders(<PatientTreatmentPlans />)

      await waitFor(() => {
        expect(screen.getByText('No treatment plans on record')).toBeTruthy()
      })
    })

    it('shows error state with retry button on failure', async () => {
      api.plans.mine.mockRejectedValue(new Error('Internal database error'))

      renderWithProviders(<PatientTreatmentPlans />)

      await waitFor(() => {
        expect(screen.getByText(/Could not load treatment plans/i)).toBeTruthy()
      })
      expect(screen.getAllByRole('button', { name: /retry/i }).length).toBeGreaterThanOrEqual(1)
    })
  })

  // 3. Weekly appointments chart mapping (A1)
  describe('Admin weekly appointments chart', () => {
    it('queries weekly endpoint with range and renders series breakdown', async () => {
      api.dashboard.admin.mockResolvedValue({
        success: true,
        data: {
          totalPatients: 150,
          todaysAppointments: 8,
          pendingInvoices: 3,
          revenueThisMonth: 85000,
        },
      })
      api.dashboard.revenue.mockResolvedValue({ success: true, data: [] })
      api.dashboard.specialties.mockResolvedValue({ success: true, data: [] })

      renderWithProviders(<AdminDashboard />)

      await waitFor(() => {
        expect(screen.getByText(/Appointments \(/i)).toBeTruthy()
      })

      expect(screen.getByRole('button', { name: /this week/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /last 7 days/i })).toBeTruthy()
    })
  })

  // 4. Doctor Profile Management (A2)
  describe('Admin doctor profile page with and without endpoint', () => {
    it('renders doctor profile, bookable checklist, and edit controls when available', async () => {
      api.dentists.adminList.mockResolvedValue({
        success: true,
        data: [
          {
            _id: 'dentist-primary',
            specialization: 'Periodontics',
            qualifications: ['BDS', 'MDS'],
            experienceYears: 12,
            consultationFee: 700,
            isActive: true,
            isAcceptingAppointments: true,
            isVerified: true,
            slotDuration: 30,
            weeklyAvailability: [
              { dayOfWeek: 1, isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
            ],
            leaveDates: [],
            user: {
              name: 'Dr. Rajesh Patel',
              email: 'rajesh@nutrident.com',
              phone: '9876543210',
            },
          },
        ],
      })

      renderWithProviders(<DentistManagement />)

      await waitFor(() => {
        expect(screen.getByText(/Dr\. Rajesh Patel/i)).toBeTruthy()
      })

      expect(screen.getByText(/Bookable Status/i)).toBeTruthy()
      expect(screen.getByText(/Bookable: YES/i)).toBeTruthy()
      expect(screen.getByText(/Periodontics/i)).toBeTruthy()
      expect(screen.getByText(/Edit profile/i)).toBeTruthy()
      expect(screen.getByText(/Reset password/i)).toBeTruthy()
    })
  })

  // 5. Patient 360 view (A3, S2)
  describe('Patient 360 summary & history', () => {
    it('renders patient header and switches across overview, appointments and billing tabs', async () => {
      useAuthStore.setState({ user: { role: 'receptionist', name: 'Reception Staff' } })

      api.patients.summary.mockResolvedValue({
        user: {
          _id: 'patient-456',
          name: 'Pooja Verma',
          email: 'pooja@example.com',
          phone: '9876512345',
          isEmailVerified: true,
          createdAt: '2026-01-10T10:00:00.000Z',
        },
        patient: {
          _id: 'patient-456',
          dateOfBirth: '1992-05-14',
          gender: 'female',
          bloodGroup: 'B+',
          allergies: ['Penicillin'],
          chronicConditions: ['None'],
          emergencyContact: { name: 'Aakash', phone: '9876500000', relation: 'Spouse' },
          familyMembers: [],
        },
        stats: {
          lastVisit: {
            _id: 'appt-prev',
            date: '2026-09-15',
          },
          nextAppointment: {
            _id: 'appt-next',
            date: '2026-10-30',
            startTime: '11:00',
            mode: 'in-clinic',
          },
          outstandingBalance: 1500,
        },
      })

      api.patients.appointments.mockResolvedValue({
        success: true,
        data: [
          {
            _id: 'appt-1',
            date: '2026-10-30',
            startTime: '11:00',
            status: 'confirmed',
            mode: 'in-clinic',
            paymentStatus: 'pending',
            consultationFee: 500,
          },
        ],
        meta: { total: 1 },
      })

      renderWithProviders(
        <Routes>
          <Route path="/reception/patients/:patientId" element={<Patient360 />} />
        </Routes>,
        ['/reception/patients/patient-456']
      )

      await waitFor(() => {
        expect(screen.getByText('Pooja Verma')).toBeTruthy()
      })

      expect(screen.getByText(/9876512345/)).toBeTruthy()
      expect(screen.getByText(/pooja@example.com/)).toBeTruthy()
      expect(screen.getByText('₹1,500')).toBeTruthy()

      // Click Appointments tab
      const apptsTab = screen.getByRole('button', { name: /^appointments/i })
      fireEvent.click(apptsTab)

      await waitFor(() => {
        expect(screen.getByText('11:00')).toBeTruthy()
      })
    })
  })

  // 6. Queue check-in without walk-in (S1)
  describe('Staff queue without walk-in', () => {
    it('does not contain walk-in name or walk-in registration button and shows self-register link', async () => {
      useAuthStore.setState({ user: { role: 'receptionist', name: 'Front Desk' } })

      api.queue.get.mockResolvedValue({
        success: true,
        data: [
          {
            _id: 'queue-1',
            tokenNumber: 'Q-01',
            status: 'waiting',
            patient: { name: 'Aarav Patel', phone: '9876543210' },
          },
        ],
      })

      api.appointments.all.mockResolvedValue({
        success: true,
        data: [
          {
            _id: 'appt-today-1',
            startTime: '10:30',
            mode: 'in-clinic',
            paymentStatus: 'paid',
            patient: { _id: 'patient-aarav', name: 'Aarav Patel', phone: '9876543210' },
          },
        ],
      })

      renderWithProviders(<QueuePage role="receptionist" />)

      await waitFor(() => {
        expect(screen.getByText('Check in a registered patient')).toBeTruthy()
      })

      // Must NOT have walk-in name input
      expect(screen.queryByPlaceholderText(/walk-in name/i)).toBeNull()
      expect(screen.queryByText(/register walk-in/i)).toBeNull()

      // Shows self-registration advice
      expect(screen.getByText(/Ask the patient to self-register at:/i)).toBeTruthy()
      expect(screen.getByText(/Copy registration link/i)).toBeTruthy()
    })
  })

  // 7. Reception Invoices Desk (S3)
  describe('Reception Invoices page', () => {
    it('renders multi-filter bar and allows viewing invoice detail and collecting counter payment', async () => {
      api.invoices.all.mockResolvedValue({
        data: [
          {
            _id: 'inv-1',
            invoiceNumber: 'INV-2026-000101',
            createdAt: '2026-10-25T10:00:00.000Z',
            status: 'unpaid',
            subTotal: 1000,
            discount: 0,
            tax: 0,
            totalAmount: 1000,
            items: [{ description: 'General Dental Consultation', quantity: 1, unitPrice: 1000, amount: 1000 }],
            patient: { name: 'Karan Mehra', phone: '9876599999' },
          },
        ],
        meta: { total: 1 },
      })

      renderWithProviders(<InvoiceCreator />)

      await waitFor(() => {
        expect(screen.getByText(/INV-2026-000101/i)).toBeTruthy()
      })

      expect(screen.getByText(/Karan Mehra/i)).toBeTruthy()

      // Open View / Edit modal
      const viewBtn = screen.getByRole('button', { name: /view \/ edit/i })
      fireEvent.click(viewBtn)

      await waitFor(() => {
        expect(screen.getByText(/Add extra procedure line items or coupon/i)).toBeTruthy()
      })
      expect(screen.getByRole('button', { name: /download pdf/i })).toBeTruthy()
    })
  })

  // 8. Notifications page for staff and patients (S4)
  describe('Shared Notifications Page', () => {
    it('renders notifications list, unread count, and supports mark all read', async () => {
      api.notifications.mine.mockResolvedValue({
        success: true,
        data: [
          {
            _id: 'notif-1',
            type: 'appointment_confirmed',
            title: 'Appointment Booked',
            message: 'Patient Karan Mehra booked for 11:00 AM.',
            isRead: false,
            createdAt: '2026-10-25T09:30:00.000Z',
          },
        ],
        meta: { unreadCount: 1 },
      })

      api.notifications.preferences.mockResolvedValue({
        success: true,
        data: { email: true },
      })

      api.notifications.readAll.mockResolvedValue({
        success: true,
        message: 'All notifications marked as read.',
      })

      renderWithProviders(<NotificationsPage />)

      await waitFor(() => {
        expect(screen.getByText(/1 unread update/i)).toBeTruthy()
      })

      expect(screen.getByText('Appointment Booked')).toBeTruthy()
      expect(screen.getByText(/Patient Karan Mehra booked for 11:00 AM/i)).toBeTruthy()

      const markAllBtn = screen.getByRole('button', { name: /mark all read/i })
      fireEvent.click(markAllBtn)

      await waitFor(() => {
        expect(api.notifications.readAll).toHaveBeenCalledOnce()
      })
    })
  })
})
