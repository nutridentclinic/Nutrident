import client, { request } from './client.js'

const get = (url, params) => request({ method: 'GET', url, params })
const post = (url, data) => request({ method: 'POST', url, data })
const patch = (url, data) => request({ method: 'PATCH', url, data })
const remove = (url) => request({ method: 'DELETE', url })

export const api = {
  auth: {
    login: (data) => post('/auth/login', data),
    register: (data) => post('/auth/register', data),
    me: () => get('/auth/me'),
    verifyOtp: (data) => post('/auth/verify-otp', data),
    resendOtp: (data) => post('/auth/resend-otp', data),
    forgotPassword: (data) => post('/auth/forgot-password', data),
    resetPassword: (data) => post('/auth/reset-password', data),
    updatePassword: (data) => patch('/auth/update-password', data),
    updatePhoto: (formData) => request({ method: 'PATCH', url: '/auth/me/photo', data: formData, headers: { 'Content-Type': 'multipart/form-data' } }),
  },
  dentists: {
    list: (params) => get('/dentists', params),
    primary: () => get('/dentists/primary'),
    primarySlots: (date) => get('/dentists/primary/slots', { date }),
    adminList: (params) => get('/dentists/admin/all', params),
    myPatients: () => get('/dentists/me/patients'),
    detail: (id) => get(`/dentists/${id}`),
    slots: (id, date) => get(`/dentists/${id}/slots`, { date }),
    updateMe: (data) => patch('/dentists/me', data),
    toggleActive: () => patch('/dentists/me/toggle-active'),
    setUnavailableDates: (dates) => patch('/dentists/me/unavailable-dates', { dates }),
    create: (data) => post('/dentists', data),
    verify: (id) => patch(`/dentists/${id}/verify`),
  },
  clinics: {
    list: (params) => get('/clinics', params),
    create: (data) => post('/clinics', data),
    update: (id, data) => patch(`/clinics/${id}`, data),
    assignDentist: (id, dentistId) => patch(`/clinics/${id}/assign-dentist`, { dentistId }),
    deactivate: (id) => request({ method: 'DELETE', url: `/clinics/${id}` }),
  },
  treatments: {
    list: () => get('/treatments'),
    create: (data) => post('/treatments', data),
    update: (id, data) => patch(`/treatments/${id}`, data),
    remove: (id) => remove(`/treatments/${id}`),
  },
  settings: { get: () => get('/clinic-settings'), update: (data) => patch('/clinic-settings', data) },
  appointments: {
    create: (data) => post('/appointments', data),
    createStaff: (data) => post('/appointments/staff', data),
    mine: (params) => get('/appointments/me', params),
    dentistMine: (params) => get('/appointments/dentist/me', params),
    all: (params) => get('/appointments', params),
    detail: (id) => get(`/appointments/${id}`),
    confirm: (id, data = {}) => patch(`/appointments/${id}/confirm`, data),
    cancel: (id, reason) => patch(`/appointments/${id}/cancel`, { reason }),
    reschedule: (id, data) => patch(`/appointments/${id}/reschedule`, data),
    complete: (id) => patch(`/appointments/${id}/complete`),
    noShow: (id) => patch(`/appointments/${id}/no-show`),
    joinVideo: (id) => post(`/appointments/${id}/video/join`),
  },
  payments: {
    all: (params) => get('/payments', params),
    createOrder: (appointmentId) => post('/payments/create-order', { appointmentId }),
    verify: (data) => post('/payments/verify', data),
    mine: () => get('/payments/me'),
    refund: (id, data) => post(`/payments/${id}/refund`, data),
  },
  patients: {
    mine: () => get('/patients/me'),
    update: (data) => patch('/patients/me', data),
    updateBasic: (data) => patch('/patients/me/basic-info', data),
    list: (params) => get('/patients', params),
    detail: (id) => get(`/patients/${id}`),
    createWalkIn: (data) => post('/patients', data),
    addFamily: (data) => post('/patients/me/family-members', data),
    removeFamily: (id) => remove(`/patients/me/family-members/${id}`),
  },
  records: {
    mine: (params) => get('/medical-records/me', params),
    forPatient: (id) => get(`/medical-records/patient/${id}`),
    upload: (data) => post('/medical-records', data),
    remove: (id) => remove(`/medical-records/${id}`),
  },
  prescriptions: { mine: () => get('/prescriptions/me'), forPatient: (id) => get(`/prescriptions/patient/${id}`), create: (data) => post('/prescriptions', data) },
  plans: {
    mine: () => get('/treatment-plans/me'),
    forPatient: (id) => get(`/treatment-plans/patient/${id}`),
    create: (data) => post('/treatment-plans', data),
    updateStep: (id, stepId, data) => patch(`/treatment-plans/${id}/steps/${stepId}`, data),
  },
  charts: { get: (patientId) => get(`/dental-charts/${patientId}`), updateTooth: (patientId, tooth, data) => patch(`/dental-charts/${patientId}/tooth/${tooth}`, data) },
  invoices: {
    mine: () => get('/invoices/me'),
    all: (params) => get('/invoices', params),
    detail: (id) => get(`/invoices/${id}`),
    create: (data) => post('/invoices', data),
    markPaid: (id, method) => patch(`/invoices/${id}/mark-paid`, { method }),
  },
  notifications: {
    mine: (params) => get('/notifications/me', params),
    read: (id) => patch(`/notifications/${id}/read`),
    readAll: () => patch('/notifications/read-all'),
    preferences: () => get('/notifications/preferences'),
    updatePreferences: (data) => patch('/notifications/preferences', data),
  },
  queue: {
    get: (dentistId, date) => get(`/queue/dentist/${dentistId}`, { date }),
    checkIn: (data) => post('/queue/check-in', data),
    call: (id) => patch(`/queue/${id}/call`),
    complete: (id) => patch(`/queue/${id}/complete`),
    skip: (id) => patch(`/queue/${id}/skip`),
  },
  reviews: { forDentist: (id) => get(`/reviews/dentist/${id}`), create: (data) => post('/reviews', data), reply: (id, text) => post(`/reviews/${id}/reply`, { text }) },
  staff: {
    list: (params) => get('/staff', params),
    create: (data) => post('/staff', data),
    activate: (id) => patch(`/staff/${id}/activate`),
    deactivate: (id) => patch(`/staff/${id}/deactivate`),
  },
  coupons: {
    list: () => get('/coupons'),
    create: (data) => post('/coupons', data),
    update: (id, data) => patch(`/coupons/${id}`, data),
    remove: (id) => remove(`/coupons/${id}`),
    validate: (data) => post('/coupons/validate', data),
  },
  dashboard: {
    admin: () => get('/dashboard/admin'),
    weekly: () => get('/dashboard/admin/appointments-weekly'),
    revenue: () => get('/dashboard/admin/revenue-monthly'),
    specialties: () => get('/dashboard/admin/top-specialties'),
    dentist: () => get('/dashboard/dentist/me'),
    receptionist: () => get('/dashboard/receptionist'),
  },
}

export async function downloadPdf(path, filename) {
  const response = await client.get(path, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}