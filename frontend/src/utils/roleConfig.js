export const ROLE_CONFIG = {
  patient: { name: 'Patient', portal: 'Patient Portal' },
  dentist: { name: 'Doctor', portal: 'Doctor Portal' },
  receptionist: { name: 'Receptionist', portal: 'Receptionist Portal' },
  admin: { name: 'Admin', portal: 'Admin Portal' },
};

export const getRoleFriendlyName = (role) => ROLE_CONFIG[role]?.name || role;
export const getRolePortalName = (role) => ROLE_CONFIG[role]?.portal || `${role} Portal`;

