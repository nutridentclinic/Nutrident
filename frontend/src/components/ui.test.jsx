import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorState } from './ui.jsx'

afterEach(cleanup)

describe('shared API error state', () => {
  it('shows the backend message and retries only when requested', () => {
    const retry = vi.fn()
    render(<ErrorState error={new Error('Validation failed')} onRetry={retry} />)
    expect(screen.getByRole('alert').textContent).toContain('Validation failed')
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('renders an error without a retry action when no retry is available', () => {
    render(<ErrorState error={new Error('Payment provider unavailable')} />)
    expect(screen.getByRole('alert').textContent).toContain('Payment provider unavailable')
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })
})