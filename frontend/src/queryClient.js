import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      refetchOnWindowFocus: false,
    },
  },
})

// Attach to window for testing inspection and verification
if (typeof window !== 'undefined') {
  window.__QUERY_CLIENT__ = queryClient
}

export default queryClient
