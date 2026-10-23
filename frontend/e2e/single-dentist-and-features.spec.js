import { test, expect } from '@playwright/test'

const mockDentistUser = {
  _id: '6ad9051aa066c1d146077111',
  name: 'Siddhesh Patil',
  email: 'dentist@drnutrident.com',
  phone: '9876543210',
  role: 'dentist',
  isActive: true,
}

const mockDentist = {
  _id: '6ad9051ba066c1d146077222',
  user: mockDentistUser,
  specialization: 'Prosthodontics & Implantology',
  qualifications: ['BDS', 'MDS'],
  experienceYears: 12,
  about: 'Dedicated to providing high quality, gentle dental care.',
  consultationFee: 300,
  isActive: true,
  isAcceptingAppointments: true,
  isVerified: true,
  availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  workingHours: { start: '09:00', end: '22:00' },
  slotDurationMinutes: 30,
}

const mockPatientUser = {
  _id: '6ad9051aa066c1d146077333',
  name: 'Aarav Sharma',
  email: 'aarav@example.com',
  phone: '9876543211',
  role: 'patient',
  isActive: true,
}

const mockReceptionistUser = {
  _id: '6ad9051aa066c1d146077444',
  name: 'Priya Reception',
  email: 'reception@drnutrident.com',
  phone: '9876543212',
  role: 'receptionist',
  isActive: true,
}

const mockAdminUser = {
  _id: '6ad9051aa066c1d146077555',
  name: 'Admin Owner',
  email: 'admin@drnutrident.com',
  phone: '9876543213',
  role: 'admin',
  isActive: true,
}

test.describe('Workstream B & C: Single Dentist & Feature Verification Suite', () => {
  let currentUser = mockPatientUser
  let currentToken = 'mock-patient-access'

  test.beforeEach(async ({ page }) => {
    currentUser = mockPatientUser
    currentToken = 'mock-patient-access'

    // Clinic settings
    await page.route('**/api/clinic-settings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Settings',
          data: {
            clinicName: 'DrNutrident Dental Clinic',
            tagline: 'Expert Dental Care',
            address: 'Shop 4, Sunrise Plaza, Pune, Maharashtra',
            phone: '+91 98765 43210',
            email: 'care@drnutrident.com',
            platformFee: 25,
            cancellationFullRefundHours: 24,
            aboutText: 'DrNutrident provides patient-focused dental wellness.',
            openingHours: 'Mon - Sat: 9:00 AM - 7:00 PM',
          },
        }),
      })
    })

    // Auth endpoints
    await page.route('**/api/auth/login', async (route) => {
      const body = route.request().postDataJSON()
      const email = body?.email || ''
      if (email.includes('reception')) {
        currentUser = mockReceptionistUser
        currentToken = 'mock-reception-access'
      } else if (email.includes('admin')) {
        currentUser = mockAdminUser
        currentToken = 'mock-admin-access'
      } else {
        currentUser = mockPatientUser
        currentToken = 'mock-patient-access'
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Logged in',
          data: {
            user: currentUser,
            accessToken: currentToken,
            refreshToken: `${currentToken}-refresh`,
          },
        }),
      })
    })

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Profile fetched.',
          data: { user: currentUser, profile: null },
        }),
      })
    })

    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Logged out successfully' }),
      })
    })

    // Dentist primary slots (set evening time to never be filtered by isPastSlot)
    await page.route('**/api/dentists/primary/slots**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { startTime: '21:00', endTime: '21:30', available: true },
            { startTime: '21:30', endTime: '22:00', available: true },
          ],
        }),
      })
    })

    await page.route(/.*\/api\/dentists\/[a-zA-Z0-9_-]+\/slots.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { startTime: '21:00', endTime: '21:30', available: true },
            { startTime: '21:30', endTime: '22:00', available: true },
          ],
        }),
      })
    })

    // Admin dentist all
    await page.route('**/api/dentists/admin/all**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [mockDentist],
          meta: { total: 1 },
        }),
      })
    })

    // Dentist primary
    await page.route('**/api/dentists/primary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            dentist: mockDentist,
            reviews: [
              { _id: 'r1', rating: 5, comment: 'Dr. Patil is extremely gentle and thorough!', patient: { name: 'Sunil K.' } },
            ],
          },
        }),
      })
    })

    // Dentists list
    await page.route(/.*\/api\/dentists(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [mockDentist],
          meta: { total: 1 },
        }),
      })
    })

    // Notifications & Common dashboard data
    await page.route('**/api/notifications/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], meta: { unreadCount: 0 } }),
      })
    })

    await page.route('**/api/appointments/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], meta: { total: 0 } }),
      })
    })

    await page.route('**/api/prescriptions/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], meta: { total: 0 } }),
      })
    })

    await page.route('**/api/patients/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { _id: 'pat-1', name: 'Aarav Sharma' } }),
      })
    })

    await page.route('**/api/dashboard/**', async (route) => {
      const url = route.request().url()
      if (url.includes('weekly') || url.includes('revenue') || url.includes('specialties')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { totalPatients: 10, totalDentists: 1, todaysAppointments: 2 },
          }),
        })
      }
    })

    await page.route(/.*\/api\/treatments.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      })
    })

    await page.route(/.*\/api\/coupons.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      })
    })

    await page.route(/.*\/api\/staff.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      })
    })
  })

  test('Public /doctor page renders doctor profile and redirects legacy /dentists URLs', async ({ page }) => {
    await page.goto('/doctor')
    await expect(page.getByRole('heading', { name: 'Dr. Siddhesh Patil' })).toBeVisible()
    await expect(page.locator('text=Prosthodontics & Implantology')).toBeVisible()
    await expect(page.locator('text=12 years experience')).toBeVisible()
    await expect(page.locator('a:has-text("Book appointment")')).toBeVisible()

    await page.goto('/dentists')
    await expect(page).toHaveURL(/\/doctor/)

    await page.goto('/dentists/some-old-id')
    await expect(page).toHaveURL(/\/doctor/)
  })

  test('Single-dentist booking page /app/book preselects the doctor without dropdown', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('aarav@example.com')
    await page.locator('input[type="password"]').fill('Password123!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL('**/app**')

    // Navigate to /app/book
    await page.locator('a[href="/app/book"]').first().click()
    await page.waitForURL('**/app/book**')

    // Doctor heading and badge are visible
    await expect(page.getByRole('heading', { name: 'Dr. Siddhesh Patil' })).toBeVisible()

    // No doctor selector dropdown exists
    const dentistSelect = page.locator('select[name="dentistId"]')
    await expect(dentistSelect).toHaveCount(0)

    // Slot picker displays available slots
    await expect(page.locator('button:has-text("21:00")')).toBeVisible()
  })

  test('Reception appointments page supports walk-in patient registration and staff booking', async ({ page }) => {
    let walkInCreated = false
    let staffBookingCreated = false

    await page.route(/.*\/api\/appointments(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], meta: { total: 0 } }),
      })
    })

    await page.route(/.*\/api\/patients(\?.*)?$/, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON()
        expect(body.name).toBe('Ramesh Walkin')
        expect(body.phone).toBe('9988776655')
        walkInCreated = true
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Walk-in patient registered successfully.',
            data: { _id: 'walkin-1', name: 'Ramesh Walkin', phone: '9988776655' },
          }),
        })
      } else {
        // GET /patients?search=...
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [{ _id: 'walkin-1', name: 'Ramesh Walkin', phone: '9988776655' }],
          }),
        })
      }
    })

    await page.route('**/api/appointments/staff', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON()
        expect(body.patientId).toBe('walkin-1')
        expect(body.dentistId).toBe(mockDentist._id)
        staffBookingCreated = true
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Appointment created and confirmed by staff.',
            data: { _id: 'appt-staff-99' },
          }),
        })
      }
    })

    // Log in as receptionist
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('reception@drnutrident.com')
    await page.locator('input[type="password"]').fill('Password123!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL('**/reception**')

    // Navigate to appointments
    await page.locator('a[href="/reception/appointments"]').first().click()
    await page.waitForURL('**/reception/appointments**')

    // Click "Register walk-in" button
    await page.click('button:has-text("Register walk-in")')
    await expect(page.locator('h2:has-text("Register Walk-in Patient")')).toBeVisible()

    // Fill the walk-in form
    await page.fill('input[placeholder*="Ramesh Kumar"]', 'Ramesh Walkin')
    await page.fill('input[type="tel"]', '9988776655')
    await page.click('button:has-text("Register Patient")')

    // Verify walkInCreated was triggered and booking modal automatically opened with patient preselected
    await expect.poll(() => walkInCreated).toBe(true)
    await expect(page.locator('h2:has-text("Book Staff Appointment")')).toBeVisible()
    await expect(page.locator('strong:has-text("Ramesh Walkin")')).toBeVisible()

    // Select time slot
    await page.click('button.slot-button:has-text("21:00")')

    // Submit appointment
    await page.click('button:has-text("Confirm Appointment")')

    await expect.poll(() => staffBookingCreated).toBe(true)
  })

  test('Admin dentist page displays single doctor profile and suppresses add-dentist when doctor exists', async ({ page }) => {
    // Log in as admin
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('admin@drnutrident.com')
    await page.locator('input[type="password"]').fill('Password123!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL('**/admin**')

    // Navigate to doctor management
    await page.locator('a[href="/admin/dentists"]').first().click()
    await page.waitForURL('**/admin/dentists**')

    // Doctor profile heading and info
    await expect(page.locator('text=Dr. Siddhesh Patil')).toBeVisible()
    await expect(page.locator('text=Accepting visits')).toBeVisible()
    await expect(page.locator('button:has-text("Pause appointments")')).toBeVisible()

    // "Add dentist" form/button must NOT be visible since doctor is already on file
    await expect(page.locator('button:has-text("Provision Doctor Account")')).toHaveCount(0)
    await expect(page.locator('button:has-text("Add dentist")')).toHaveCount(0)
  })
})
