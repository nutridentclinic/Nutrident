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

  const isAccepting = dentist ? (dentist.isActive !== false && dentist.isAcceptingAppointments !== false) : false

  return {
    ...query,
    dentist,
    reviews,
    isActive: Boolean(dentist?.isActive !== false),
    isAcceptingAppointments: isAccepting,
    isVerified: Boolean(dentist?.isVerified),
    dentistId: dentist?._id,
  }
}

export default usePrimaryDentist
