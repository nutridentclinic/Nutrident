import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OtpInput } from '../components/OtpInput.jsx'
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordNewPage,
  ResetPasswordVerifyPage,
  VerifyOtpPage,
  formatCountdown,
} from './AuthPages.jsx'
import { ToastProvider } from '../components/ui.jsx'
import { useAuthStore } from '../store/auth.js'
import { api } from '../api/domains.js'
import App from '../App.jsx'

vi.mock('../api/domains.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api?.auth,
        login: vi.fn(),
        register: vi.fn(),
        verifyOtp: vi.fn(),
        resendOtp: vi.fn(),
        forgotPassword: vi.fn(),
        verifyResetOtp: vi.fn(),
        resetPassword: vi.fn(),
        me: vi.fn(async () => {
          const user = useAuthStore.getState().user
          if (!user) {
            const err = new Error('Unauthorized')
            err.response = { status: 401 }
            throw err
          }
          return { success: true, data: { user, profile: null } }
        }),
      },
      settings: {
        get: vi.fn(async () => ({ success: true, data: { clinicName: 'Nutrident Clinic' } })),
      },
    },
  }
})

function renderWithProviders(ui, initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OtpInput component', () => {
  afterEach(cleanup)

  it('renders 6 single-digit inputs and supports typing and auto-advancing', () => {
    let currentOtp = ''
    const handleChange = vi.fn((val) => {
      currentOtp = val
    })

    const { rerender } = render(<OtpInput value={currentOtp} onChange={handleChange} />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(6)

    fireEvent.change(inputs[0], { target: { value: '1' } })
    expect(handleChange).toHaveBeenCalledWith('1')

    rerender(<OtpInput value="1" onChange={handleChange} />)
    fireEvent.change(inputs[1], { target: { value: '2' } })
    expect(handleChange).toHaveBeenCalledWith('12')
  })

  it('supports pasting a full 6-digit code', () => {
    const handleChange = vi.fn()
    render(<OtpInput value="" onChange={handleChange} />)
    const inputs = screen.getAllByRole('textbox')

    fireEvent.paste(inputs[0], {
      clipboardData: {
        getData: () => '849201',
      },
    })

    expect(handleChange).toHaveBeenCalledWith('849201')
  })

  it('supports backspace navigation', () => {
    const handleChange = vi.fn()
    render(<OtpInput value="123" onChange={handleChange} />)
    const inputs = screen.getAllByRole('textbox')

    fireEvent.keyDown(inputs[2], { key: 'Backspace' })
    expect(handleChange).toHaveBeenCalledWith('12')
  })

  it('renders six equal-width digit boxes with CSS classes and size=1', () => {
    const { container } = render(<OtpInput value="" onChange={() => {}} />)
    const grid = container.querySelector('.otp-boxes-grid')
    expect(grid).toBeTruthy()
    const inputs = container.querySelectorAll('.otp-digit-box')
    expect(inputs).toHaveLength(6)
    inputs.forEach((input) => {
      expect(input.getAttribute('size')).toBe('1')
      expect(input.getAttribute('inputmode')).toBe('numeric')
    })
  })

  it('formats countdown as mm:ss', () => {
    expect(formatCountdown(60)).toBe('01:00')
    expect(formatCountdown(634)).toBe('10:34')
    expect(formatCountdown(5)).toBe('00:05')
  })
})

describe('Mandatory OTP Verification flow', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('Register: stores no tokens on success, stores pendingVerification in sessionStorage, and routes to verify', async () => {
    api.auth.register.mockResolvedValueOnce({
      success: true,
      message: 'Account created. We emailed your 6-digit verification code.',
      data: {
        email: 'newpatient@example.com',
        userId: 'p-100',
        requiresVerification: true,
        otpSent: true,
        resendAvailableAt: new Date(Date.now() + 60000).toISOString(),
      },
    })

    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-otp" element={<div>Verify OTP Screen</div>} />
      </Routes>,
      ['/register'],
    )

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'newpatient@example.com' } })
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '9876543210' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(api.auth.register).toHaveBeenCalledWith({
        name: 'Jane Doe',
        email: 'newpatient@example.com',
        phone: '9876543210',
        password: 'password123',
      })
    })

    // Verify NO tokens are stored in auth store
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()

    // Verify pendingVerification stored in sessionStorage
    const stored = JSON.parse(sessionStorage.getItem('pendingVerification') || '{}')
    expect(stored.email).toBe('newpatient@example.com')

    // Verify redirected to /verify-otp
    expect(await screen.findByText('Verify OTP Screen')).toBeTruthy()
  })

  it('VerifyOtpPage: shows masked email, handles OTP verification, sets session and navigates to app', async () => {
    sessionStorage.setItem(
      'pendingVerification',
      JSON.stringify({ email: 'patient@example.com', otpSent: true }),
    )

    api.auth.verifyOtp.mockResolvedValueOnce({
      success: true,
      data: {
        user: { _id: 'u-1', email: 'patient@example.com', role: 'patient', isEmailVerified: true },
        accessToken: 'valid-access-jwt',
        refreshToken: 'valid-refresh-jwt',
      },
    })

    renderWithProviders(
      <Routes>
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/app" element={<div>Patient Portal Dashboard</div>} />
      </Routes>,
      ['/verify-otp'],
    )

    expect(screen.getByText(/p\*\*\*@example\.com/)).toBeTruthy()
    // Verification is mandatory - ensure optional message is not displayed
    expect(screen.queryByText(/verification is optional/i)).toBeNull()
    expect(screen.queryByText(/continue without verifying/i)).toBeNull()

    // Enter 6-digit OTP
    const inputs = screen.getAllByRole('textbox')
    fireEvent.paste(inputs[0], { clipboardData: { getData: () => '123456' } })

    const verifyBtn = screen.getByRole('button', { name: /verify email/i })
    expect(verifyBtn.disabled).toBe(false)
    fireEvent.click(verifyBtn)

    await waitFor(() => {
      expect(api.auth.verifyOtp).toHaveBeenCalledWith({ email: 'patient@example.com', otp: '123456' })
      expect(useAuthStore.getState().accessToken).toBe('valid-access-jwt')
      expect(sessionStorage.getItem('pendingVerification')).toBeNull()
    })

    expect(await screen.findByText('Patient Portal Dashboard')).toBeTruthy()
  })

  it('VerifyOtpPage: shows locked timer on HTTP 429 lockout', async () => {
    sessionStorage.setItem(
      'pendingVerification',
      JSON.stringify({ email: 'patient@example.com' }),
    )

    const lockError = new Error('Account temporarily locked.')
    lockError.status = 429
    lockError.retryAfterSeconds = 900
    api.auth.verifyOtp.mockReset()
    api.auth.verifyOtp.mockRejectedValueOnce(lockError)

    renderWithProviders(
      <Routes>
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
      </Routes>,
      ['/verify-otp'],
    )

    const inputs = screen.getAllByRole('textbox')
    fireEvent.paste(inputs[0], { clipboardData: { getData: () => '999999' } })

    const verifyBtn = screen.getByRole('button', { name: /verify email/i })
    fireEvent.click(verifyBtn)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('temporarily locked')
    })

    expect(screen.getByRole('button', { name: /verify email/i }).disabled).toBe(true)
  })

  it('LoginPage: catches 403 EMAIL_NOT_VERIFIED and redirects to /verify-otp with pendingVerification', async () => {
    const unverifiedErr = new Error('Please verify your email to continue.')
    unverifiedErr.status = 403
    unverifiedErr.code = 'EMAIL_NOT_VERIFIED'
    unverifiedErr.email = 'unverified@example.com'
    unverifiedErr.resendAvailableAt = new Date(Date.now() + 60000).toISOString()
    api.auth.login.mockReset()
    api.auth.login.mockRejectedValueOnce(unverifiedErr)

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-otp" element={<div>Verify OTP Screen</div>} />
      </Routes>,
      ['/login'],
    )

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'unverified@example.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'mysecret' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(api.auth.login).toHaveBeenCalledWith({ email: 'unverified@example.com', password: 'mysecret' })
    })

    // Tokens must NOT be stored
    expect(useAuthStore.getState().accessToken).toBeNull()

    // pendingVerification must be set
    const stored = JSON.parse(sessionStorage.getItem('pendingVerification') || '{}')
    expect(stored.email).toBe('unverified@example.com')

    // Redirected to /verify-otp
    expect(await screen.findByText('Verify OTP Screen')).toBeTruthy()
  })

  it('RequireRole: blocks unverified patient and redirects to /verify-otp', async () => {
    useAuthStore.getState().setSession({
      user: { _id: 'patient-stale', email: 'stale@example.com', role: 'patient', isEmailVerified: false },
      accessToken: 'stale-access-jwt',
      refreshToken: 'stale-refresh-jwt',
    })

    api.auth.me.mockReset()
    api.auth.me.mockResolvedValueOnce({
      success: true,
      data: {
        user: { _id: 'patient-stale', email: 'stale@example.com', role: 'patient', isEmailVerified: false },
        profile: null,
      },
    })

    renderWithProviders(<App />, ['/app'])

    // Must be redirected to Verify OTP page
    expect(await screen.findByText(/enter the 6-digit code/i)).toBeTruthy()
    const stored = JSON.parse(sessionStorage.getItem('pendingVerification') || '{}')
    expect(stored.email).toBe('stale@example.com')
  })
})

describe('Two-Step Password Reset flow', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('Step 1 -> Step 2 -> Step 3 flow works sequentially', async () => {
    api.auth.forgotPassword.mockReset()
    api.auth.forgotPassword.mockResolvedValueOnce({
      success: true,
      message: 'If the email exists, a reset code has been sent.',
      data: { resendAvailableAt: new Date(Date.now() + 60000).toISOString() },
    })

    api.auth.verifyResetOtp.mockReset()
    api.auth.verifyResetOtp.mockResolvedValueOnce({
      success: true,
      data: { resetToken: 'mock-reset-token-32-bytes', expiresInSeconds: 600 },
    })

    api.auth.resetPassword.mockReset()
    api.auth.resetPassword.mockResolvedValueOnce({
      success: true,
      message: 'Password updated. Sign in with your new password.',
    })

    renderWithProviders(
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/verify" element={<ResetPasswordVerifyPage />} />
        <Route path="/reset-password/new" element={<ResetPasswordNewPage />} />
        <Route path="/login" element={<div>Login Page Display</div>} />
      </Routes>,
      ['/forgot-password'],
    )

    // Step 1: Submit email
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }))

    await waitFor(() => {
      expect(api.auth.forgotPassword).toHaveBeenCalledWith({ email: 'user@example.com' })
    })

    // Step 2: Now on verify code page
    expect(await screen.findByRole('heading', { name: /verify code/i })).toBeTruthy()
    const inputs = screen.getAllByRole('textbox')
    fireEvent.paste(inputs[0], { clipboardData: { getData: () => '654321' } })

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(api.auth.verifyResetOtp).toHaveBeenCalledWith({ email: 'user@example.com', otp: '654321' })
    })

    // Step 3: Now on set new password page
    expect(await screen.findByRole('heading', { name: /create new password/i })).toBeTruthy()

    // Test password mismatch check
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpassword123' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'mismatch' } })

    expect(await screen.findByText(/passwords do not match/i)).toBeTruthy()

    // Correct confirmation and submit
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpassword123' } })
    const submitBtn = screen.getByRole('button', { name: /set new password/i })
    expect(submitBtn.disabled).toBe(false)
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(api.auth.resetPassword).toHaveBeenCalledWith({
        resetToken: 'mock-reset-token-32-bytes',
        password: 'newpassword123',
      })
    })

    // Tokens cleared, redirects to login
    expect(sessionStorage.getItem('pendingReset')).toBeNull()
    expect(await screen.findByText('Login Page Display')).toBeTruthy()
  })

  it('Step 2 without email redirects to /forgot-password', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/forgot-password" element={<div>Forgot Password Step 1</div>} />
        <Route path="/reset-password/verify" element={<ResetPasswordVerifyPage />} />
      </Routes>,
      ['/reset-password/verify'],
    )

    expect(await screen.findByText('Forgot Password Step 1')).toBeTruthy()
  })

  it('Step 3 without token redirects to /forgot-password', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/forgot-password" element={<div>Forgot Password Step 1</div>} />
        <Route path="/reset-password/new" element={<ResetPasswordNewPage />} />
      </Routes>,
      ['/reset-password/new'],
    )

    expect(await screen.findByText('Forgot Password Step 1')).toBeTruthy()
  })
})
