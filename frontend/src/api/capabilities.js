import client from './client.js'

const capabilities = {
  hasServerLogout: null,
  hasPrimaryDentist: null,
  hasStaffBooking: null,
}

export const getCapabilities = () => capabilities

export const detectLogoutCapability = async (refreshToken) => {
  if (capabilities.hasServerLogout !== null) return capabilities.hasServerLogout
  try {
    await client.post('/auth/logout', { refreshToken }, { timeout: 3000 })
    capabilities.hasServerLogout = true
    return true
  } catch (err) {
    if (err.status === 404) {
      capabilities.hasServerLogout = false
      return false
    }
    capabilities.hasServerLogout = err.status !== 404
    return capabilities.hasServerLogout
  }
}

export const fetchPrimaryDentistWithFallback = async () => {
  try {
    const res = await client.get('/dentists/primary')
    capabilities.hasPrimaryDentist = true
    return res.data?.data || null
  } catch (err) {
    // If 404 or 400 (as deployed server currently matches /dentists/:id and casts 'primary' into ObjectId), fall back
    if (err.status === 404 || err.status === 400) {
      capabilities.hasPrimaryDentist = false
      try {
        const fallbackRes = await client.get('/dentists', { params: { limit: 1 } })
        const list = fallbackRes.data?.data || []
        const dentist = list[0] || null
        if (dentist) {
          try {
            const detailRes = await client.get(`/dentists/${dentist._id}`)
            return detailRes.data?.data || dentist
          } catch {
            return dentist
          }
        }
        return null
      } catch {
        return null
      }
    }
    throw err
  }
}

export const fetchPrimarySlotsWithFallback = async (date, dentistId) => {
  try {
    const res = await client.get('/dentists/primary/slots', { params: { date } })
    return res.data?.data || []
  } catch (err) {
    if ((err.status === 404 || err.status === 400) && dentistId) {
      const res = await client.get(`/dentists/${dentistId}/slots`, { params: { date } })
      return res.data?.data || []
    }
    throw err
  }
}

export const detectStaffBookingCapability = async () => {
  if (capabilities.hasStaffBooking !== null) return capabilities.hasStaffBooking
  try {
    await client.post('/appointments/staff', {}, { timeout: 3000 })
    capabilities.hasStaffBooking = true
    return true
  } catch (err) {
    if (err.status === 404) {
      capabilities.hasStaffBooking = false
      return false
    }
    capabilities.hasStaffBooking = true
    return true
  }
}

export const fetchAvailabilityRangeWithFallback = async (from, to, dentistId) => {
  try {
    const res = await client.get('/dentists/primary/availability', { params: { from, to } })
    return res.data?.data || []
  } catch (err) {
    if (err.status === 404 || err.status === 400) {
      // If deployed backend doesn't have the range endpoint yet, fall back to individual daily slot queries
      return null
    }
    throw err
  }
}

export const fetchWeeklyAppointmentsWithFallback = async (params = {}) => {
  try {
    const res = await client.get('/dashboard/admin/appointments-weekly', { params })
    return res.data?.data || null
  } catch (err) {
    if (err.status === 404) {
      return null
    }
    throw err
  }
}

export const fetchPatientSummaryWithFallback = async (id) => {
  try {
    const res = await client.get(`/patients/${id}/summary`)
    return res.data?.data || null
  } catch (err) {
    if (err.status === 404) {
      return null
    }
    throw err
  }
}

export default capabilities
