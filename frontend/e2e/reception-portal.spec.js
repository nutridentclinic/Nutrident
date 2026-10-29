import { test, expect } from '@playwright/test'

test.describe('Reception Portal End-to-End Smoke Test', () => {
  test('all reception views (Appointments, Queue, Invoices, Settings, Notifications, 404) render and function cleanly', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
      console.log('[RECEPTION E2E PAGE ERROR]:', err.message)
    })

    // Mock Receptionist Login
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              _id: 'rec-smoke-1',
              name: 'Front Desk Lead',
              email: 'reception@drnutrident.test',
              phone: '9876543210',
              role: 'receptionist',
              isActive: true,
              isEmailVerified: true,
              isPhoneVerified: true,
            },
            accessToken: 'mock-reception-token',
            refreshToken: 'mock-reception-refresh',
          },
        }),
      })
    })

    // Mock Receptionist Auth & Profile
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              _id: 'rec-smoke-1',
              name: 'Front Desk Lead',
              email: 'reception@drnutrident.test',
              phone: '9876543210',
              role: 'receptionist',
              isActive: true,
              isEmailVerified: true,
              isPhoneVerified: true,
              notificationPreferences: { email: true, push: true },
            },
            profile: null,
          },
        }),
      })
    })

    // Mock Clinic Settings
    await page.route('**/api/settings/clinic', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            clinicName: 'DrNutrident Dental Clinic',
            cancellationFullRefundHours: 24,
          },
        }),
      })
    })

    // Mock Primary Dentist
    await page.route('**/api/dentists/primary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            _id: 'dentist-smoke-1',
            user: { name: 'Dr. Siddhesh Patil' },
            specialization: 'Orthodontics',
            consultationFee: 600,
            isActive: true,
            isVerified: true,
          },
        }),
      })
    })

    // Mock Appointments List
    await page.route('**/api/appointments?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'appt-smoke-1',
              date: '2026-10-29T00:00:00.000Z',
              startTime: '10:00',
              endTime: '10:30',
              status: 'confirmed',
              paymentStatus: 'paid',
              mode: 'in-clinic',
              patient: { _id: 'pat-1', name: 'Aarav Sharma', phone: '9876500001' },
              dentist: { user: { name: 'Dr. Siddhesh Patil' } },
              fees: { totalAmount: 600 },
              reasonForVisit: 'Routine cleaning',
            },
            {
              _id: 'appt-smoke-2',
              date: '2026-11-02T00:00:00.000Z',
              startTime: '14:00',
              endTime: '14:30',
              status: 'pending',
              paymentStatus: 'unpaid',
              mode: 'video',
              patient: { _id: 'pat-2', name: 'Priya Verma', phone: '9876500002' },
              dentist: { user: { name: 'Dr. Siddhesh Patil' } },
              fees: { totalAmount: 600 },
              reasonForVisit: 'Consultation',
            },
          ],
          meta: { total: 2, page: 1, limit: 20 },
        }),
      })
    })

    // Mock Single Appointment Detail
    await page.route('**/api/appointments/appt-smoke-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            _id: 'appt-smoke-1',
            date: '2026-10-29T00:00:00.000Z',
            startTime: '10:00',
            endTime: '10:30',
            status: 'confirmed',
            paymentStatus: 'paid',
            mode: 'in-clinic',
            patient: { _id: 'pat-1', name: 'Aarav Sharma', phone: '9876500001' },
            dentist: { user: { name: 'Dr. Siddhesh Patil' } },
            fees: { totalAmount: 600 },
            reasonForVisit: 'Routine cleaning',
          },
        }),
      })
    })

    // Mock Cancel Appointment
    await page.route('**/api/appointments/appt-smoke-1/cancel', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Appointment cancelled.',
        }),
      })
    })

    // Mock Queue Today
    await page.route('**/api/queue/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'q-smoke-1',
              tokenNumber: 1,
              status: 'waiting',
              date: '2026-10-29T00:00:00.000Z',
              estimatedWaitMinutes: 10,
              patient: { name: 'Aarav Sharma', phone: '9876500001' },
            },
          ],
        }),
      })
    })

    // Mock Invoices
    await page.route('**/api/invoices**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'inv-smoke-1',
              invoiceNumber: 'INV-2026-0001',
              status: 'unpaid',
              subTotal: 600,
              discount: 0,
              tax: 0,
              totalAmount: 600,
              paidAmount: 200,
              items: [{ description: 'Dental Consultation', quantity: 1, unitPrice: 600, amount: 600 }],
              patient: { name: 'Aarav Sharma', phone: '9876500001' },
              createdAt: '2026-10-29T09:00:00.000Z',
            },
          ],
          meta: { total: 1, page: 1, limit: 20 },
        }),
      })
    })

    // Mock Treatments
    await page.route('**/api/treatments**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ _id: 'treat-1', name: 'Consultation', cost: 600, isActive: true }],
        }),
      })
    })

    // Mock Notifications
    await page.route('**/api/notifications/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'notif-smoke-1',
              title: 'Patient Checked In',
              message: 'Aarav Sharma is waiting at token #1',
              isRead: false,
              link: '/reception/queue',
              createdAt: '2026-10-29T09:30:00.000Z',
            },
          ],
          meta: { total: 1, unreadCount: 1, page: 1, limit: 20 },
        }),
      })
    })

    // Perform Login as Receptionist
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('reception@drnutrident.test')
    await page.locator('input[type="password"]').fill('Password123!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL('**/reception**')

    // 1. Check Appointments Lookup View & Cancel Modal
    await page.goto('/reception/appointments')
    await expect(page.locator('h1.page-title')).toContainText('Appointments lookup')
    await expect(page.getByText('Aarav Sharma')).toBeVisible()
    await expect(page.getByText('Priya Verma')).toBeVisible()

    // Quick filter chips are present
    await expect(page.getByRole('button', { name: /^all/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^today/i })).toBeVisible()

    // Click Aarav Sharma row to open details panel
    await page.getByText('Aarav Sharma').click()
    const cancelApptBtn = page.getByRole('button', { name: /cancel appointment/i })
    await expect(cancelApptBtn).toBeVisible()
    await cancelApptBtn.click()

    // Confirmation dialog with modal backdrop
    await expect(page.locator('.modal-backdrop').first()).toBeVisible()
    await expect(page.getByText('Cancel this appointment?').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /keep appointment/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /yes, cancel appointment/i }).first()).toBeVisible()

    // Dismiss by keeping
    await page.getByRole('button', { name: /keep appointment/i }).first().click()
    await expect(page.locator('.modal-backdrop')).toHaveCount(0)

    // 2. Check Live Queue Desk
    await page.goto('/reception/queue')
    await expect(page.locator('h1.page-title')).toContainText('Live queue')
    await expect(page.getByText('Aarav Sharma')).toBeVisible()
    await expect(page.getByRole('button', { name: /call next/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /complete/i })).toBeVisible()

    // 3. Check Billing & Invoices Desk
    await page.goto('/reception/invoices')
    await expect(page.locator('h1.page-title')).toContainText('Invoices & Payments')
    await expect(page.getByText('INV-2026-0001')).toBeVisible()
    await expect(page.getByText('Total Billed')).toBeVisible()
    await expect(page.getByText('Total Collected')).toBeVisible()
    await expect(page.getByText('Total Outstanding')).toBeVisible()

    // 4. Check Settings View
    await page.goto('/reception/settings')
    await expect(page.getByText('Profile information')).toBeVisible()
    await expect(page.locator('input[value="Front Desk Lead"]')).toBeVisible()
    await expect(page.locator('input[value="9876543210"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Notification preferences' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Desk preferences' })).toBeVisible()

    // 5. Check Notifications Page
    await page.goto('/reception/notifications')
    await expect(page.locator('h1.page-title')).toContainText('Notifications')
    await expect(page.getByText('Patient Checked In')).toBeVisible()

    // 6. Check Catch-all 404 Route
    await page.goto('/reception/non-existent-page-test-404')
    await expect(page.getByText('Page not found')).toBeVisible()
    await expect(page.getByText('This Reception page does not exist.')).toBeVisible()
    await expect(page.getByRole('link', { name: /return to reception overview/i })).toBeVisible()

    // Ensure zero uncaught runtime exceptions occurred across all navigation
    expect(pageErrors).toHaveLength(0)
  })
})
