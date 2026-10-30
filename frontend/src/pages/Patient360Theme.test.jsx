import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Patient360 } from './Patient360.jsx'
import { useAuthStore } from '../store/auth.js'
import { api } from '../api/domains.js'
import { ToastProvider } from '../components/ui.jsx'

vi.mock('../api/domains.js', () => ({
  api: {
    patients: {
      summary: vi.fn(),
      detail: vi.fn(),
      appointments: vi.fn(),
      update: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
    },
    records: {
      forPatient: vi.fn(),
    },
    charts: {
      get: vi.fn(),
      updateTooth: vi.fn(),
    },
    plans: {
      forPatient: vi.fn(),
    },
    invoices: {
      all: vi.fn(),
    },
    payments: {
      all: vi.fn(),
    },
  },
  downloadPdf: vi.fn(),
  openRecordFile: vi.fn(),
}))

function renderPatient360(role = 'receptionist', patientId = 'pat-1') {
  useAuthStore.setState({ user: { role, name: 'Staff User' } })
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/${role}/patients/${patientId}`]}>
          <Routes>
            <Route path={`/${role}/patients/:id`} element={<Patient360 />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

describe('Patient360 Light Theme and Functionality', () => {
  const mockPatientData = {
    user: {
      _id: 'usr-1',
      name: 'Rohan Sharma',
      email: 'rohan@example.com',
      phone: '+91 9876543210',
      isEmailVerified: true,
      active: true,
    },
    patient: {
      _id: 'pat-1',
      dateOfBirth: '1990-01-15',
      gender: 'male',
      bloodGroup: 'O+',
      address: '123 MG Road, Pune',
      allergies: ['Dust'],
      chronicConditions: ['None'],
      emergencyContact: {
        name: 'Sunita Sharma',
        phone: '+91 9876543211',
        relation: 'Spouse',
      },
      familyMembers: [],
    },
    stats: {
      lastVisit: { date: '2026-09-10' },
      nextAppointment: { date: '2026-11-05', startTime: '10:00' },
      outstandingBalance: 1200,
    },
  }

  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    api.patients.summary.mockResolvedValue(mockPatientData)
    api.patients.appointments.mockResolvedValue([
      {
        _id: 'appt-1',
        date: '2026-09-10',
        startTime: '10:00',
        mode: 'in-clinic',
        reasonForVisit: 'Routine scaling',
        fees: { totalAmount: 800 },
        status: 'completed',
        paymentStatus: 'paid',
        clinicalNotes: 'Gums healthy, no tartar accumulation.',
      },
    ])
    api.charts.get.mockResolvedValue({
      teeth: [
        { toothNumber: 11, condition: 'caries', notes: 'Mesial decay' },
      ],
    })
    api.records.forPatient.mockResolvedValue([
      {
        _id: 'rec-1',
        title: 'Panoramic OPG',
        type: 'xray',
        createdAt: '2026-09-10',
        file: { url: 'https://example.com/opg.pdf' },
      },
    ])
    api.plans.forPatient.mockResolvedValue([
      {
        _id: 'plan-1',
        title: 'Composite Restoration',
        createdAt: '2026-09-10',
        totalEstimatedCost: 2500,
        steps: [{ name: 'Filling', cost: 2500, status: 'pending' }],
      },
    ])
    api.invoices.all.mockResolvedValue([
      {
        _id: 'inv-1',
        invoiceNumber: 'INV-2026-001',
        totalAmount: 800,
        status: 'paid',
        createdAt: '2026-09-10',
      },
    ])
    api.payments.all.mockResolvedValue([])
  })

  it('renders with zero Tailwind dark classes (bg-slate, border-slate, text-white, etc.)', async () => {
    const { container } = renderPatient360('receptionist', 'pat-1')

    await waitFor(() => {
      expect(screen.getByText('Rohan Sharma')).toBeTruthy()
    })

    const html = container.innerHTML

    expect(html).not.toContain('bg-slate-')
    expect(html).not.toContain('border-slate-')
    expect(html).not.toContain('text-white')
    expect(html).not.toContain('text-slate-')
    expect(html).not.toContain('rounded-xl')
    expect(html).not.toContain('rounded-2xl')

    // Uses design system classes
    expect(html).toContain('patient-summary-hero')
    expect(html).toContain('patient-360-tabs')
    expect(html).toContain('section-panel')
  })

  it('switches between all 7 tabs and renders appropriate section content', async () => {
    renderPatient360('dentist', 'pat-1')

    await waitFor(() => {
      expect(screen.getByText('Rohan Sharma')).toBeTruthy()
    })

    // 1. Overview tab (default)
    expect(screen.getAllByText('Personal Information').length).toBeGreaterThan(0)
    expect(screen.getByText('Medical Conditions & Emergency')).toBeTruthy()

    // 2. Appointments tab
    fireEvent.click(screen.getByRole('button', { name: /^appointments/i }))
    await waitFor(() => {
      expect(screen.getByText('Routine scaling')).toBeTruthy()
    })

    // 3. Treatment Plans tab
    fireEvent.click(screen.getByRole('button', { name: /^treatment plans/i }))
    await waitFor(() => {
      expect(screen.getByText('Composite Restoration')).toBeTruthy()
    })

    // 4. Dental Chart tab
    fireEvent.click(screen.getByRole('button', { name: /^dental chart/i }))
    await waitFor(() => {
      expect(screen.getByTitle(/Tooth 11: caries/i)).toBeTruthy()
    })

    // 5. Medical Records tab
    fireEvent.click(screen.getByRole('button', { name: /^medical records/i }))
    await waitFor(() => {
      expect(screen.getByText('Panoramic OPG')).toBeTruthy()
    })

    // 6. Invoices & Billing tab
    fireEvent.click(screen.getByRole('button', { name: /^invoices & billing/i }))
    await waitFor(() => {
      expect(screen.getByText('INV-2026-001')).toBeTruthy()
    })

    // 7. Notes tab
    fireEvent.click(screen.getByRole('button', { name: /^notes/i }))
    await waitFor(() => {
      expect(screen.getByText(/Gums healthy, no tartar accumulation/i)).toBeTruthy()
    })
  })

  it('opens Edit Info modal and submits updated details', async () => {
    api.patients.update.mockResolvedValue({ success: true, message: 'Patient updated' })

    renderPatient360('receptionist', 'pat-1')

    await waitFor(() => {
      expect(screen.getByText('Rohan Sharma')).toBeTruthy()
    })

    // Click Edit Info button
    fireEvent.click(screen.getByRole('button', { name: /edit info/i }))

    expect(screen.getByText('Edit Patient Demographics')).toBeTruthy()

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(api.patients.update).toHaveBeenCalledWith('pat-1', expect.objectContaining({
        name: 'Rohan Sharma',
        phone: '+91 9876543210',
      }))
    })
  })
})
