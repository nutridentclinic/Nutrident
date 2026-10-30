import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import axios from 'axios'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import client from './client.js'
import { api } from './domains.js'
import { useAuthStore } from '../store/auth.js'

const apiOrigin = (import.meta.env.VITE_API_BASE_URL || 'https://drnutrident-backend-wj1n.onrender.com/api').replace(/\/$/, '')
const server = setupServer()
const originalAxiosAdapter = axios.defaults.adapter
const originalClientAdapter = client.defaults.adapter

beforeAll(() => {
  const fetchAdapter = axios.getAdapter('fetch')
  axios.defaults.adapter = fetchAdapter
  client.defaults.adapter = fetchAdapter
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  server.resetHandlers()
  useAuthStore.getState().clearSession()
  useAuthStore.persist.clearStorage()
})
afterAll(() => {
  server.close()
  axios.defaults.adapter = originalAxiosAdapter
  client.defaults.adapter = originalClientAdapter
})

describe('API domain mappings', () => {
  it('sends appointment creation to the real endpoint with server-owned price fields omitted', async () => {
    let observed
    server.use(http.post(`${apiOrigin}/appointments`, async ({ request }) => {
      observed = { method: request.method, body: await request.json() }
      return HttpResponse.json({ success: true, message: 'Appointment created.', data: { _id: 'appt-1', fees: { totalAmount: 120 } } }, { status: 201 })
    }))

    const payload = { dentistId: 'dentist-1', date: '2026-10-23', startTime: '10:00', mode: 'in-clinic', reasonForVisit: 'Consultation' }
    const result = await api.appointments.create(payload)
    expect(observed).toEqual({ method: 'POST', body: payload })
    expect(result.data.fees.totalAmount).toBe(120)
  })

  it('sends an explicit staff override only when the caller requests it', async () => {
    let observedBody
    server.use(http.patch(`${apiOrigin}/appointments/appt-1/confirm`, async ({ request }) => {
      observedBody = await request.json()
      return HttpResponse.json({ success: true, message: 'Appointment confirmed.', data: { _id: 'appt-1' } })
    }))
    await api.appointments.confirm('appt-1', { staffOverride: true })
    expect(observedBody).toEqual({ staffOverride: true })
  })

  it('maps an appointment conflict to a normalized 409 without treating it as success', async () => {
    server.use(http.post(`${apiOrigin}/appointments`, () => HttpResponse.json({ success: false, message: 'This slot was just booked.', errors: [] }, { status: 409 })))
    await expect(api.appointments.create({ dentistId: 'dentist-1', date: '2026-10-23', startTime: '10:00' })).rejects.toMatchObject({
      status: 409,
      message: 'This slot was just booked.',
    })
  })

  it('preserves server field validation errors for auth forms', async () => {
    server.use(http.post(`${apiOrigin}/auth/login`, () => HttpResponse.json({
      success: false,
      message: 'Validation failed',
      errors: [{ field: 'email', message: 'Email is required.' }],
    }, { status: 422 })))
    await expect(api.auth.login({ email: '', password: 'secret' })).rejects.toMatchObject({
      status: 422,
      message: 'Validation failed',
      fieldErrors: { email: 'Email is required.' },
    })
  })

  it('does not attempt token refresh for unauthorized auth endpoints', async () => {
    let refreshCount = 0
    server.use(
      http.post(`${apiOrigin}/auth/verify-otp`, () => HttpResponse.json({ success: false, message: 'Invalid OTP.' }, { status: 401 })),
      http.post(`${apiOrigin}/auth/refresh-token`, () => {
        refreshCount += 1
        return HttpResponse.json({ success: true, data: { accessToken: 'unexpected', refreshToken: 'unexpected' } })
      }),
    )
    useAuthStore.getState().setSession({ user: { _id: 'patient-1', role: 'patient' }, accessToken: 'access', refreshToken: 'refresh' })
    await expect(api.auth.verifyOtp({ userId: 'patient-1', otp: '000000' })).rejects.toMatchObject({ status: 401, message: 'Invalid OTP.' })
    expect(refreshCount).toBe(0)
  })

  it('does not report success when payment setup is unavailable', async () => {
    server.use(http.post(`${apiOrigin}/payments/create-order`, () => HttpResponse.json({
      success: false,
      message: 'Online payments are not configured on the server yet.',
    }, { status: 503 })))
    await expect(api.payments.createOrder('appt-1')).rejects.toMatchObject({
      status: 503,
      message: 'Online payments are not configured on the server yet.',
    })
  })

  it('uses the staff invoice mark-paid route and method body', async () => {
    let observed
    server.use(http.patch(`${apiOrigin}/invoices/invoice-1/mark-paid`, async ({ request }) => {
      observed = await request.json()
      return HttpResponse.json({ success: true, message: 'Invoice marked as paid.', data: { _id: 'invoice-1', status: 'paid' } })
    }))
    await api.invoices.markPaid('invoice-1', 'upi')
    expect(observed).toEqual({ method: 'upi' })
  })

  it('uploads medical records with the backend multipart field names', async () => {
    let observed
    server.use(http.post(`${apiOrigin}/medical-records`, async ({ request }) => {
      const form = await request.formData()
      const uploadedFile = form.get('file')
      observed = {
        patientId: form.get('patientId'),
        title: form.get('title'),
        type: form.get('type'),
        file: uploadedFile ? (uploadedFile.name === 'blob' ? 'xray.png' : uploadedFile.name) : null,
      }
      return HttpResponse.json({ success: true, message: 'Medical record uploaded.', data: { _id: 'record-1' } }, { status: 201 })
    }))
    const form = new FormData()
    form.append('patientId', 'patient-1')
    form.append('title', 'X-ray')
    form.append('type', 'xray')
    form.append('file', new File(['image-bytes'], 'xray.png', { type: 'image/png' }))
    const result = await api.records.upload(form)
    expect(observed).toEqual({ patientId: 'patient-1', title: 'X-ray', type: 'xray', file: 'xray.png' })
    expect(result.data._id).toBe('record-1')
  })

  it('shares one refresh request across concurrent unauthorized API calls', async () => {
    let refreshCount = 0
    server.use(
      http.get(`${apiOrigin}/appointments/me`, ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer fresh-access') {
          return HttpResponse.json({ success: true, message: 'Appointments fetched.', data: [] })
        }
        return HttpResponse.json({ success: false, message: 'Expired.' }, { status: 401 })
      }),
      http.post(`${apiOrigin}/auth/refresh-token`, async ({ request }) => {
        refreshCount += 1
        expect(await request.json()).toEqual({ refreshToken: 'old-refresh' })
        return HttpResponse.json({ success: true, message: 'Token refreshed.', data: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' } })
      }),
    )
    useAuthStore.getState().setSession({ user: { _id: 'patient-1', role: 'patient' }, accessToken: 'old-access', refreshToken: 'old-refresh' })

    const results = await Promise.all([api.appointments.mine(), api.appointments.mine()])
    expect(results).toHaveLength(2)
    expect(refreshCount).toBe(1)
    expect(useAuthStore.getState().accessToken).toBe('fresh-access')
    expect(useAuthStore.getState().refreshToken).toBe('fresh-refresh')
  })

  it('requests the admin payments list with status filter and pagination', async () => {
    let observedParams
    server.use(
      http.get(`${apiOrigin}/payments`, ({ request }) => {
        const url = new URL(request.url)
        observedParams = {
          status: url.searchParams.get('status'),
          page: url.searchParams.get('page'),
          limit: url.searchParams.get('limit'),
        }
        return HttpResponse.json({
          success: true,
          message: 'Payments fetched.',
          data: [{ _id: 'payment-1', amount: 500, status: 'paid' }],
          meta: { total: 1, page: 1, limit: 20 },
        })
      }),
    )
    const result = await api.payments.all({ status: 'paid', page: 1, limit: 20 })
    expect(observedParams).toEqual({ status: 'paid', page: '1', limit: '20' })
    expect(result.data).toHaveLength(1)
    expect(result.data[0]._id).toBe('payment-1')
  })
})