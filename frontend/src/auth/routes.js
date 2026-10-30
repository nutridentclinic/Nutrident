export const roleHome = {
  patient: '/app',
  dentist: '/dentist',
  receptionist: '/reception',
  admin: '/admin',
}

export const getPortalBase = (role) => roleHome[role] || '/app'

