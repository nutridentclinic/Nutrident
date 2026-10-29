import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui.jsx'
import { AppointmentLookup, InvoiceCreator, NotificationsPage } from './ReceptionPages.jsx'
import { QueuePage } from './TeamPages.jsx'
import SharedSettingsPage from './SharedSettingsPage.jsx'
import { PortalNotFound } from '../App.jsx'
import { api } from '../api/domains.js'
import { useAuthStore } from '../store/auth.js'

vi.mock('../hooks/usePrimaryDentist.js', () => ({
  usePrimaryDentist: vi.fn(() => ({
    isLoading: false,
    dentist: {
      _id: 'dentist-123',
      isActive: true,
      consultationFee: 600,
      user: { name: 'Dr. Patil' },
      specialization: 'Cosmetic Dentistry',
    },
    dentistId: 'dentist-123',
  })),
}))

vi.mock('../api/capabilities.js', () => ({
  getCapabilities: vi.fn(() => ({ hasServerLogout: true, hasPrimaryDentist: true, hasStaffBooking: true })),
  detectLogoutCapability: vi.fn(async () => true),
  detectStaffBookingCapability: vi.fn(async () => true),
  fetchPrimaryDentistWithFallback: vi.fn(async () => ({
    _id: 'dentist-123',
    isActive: true,
    consultationFee: 600,
    user: { name: 'Dr. Patil' },
  })),
  fetchPrimarySlotsWithFallback: vi.fn(async () => [{ startTime: '09:00', endTime: '09:30' }]),
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

describe('Reception Portal Comprehensive Fixes (Areas 1–6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: {
        _id: 'rec-1',
        name: 'Desk Officer',
        email: 'reception@drnutrident.test',
        phone: '9876543211',
        role: 'receptionist',
      },
      token: 'jwt-token-123',
      refreshToken: 'jwt-refresh-123',
    })
  })

  afterEach(() => {
    cleanup()
  })

  // Area 1 & 2: Appointment Lookup & Cancellation Dialog
  describe('Area 1 & 2: AppointmentLookup & Cancellation Confirmation', () => {
    it('defaults to showing all appointments without a date filter and renders search and chips', async () => {
      vi.spyOn(api.appointments, 'all').mockResolvedValue({
        data: [
          {
            _id: 'appt-1',
            date: '2026-10-29T00:00:00.000Z',
            startTime: '09:00',
            endTime: '09:30',
            status: 'confirmed',
            paymentStatus: 'paid',
            mode: 'in-clinic',
            patient: { name: 'Anita Rao', phone: '9876500001' },
            dentist: { user: { name: 'Dr. Patil' } },
            fees: { totalAmount: 600 },
          },
          {
            _id: 'appt-2',
            date: '2026-11-05T00:00:00.000Z',
            startTime: '11:00',
            endTime: '11:30',
            status: 'pending',
            paymentStatus: 'unpaid',
            mode: 'video',
            patient: { name: 'Vikram Seth', phone: '9876500002' },
            dentist: { user: { name: 'Dr. Patil' } },
            fees: { totalAmount: 600 },
          },
        ],
        meta: { total: 2, page: 1, limit: 20 },
      })

      vi.spyOn(api.settings, 'get').mockResolvedValue({
        data: { cancellationFullRefundHours: 24 },
      })

      renderWithProviders(<AppointmentLookup />)

      // Verify default query has no fixed date constraint
      await waitFor(() => {
        expect(api.appointments.all).toHaveBeenCalled()
      })
      const initialCallParams = api.appointments.all.mock.calls[0][0]
      expect(initialCallParams.date).toBeUndefined()

      // Shows both appointments across different dates
      await waitFor(() => {
        expect(screen.getByText('Anita Rao')).toBeTruthy()
        expect(screen.getByText('Vikram Seth')).toBeTruthy()
      })

      // Quick chips are present
      expect(screen.getByRole('button', { name: /^all/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /^today/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /^tomorrow/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /^this week/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /^past/i })).toBeTruthy()
    })

    it('cancel button requires confirmation modal before invoking cancel API', async () => {
      const cancelSpy = vi.spyOn(api.appointments, 'cancel').mockResolvedValue({
        message: 'Appointment cancelled.',
      })

      const testAppt = {
        _id: 'appt-cancel-1',
        date: '2026-10-30T00:00:00.000Z',
        startTime: '10:00',
        endTime: '10:30',
        status: 'confirmed',
        paymentStatus: 'paid',
        mode: 'in-clinic',
        patient: { name: 'Rahul Roy', phone: '9876500003' },
        dentist: { user: { name: 'Dr. Patil' } },
        fees: { totalAmount: 600 },
      }

      vi.spyOn(api.appointments, 'all').mockResolvedValue({
        data: [testAppt],
        meta: { total: 1, page: 1, limit: 20 },
      })

      vi.spyOn(api.appointments, 'detail').mockResolvedValue({
        data: testAppt,
      })

      vi.spyOn(api.settings, 'get').mockResolvedValue({
        data: { cancellationFullRefundHours: 24 },
      })

      renderWithProviders(<AppointmentLookup />)

      await waitFor(() => {
        expect(screen.getByText('Rahul Roy')).toBeTruthy()
      })

      // Click row to open detail modal
      fireEvent.click(screen.getByText('Rahul Roy'))

      // Detail drawer should display Cancel button
      const cancelBtn = await screen.findByRole('button', { name: /cancel appointment/i })
      fireEvent.click(cancelBtn)

      // Confirmation dialog should be presented
      await waitFor(() => {
        expect(screen.getAllByText('Cancel this appointment?').length).toBeGreaterThan(0)
        expect(screen.getAllByText(/Keep appointment/i).length).toBeGreaterThan(0)
        expect(screen.getAllByText(/Yes, cancel appointment/i).length).toBeGreaterThan(0)
      })

      // Cancel API must NOT have been called yet
      expect(cancelSpy).not.toHaveBeenCalled()

      // Clicking "Keep appointment" dismisses dialog without cancelling
      const keepBtns = screen.getAllByRole('button', { name: /keep appointment/i })
      fireEvent.click(keepBtns[0])
      expect(cancelSpy).not.toHaveBeenCalled()

      // Click Cancel again, and this time confirm
      fireEvent.click(await screen.findByRole('button', { name: /cancel appointment/i }))
      const confirmCancelBtns = await screen.findAllByRole('button', { name: /Yes, cancel appointment/i })
      fireEvent.click(confirmCancelBtns[0])

      await waitFor(() => {
        expect(cancelSpy).toHaveBeenCalledWith('appt-cancel-1', expect.anything())
      })
    })
  })

  // Area 3: Live Queue Desk
  describe('Area 3: Live Queue Desk', () => {
    it('renders queue status, tabs, and action buttons', async () => {
      vi.spyOn(api.queue, 'get').mockResolvedValue({
        data: [
          {
            _id: 'q-entry-1',
            tokenNumber: 1,
            status: 'waiting',
            patient: { name: 'Pooja Hegde', phone: '9876511111' },
            estimatedWaitMinutes: 15,
            date: '2026-10-29T00:00:00.000Z',
          },
        ],
      })
      vi.spyOn(api.appointments, 'all').mockResolvedValue({
        data: [],
        meta: { total: 0 },
      })

      renderWithProviders(<QueuePage role="receptionist" />)

      await waitFor(() => {
        expect(screen.getByText('Live queue')).toBeTruthy()
        expect(screen.getByText('Pooja Hegde')).toBeTruthy()
      })

      // Action buttons
      expect(screen.getByRole('button', { name: /call next/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /complete/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /skip/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /remove/i })).toBeTruthy()
    })
  })

  // Area 4: Invoices & Explanatory Empty State
  describe('Area 4: InvoiceCreator Desk', () => {
    it('defaults to All filter and shows explanatory empty state when no invoices exist', async () => {
      vi.spyOn(api.invoices, 'all').mockResolvedValue({
        data: [],
        meta: { total: 0 },
      })
      vi.spyOn(api.appointments, 'all').mockResolvedValue({
        data: [],
        meta: { total: 0 },
      })
      vi.spyOn(api.treatments, 'list').mockResolvedValue({
        data: [],
      })

      renderWithProviders(<InvoiceCreator />)

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 3, name: /no invoices yet/i })).toBeTruthy()
      })

      expect(
        screen.getByText(/An invoice is created when a visit is completed\. You can also create one now\./i)
      ).toBeTruthy()
      expect(screen.getAllByRole('button', { name: /create invoice for a visit/i }).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('button', { name: /create manual invoice/i }).length).toBeGreaterThan(0)
    })

    it('renders invoice totals and supports counter payment collection', async () => {
      vi.spyOn(api.invoices, 'all').mockResolvedValue({
        data: [
          {
            _id: 'inv-100',
            invoiceNumber: 'INV-2026-000100',
            createdAt: '2026-10-29T10:00:00.000Z',
            status: 'unpaid',
            totalAmount: 1500,
            paidAmount: 500,
            items: [{ description: 'Scaling & Polishing', quantity: 1, unitPrice: 1500, amount: 1500 }],
            patient: { name: 'Kunal Kapoor', phone: '9876522222' },
          },
        ],
        meta: { total: 1 },
      })
      vi.spyOn(api.appointments, 'all').mockResolvedValue({ data: [] })
      vi.spyOn(api.treatments, 'list').mockResolvedValue({ data: [] })

      renderWithProviders(<InvoiceCreator />)

      await waitFor(() => {
        expect(screen.getByText(/INV-2026-000100/i)).toBeTruthy()
        expect(screen.getByText(/Kunal Kapoor/i)).toBeTruthy()
      })

      // Click "Record payment"
      const recordPayBtn = screen.getByRole('button', { name: /record payment/i })
      fireEvent.click(recordPayBtn)

      // Modal opens
      await waitFor(() => {
        expect(screen.getByText(/Record Payment · INV-2026-000100/i)).toBeTruthy()
      })
    })
  })

  // Area 5: Shared Settings Page for Receptionist
  describe('Area 5: SharedSettingsPage Receptionist Profile & Preferences', () => {
    it('renders receptionist profile card and allows updating name and phone', async () => {
      const updateMeSpy = vi.spyOn(api.auth, 'updateMe').mockResolvedValue({
        data: {
          user: {
            _id: 'rec-1',
            name: 'Senior Front Desk',
            phone: '9876543299',
            email: 'reception@drnutrident.test',
            role: 'receptionist',
          },
        },
        message: 'Profile updated successfully.',
      })

      renderWithProviders(<SharedSettingsPage />)

      await waitFor(() => {
        expect(screen.getByDisplayValue('Desk Officer')).toBeTruthy()
        expect(screen.getByDisplayValue('9876543211')).toBeTruthy()
      })

      // Edit name & phone
      fireEvent.change(screen.getByDisplayValue('Desk Officer'), {
        target: { value: 'Senior Front Desk' },
      })
      fireEvent.change(screen.getByDisplayValue('9876543211'), {
        target: { value: '9876543299' },
      })

      const saveBtn = screen.getByRole('button', { name: /save profile details/i })
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(updateMeSpy).toHaveBeenCalledWith({
          name: 'Senior Front Desk',
          phone: '9876543299',
        })
      })
    })

    it('persists notification preferences for receptionist via notifications API', async () => {
      const updatePrefSpy = vi.spyOn(api.notifications, 'updatePreferences').mockResolvedValue({
        data: { email: false, push: true },
        message: 'Preferences saved.',
      })

      renderWithProviders(<SharedSettingsPage />)

      await waitFor(() => {
        expect(screen.getByText(/Notification preferences/i)).toBeTruthy()
      })

      const emailCheckbox = screen.getByLabelText(/Email notifications/i)
      fireEvent.click(emailCheckbox)

      await waitFor(() => {
        expect(updatePrefSpy).toHaveBeenCalled()
      })
    })
  })

  // Area 6: Notifications & Deep Linking
  describe('Area 6: NotificationsPage & Deep Linking', () => {
    it('renders notifications list, handles clicks, and marks read', async () => {
      const markReadSpy = vi.spyOn(api.notifications, 'read').mockResolvedValue({
        message: 'Marked as read',
      })

      vi.spyOn(api.notifications, 'mine').mockResolvedValue({
        data: [
          {
            _id: 'notif-1',
            title: 'New appointment booked',
            message: 'Aarav Patel booked for 10:00 AM',
            isRead: false,
            link: '/reception/appointments?open=appt-100',
            createdAt: '2026-10-29T08:00:00.000Z',
          },
        ],
        meta: { total: 1, unreadCount: 1 },
      })

      renderWithProviders(<NotificationsPage />)

      await waitFor(() => {
        expect(screen.getByText('New appointment booked')).toBeTruthy()
        expect(screen.getByText('Aarav Patel booked for 10:00 AM')).toBeTruthy()
      })

      // Click notification item to navigate and mark as read
      const notifItem = screen.getByText('New appointment booked')
      fireEvent.click(notifItem)

      await waitFor(() => {
        expect(markReadSpy).toHaveBeenCalledWith('notif-1')
      })
    })

    it('PortalNotFound renders custom 404 message and return to reception link', () => {
      renderWithProviders(<PortalNotFound />)
      expect(screen.getByText('Page not found')).toBeTruthy()
      expect(
        screen.getByText((content) =>
          content.includes('The reception view or tool you are looking for')
        )
      ).toBeTruthy()
      expect(screen.getByRole('link', { name: /return to reception overview/i })).toBeTruthy()
    })
  })
})
