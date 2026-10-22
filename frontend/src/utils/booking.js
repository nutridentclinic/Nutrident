import { formatInTimeZone } from 'date-fns-tz'

export const clinicDate = (now = new Date(), timeZone = import.meta.env.VITE_CLINIC_TIMEZONE || 'Asia/Kolkata') =>
  formatInTimeZone(now, timeZone, 'yyyy-MM-dd')

export const clinicTime = (now = new Date(), timeZone = import.meta.env.VITE_CLINIC_TIMEZONE || 'Asia/Kolkata') =>
  formatInTimeZone(now, timeZone, 'HH:mm')

export const isPastSlot = (date, startTime, now = new Date(), timeZone = import.meta.env.VITE_CLINIC_TIMEZONE || 'Asia/Kolkata') =>
  date < clinicDate(now, timeZone) || (date === clinicDate(now, timeZone) && startTime <= clinicTime(now, timeZone))