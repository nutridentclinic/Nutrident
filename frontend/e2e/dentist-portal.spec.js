import { test, expect } from '@playwright/test'

test.describe('Dentist Portal End-to-End Smoke Test', () => {
  test('dentist schedule, reschedule dialog, prescriptions, availability, and notifications render and function cleanly', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
      console.log('[DENTIST E2E PAGE ERROR]:', err.message)
    })

    // Mock Dentist Login
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              _id: 'dentist-smoke-1',
              name: 'Dr. Vikram Seth',
              email: 'dentist@drnutrident.test',
              phone: '9876543210',
              role: 'dentist',
              isActive: true,
              isEmailVerified: true,
              isPhoneVerified: true,
            },
            accessToken: 'mock-dentist-token',
            refreshToken: 'mock-dentist-refresh',
          },
        }),
      })
    })

    // Mock Dentist Auth Me
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              _id: 'dentist-smoke-1',
              name: 'Dr. Vikram Seth',
              email: 'dentist@drnutrident.test',
              phone: '9876543210',
              role: 'dentist',
              isActive: true,
              isEmailVerified: true,
              isPhoneVerified: true,
              notificationPreferences: { email: true, push: true },
            },
            profile: {
              _id: 'profile-smoke-1',
              user: 'dentist-smoke-1',
              name: 'Dr. Vikram Seth',
              specialization: 'Periodontics',
              consultationFee: 600,
              slotDurationMinutes: 30,
              isActive: true,
              weeklyAvailability: [
                { day: 1, slots: [{ startTime: '09:00', endTime: '17:00' }] },
                { day: 2, slots: [{ startTime: '09:00', endTime: '17:00' }] },
                { day: 3, slots: [{ startTime: '09:00', endTime: '17:00' }] },
                { day: 4, slots: [{ startTime: '09:00', endTime: '17:00' }] },
                { day: 5, slots: [{ startTime: '09:00', endTime: '17:00' }] },
              ],
              unavailableDates: ['2026-11-15'],
            },
          },
        }),
      })
    })

    // Mock Dentist Mine Profile
    await page.route('**/api/dentists/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            _id: 'profile-smoke-1',
            user: { _id: 'dentist-smoke-1', name: 'Dr. Vikram Seth' },
            specialization: 'Periodontics',
            consultationFee: 600,
            slotDurationMinutes: 30,
            isActive: true,
            weeklyAvailability: [
              { day: 1, slots: [{ startTime: '09:00', endTime: '17:00' }] },
            ],
            unavailableDates: ['2026-11-15'],
          },
        }),
      })
    })

    // Mock Appointments Dentist Mine
    let appointmentList = [
      {
        _id: 'appt-smoke-1',
        patient: { _id: 'pat-1', name: 'Aarav Patel', phone: '9876543210' },
        dentist: 'profile-smoke-1',
        date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
        startTime: '10:00',
        endTime: '10:30',
        mode: 'in-clinic',
        reasonForVisit: 'Severe Toothache',
        paymentStatus: 'paid',
        status: 'confirmed',
      },
    ]

    await page.route('**/api/appointments/dentist/me*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: appointmentList,
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
            _id: 'profile-smoke-1',
            user: { _id: 'dentist-smoke-1', name: 'Dr. Vikram Seth' },
            specialization: 'Periodontics',
            consultationFee: 600,
            isActive: true,
          },
        }),
      })
    })

    // Mock Primary Slots
    await page.route('**/api/dentists/primary/slots*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { startTime: '11:00', endTime: '11:30' },
            { startTime: '11:30', endTime: '12:00' },
          ],
        }),
      })
    })

    // Mock Dentist Slots
    await page.route('**/api/dentists/*/slots*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { startTime: '11:00', endTime: '11:30' },
            { startTime: '11:30', endTime: '12:00' },
          ],
        }),
      })
    })

    // Mock Reschedule API
    let rescheduleCalled = false
    await page.route('**/api/appointments/*/reschedule', async (route) => {
      rescheduleCalled = true
      const postData = JSON.parse(route.request().postData() || '{}')
      appointmentList = [
        {
          ...appointmentList[0],
          date: postData.date,
          startTime: postData.startTime,
        },
      ]
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Appointment rescheduled successfully.',
          data: appointmentList[0],
        }),
      })
    })

    // Mock Refresh Token
    await page.route('**/api/auth/refresh-token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { accessToken: 'mock-dentist-token', refreshToken: 'mock-dentist-refresh' },
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

    // Mock Notifications
    let notificationsList = [
      {
        _id: 'notif-smoke-1',
        title: 'New Patient Booked',
        message: 'Aarav Patel booked a visit',
        isRead: false,
        createdAt: new Date().toISOString(),
      },
    ]

    let deleteNotifCalled = false
    await page.route('**/api/notifications/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteNotifCalled = true
        notificationsList = []
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Notification deleted.' }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: notificationsList,
          meta: { unreadCount: notificationsList.filter((n) => !n.isRead).length, total: notificationsList.length },
        }),
      })
    })

    // 1. Visit Login and Authenticate as Dentist
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('dentist@drnutrident.test')
    await page.locator('input[type="password"]').fill('Password123!')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Navigate to dentist appointments schedule
    await page.waitForURL('**/dentist**')
    await page.goto('/dentist/appointments')

    // Verify Schedule loaded
    await expect(page.locator('h1.page-title')).toContainText('Schedule')
    await expect(page.getByText('Aarav Patel')).toBeVisible()

    // 2. Test Reschedule Button and Dialog
    const reschedBtn = page.getByRole('button', { name: 'Reschedule' })
    await expect(reschedBtn).toBeVisible()
    await reschedBtn.click()

    // Verify modal rendered
    await expect(page.getByText('Reschedule Appointment')).toBeVisible()
    await expect(page.getByText(/Rescheduling/)).toBeVisible()

    // Click available slot
    const slotBtn = page.getByRole('button', { name: '11:30', exact: true })
    await expect(slotBtn).toBeVisible()
    await slotBtn.click()

    // Submit reschedule
    const saveTimeBtn = page.getByRole('button', { name: 'Save new time' })
    await saveTimeBtn.click()

    await expect.poll(() => rescheduleCalled).toBe(true)

    // 3. Test Availability Page and Leave Dates
    await page.goto('/dentist/availability')
    await expect(page.locator('h1.page-title')).toContainText('Availability')
    await expect(page.getByText('Weekly hours')).toBeVisible()
    await expect(page.getByText('Time off')).toBeVisible()

    // 4. Test Notifications Page and Deletion
    await page.goto('/dentist/notifications')
    await expect(page.locator('h1.page-title')).toContainText('Notifications')
    await expect(page.getByText('New Patient Booked')).toBeVisible()

    const deleteBtn = page.getByTitle('Delete notification')
    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()

    await expect.poll(() => deleteNotifCalled).toBe(true)

    // Verify no unhandled page errors
    expect(pageErrors).toEqual([])
  })
})
