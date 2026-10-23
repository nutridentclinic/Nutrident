import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import axios from 'axios'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import client from './client.js'
import {
  detectLogoutCapability,
  fetchPrimaryDentistWithFallback,
  fetchPrimarySlotsWithFallback,
  detectStaffBookingCapability,
  getCapabilities,
} from './capabilities.js'

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
  const caps = getCapabilities()
  caps.hasServerLogout = null
  caps.hasPrimaryDentist = null
  caps.hasStaffBooking = null
})

afterAll(() => {
  server.close()
  axios.defaults.adapter = originalAxiosAdapter
  client.defaults.adapter = originalClientAdapter
})

describe('API Capabilities & Graceful Fallbacks', () => {
  it('detects logout capability when endpoint exists', async () => {
    server.use(
      http.post(`${apiOrigin}/auth/logout`, () => {
        return HttpResponse.json({ success: true, message: 'Logged out successfully.' })
      })
    )
    const result = await detectLogoutCapability('test-refresh')
    expect(result).toBe(true)
    expect(getCapabilities().hasServerLogout).toBe(true)
  })

  it('detects logout capability is false when endpoint returns 404', async () => {
    server.use(
      http.post(`${apiOrigin}/auth/logout`, () => {
        return HttpResponse.json({ message: 'Not found' }, { status: 404 })
      })
    )
    const result = await detectLogoutCapability('test-refresh')
    expect(result).toBe(false)
    expect(getCapabilities().hasServerLogout).toBe(false)
  })

  it('fetches primary dentist directly when /dentists/primary is supported', async () => {
    server.use(
      http.get(`${apiOrigin}/dentists/primary`, () => {
        return HttpResponse.json({
          success: true,
          data: {
            dentist: { _id: 'primary-1', specialization: 'Orthodontics', user: { name: 'Dr. Smile' } },
            reviews: [],
          },
        })
      })
    )
    const result = await fetchPrimaryDentistWithFallback()
    expect(result.dentist._id).toBe('primary-1')
    expect(getCapabilities().hasPrimaryDentist).toBe(true)
  })

  it('falls back to /dentists?limit=1 when /dentists/primary returns 404 or 400', async () => {
    server.use(
      http.get(`${apiOrigin}/dentists/primary`, () => {
        return HttpResponse.json({ message: 'Cast to ObjectId failed' }, { status: 400 })
      }),
      http.get(`${apiOrigin}/dentists`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('limit')).toBe('1')
        return HttpResponse.json({
          success: true,
          data: [{ _id: 'fallback-dentist-1', specialization: 'General', user: { name: 'Dr. Fallback' } }],
        })
      }),
      http.get(`${apiOrigin}/dentists/fallback-dentist-1`, () => {
        return HttpResponse.json({
          success: true,
          data: {
            dentist: { _id: 'fallback-dentist-1', specialization: 'General', user: { name: 'Dr. Fallback' } },
            reviews: [],
          },
        })
      })
    )
    const result = await fetchPrimaryDentistWithFallback()
    expect(result.dentist._id).toBe('fallback-dentist-1')
    expect(getCapabilities().hasPrimaryDentist).toBe(false)
  })

  it('fetches primary slots directly when /dentists/primary/slots is supported', async () => {
    server.use(
      http.get(`${apiOrigin}/dentists/primary/slots`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('date')).toBe('2026-10-25')
        return HttpResponse.json({
          success: true,
          data: [{ time: '10:00', available: true }],
        })
      })
    )
    const slots = await fetchPrimarySlotsWithFallback('2026-10-25')
    expect(slots).toEqual([{ time: '10:00', available: true }])
  })

  it('falls back to /dentists/:id/slots when /dentists/primary/slots returns 404', async () => {
    server.use(
      http.get(`${apiOrigin}/dentists/primary/slots`, () => {
        return HttpResponse.json({ message: 'Not found' }, { status: 404 })
      }),
      http.get(`${apiOrigin}/dentists/dentist-99/slots`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('date')).toBe('2026-10-25')
        return HttpResponse.json({
          success: true,
          data: [{ time: '11:00', available: true }],
        })
      })
    )
    const slots = await fetchPrimarySlotsWithFallback('2026-10-25', 'dentist-99')
    expect(slots).toEqual([{ time: '11:00', available: true }])
  })

  it('detects staff booking capability when endpoint exists or returns validation error (not 404)', async () => {
    server.use(
      http.post(`${apiOrigin}/appointments/staff`, () => {
        return HttpResponse.json({ message: 'Validation failed' }, { status: 422 })
      })
    )
    const result = await detectStaffBookingCapability()
    expect(result).toBe(true)
    expect(getCapabilities().hasStaffBooking).toBe(true)
  })

  it('detects staff booking capability is false when endpoint returns 404', async () => {
    server.use(
      http.post(`${apiOrigin}/appointments/staff`, () => {
        return HttpResponse.json({ message: 'Not found' }, { status: 404 })
      })
    )
    const result = await detectStaffBookingCapability()
    expect(result).toBe(false)
    expect(getCapabilities().hasStaffBooking).toBe(false)
  })
})
