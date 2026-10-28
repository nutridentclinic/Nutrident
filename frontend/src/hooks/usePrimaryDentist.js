import { useQuery } from '@tanstack/react-query'
import { fetchPrimaryDentistWithFallback } from '../api/capabilities.js'

export function usePrimaryDentist() {
  const query = useQuery({
    queryKey: ['primary-dentist'],
    queryFn: fetchPrimaryDentistWithFallback,
    staleTime: 5 * 60 * 1000,
  })

  const data = query.data
  const dentist = data?.dentist ? data.dentist : (Array.isArray(data) ? data[0] : data)
  const reviews = data?.reviews || []

  const checklist = dentist?.checklist || dentist?.bookableChecklist || data?.bookableChecklist || null
  const isVerified = Boolean(dentist?.isVerified)
  const isPaused = Boolean(dentist && (!dentist.isActive || (dentist.pausedUntil && new Date(dentist.pausedUntil) > new Date())))

  const isAccepting = dentist
    ? (checklist ? Boolean(checklist.bookable) : (isVerified && !isPaused && dentist.isActive !== false && dentist.isAcceptingAppointments !== false))
    : false

  let bookingDisabledReason = ''
  if (dentist && !isAccepting) {
    if (checklist?.reasons?.length > 0) {
      bookingDisabledReason = checklist.reasons.join('; ')
    } else if (!isVerified) {
      bookingDisabledReason = 'Credentials not verified'
    } else if (dentist.pausedReason) {
      bookingDisabledReason = `Appointments paused: ${dentist.pausedReason}`
    } else if (isPaused) {
      bookingDisabledReason = 'Appointments temporarily paused'
    } else {
      bookingDisabledReason = 'Not accepting appointments at this time'
    }
  }

  return {
    ...query,
    dentist,
    reviews,
    checklist,
    bookingDisabledReason,
    isActive: Boolean(dentist?.isActive !== false),
    isAcceptingAppointments: isAccepting,
    isVerified,
    dentistId: dentist?._id,
  }
}

export default usePrimaryDentist
