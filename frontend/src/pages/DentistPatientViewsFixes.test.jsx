import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui.jsx'
import { NotificationsPage } from './ReceptionPages.jsx'
import { DentistSchedule } from './TeamPages.jsx'
import { PatientTreatmentsPage } from './PatientPages.jsx'
import { api } from '../api/domains.js'
import { useAuthStore } from '../store/auth.js'

vi.mock('../hooks/usePrimaryDentist.js', () => ({
  usePrimaryDentist: vi.fn(() => ({
    isLoading: false,
    dentist: {
      _id: 'dentist-123',
      isActive: true,
      consultationFee: 500,
      user: { name: 'Dr. John Doe' },
      specialization: 'General Dentistry',
    },
    dentistId: 'dentist-123',
    isAcceptingAppointments: true,
  })),
}))

vi.mock('../api/capabilities.js', () => ({
  fetchPrimarySlotsWithFallback: vi.fn(async () => [
    { startTime: '10:00', endTime: '10:30' },
    { startTime: '11:00', endTime: '11:30' },
  ]),
}))

function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Dentist, Patient & Notifications Views', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe('NotificationsPage: Delete Actions & Selection Mode', () => {
    beforeEach(() => {
      vi.spyOn(api.notifications, 'mine').mockResolvedValue({
        success: true,
        message: 'Notifications fetched.',
        data: [
          {
            _id: 'notif-1',
            title: 'Appointment Booked',
            message: 'Alice booked an appointment',
            isRead: false,
            createdAt: '2026-10-25T10:00:00.000Z',
          },
          {
            _id: 'notif-2',
            title: 'Payment Received',
            message: 'Payment received for #INV-101',
            isRead: true,
            createdAt: '2026-10-24T10:00:00.000Z',
          },
        ],
        meta: { unreadCount: 1, total: 2 },
      })
      vi.spyOn(api.notifications, 'remove').mockResolvedValue({ success: true, message: 'Notification deleted.' })
      vi.spyOn(api.notifications, 'removeMany').mockResolvedValue({ success: true, message: 'Notifications deleted.' })
      vi.spyOn(api.notifications, 'clear').mockResolvedValue({ success: true, message: 'Notifications cleared.' })
      vi.spyOn(api.notifications, 'preferences').mockResolvedValue({ data: { email: true, push: true } })
    })

    it('renders delete button per row and calls remove API on click', async () => {
      renderWithProviders(<NotificationsPage />)
      await waitFor(() => expect(screen.getByText('Appointment Booked')).toBeTruthy())

      const deleteButtons = screen.getAllByTitle('Delete notification')
      expect(deleteButtons.length).toBe(2)

      fireEvent.click(deleteButtons[0])
      await waitFor(() => {
        expect(api.notifications.remove).toHaveBeenCalledWith('notif-1')
      })
    })

    it('clears read notifications after confirmation', async () => {
      renderWithProviders(<NotificationsPage />)
      await waitFor(() => expect(screen.getByText('Clear read (1)')).toBeTruthy())

      fireEvent.click(screen.getByText('Clear read (1)'))
      // Confirm modal opens
      await waitFor(() => expect(screen.getByText('Clear all read notifications?')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: 'Clear read' }))
      await waitFor(() => {
        expect(api.notifications.clear).toHaveBeenCalledWith('read')
      })
    })

    it('supports select mode to bulk delete selected notifications', async () => {
      renderWithProviders(<NotificationsPage />)
      await waitFor(() => expect(screen.getByText('Select')).toBeTruthy())

      fireEvent.click(screen.getByText('Select'))
      // Selection checkboxes and action buttons should appear
      await waitFor(() => expect(screen.getByText('Select page')).toBeTruthy())

      fireEvent.click(screen.getByText('Select page'))
      const deleteSelectedBtn = screen.getByText(/Delete selected \(2\)/)
      expect(deleteSelectedBtn).toBeTruthy()

      fireEvent.click(deleteSelectedBtn)
      await waitFor(() => expect(screen.getByText('Delete selected notifications?')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))
      await waitFor(() => {
        expect(api.notifications.removeMany).toHaveBeenCalledWith(['notif-1', 'notif-2'])
      })
    })
  })

  describe('DentistSchedule: Reschedule Dialog & Confirmations', () => {
    beforeEach(() => {
      vi.spyOn(api.appointments, 'dentistMine').mockResolvedValue({
        success: true,
        data: [
          {
            _id: 'appt-1',
            patient: { _id: 'p-1', name: 'Alice Walker', phone: '+919876543210' },
            dentist: 'dentist-123',
            date: '2026-11-05',
            startTime: '09:00',
            endTime: '09:30',
            status: 'confirmed',
            paymentStatus: 'paid',
            mode: 'in-clinic',
          },
        ],
      })
      vi.spyOn(api.appointments, 'reschedule').mockResolvedValue({
        success: true,
        message: 'Appointment rescheduled successfully.',
      })
      vi.spyOn(api.appointments, 'complete').mockResolvedValue({
        success: true,
        message: 'Appointment completed.',
      })
      vi.spyOn(api.appointments, 'noShow').mockResolvedValue({
        success: true,
        message: 'Marked as no-show.',
      })
    })

    it('renders Reschedule button and opens reschedule modal', async () => {
      renderWithProviders(<DentistSchedule />)
      await waitFor(() => expect(screen.getByText('Alice Walker')).toBeTruthy())

      const reschedBtn = screen.getByRole('button', { name: 'Reschedule' })
      expect(reschedBtn).toBeTruthy()

      fireEvent.click(reschedBtn)
      await waitFor(() => expect(screen.getByText('Reschedule Appointment')).toBeTruthy())
      expect(screen.getByText(/Rescheduling/)).toBeTruthy()

      // Select slot
      await waitFor(() => expect(screen.getByText('10:00')).toBeTruthy())
      fireEvent.click(screen.getByText('10:00'))

      // Submit reschedule
      fireEvent.click(screen.getByRole('button', { name: 'Save new time' }))
      await waitFor(() => {
        expect(api.appointments.reschedule).toHaveBeenCalledWith('appt-1', expect.objectContaining({
          startTime: '10:00',
        }))
      })
    })

    it('requires confirmation before marking appointment as complete', async () => {
      renderWithProviders(<DentistSchedule />)
      await waitFor(() => expect(screen.getByText('Alice Walker')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: 'Complete' }))
      await waitFor(() => expect(screen.getByText('Complete this visit?')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: 'Complete visit' }))
      await waitFor(() => {
        expect(api.appointments.complete).toHaveBeenCalledWith('appt-1')
      })
    })
  })

  describe('PatientTreatmentsPage: Catalog & My Plan', () => {
    beforeEach(() => {
      vi.spyOn(api.treatments, 'list').mockResolvedValue({
        success: true,
        data: [
          {
            _id: 't-1',
            name: 'Root Canal Treatment',
            category: 'Endodontics',
            defaultCost: 4500,
            durationMinutes: 60,
            description: 'Painless root canal therapy to save damaged teeth.',
          },
          {
            _id: 't-2',
            name: 'Teeth Whitening',
            category: 'Cosmetic',
            defaultCost: 3000,
            durationMinutes: 45,
            description: 'Professional in-clinic laser whitening session.',
          },
        ],
      })
      vi.spyOn(api.plans, 'mine').mockResolvedValue({
        success: true,
        data: [
          {
            _id: 'plan-1',
            title: 'Smile Makeover',
            status: 'active',
            steps: [
              {
                treatment: 't-1',
                name: 'Root Canal Treatment',
                status: 'in-progress',
              },
            ],
          },
        ],
      })
    })

    it('renders treatment catalog and highlights procedures included in plan', async () => {
      renderWithProviders(<PatientTreatmentsPage />)
      await waitFor(() => expect(screen.getByText('Root Canal Treatment')).toBeTruthy())
      expect(screen.getByText('Teeth Whitening')).toBeTruthy()

      // Should show in-plan badge
      expect(screen.getByText(/In your care plan:/)).toBeTruthy()
      expect(screen.getByText(/Step 1 of 1/)).toBeTruthy()

      // Book button points to /app/book?reason=...
      const bookButtons = screen.getAllByRole('link', { name: /Book this treatment/ })
      expect(bookButtons[0].getAttribute('href')).toContain('reason=Root%20Canal%20Treatment')
    })
  })
})
