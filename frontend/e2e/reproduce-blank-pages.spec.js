import { test, expect } from '@playwright/test'

test('reproduce blank screen on the 4 admin pages with real API response shapes', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => {
    errors.push({ page: page.url(), message: err.message, stack: err.stack })
    console.log('[PAGE ERROR at ' + page.url() + ']:', err.message)
  })

  // Auth mocking
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          user: {
            _id: '6ad9051aa066c1d146077555',
            name: 'Admin Owner',
            email: 'admin@drnutrident.com',
            role: 'admin',
            isActive: true,
            isEmailVerified: true,
          },
          accessToken: 'mock-token',
          refreshToken: 'mock-refresh',
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
        data: {
          user: {
            _id: '6ad9051aa066c1d146077555',
            name: 'Admin Owner',
            email: 'admin@drnutrident.com',
            role: 'admin',
            isActive: true,
            isEmailVerified: true,
          },
        },
      }),
    })
  })

  await page.route('**/api/dashboard/admin**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })

  // Real shape of GET /api/treatments
  await page.route('**/api/treatments', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          {
            _id: '6ae2026aef5e7207de9778a7',
            name: 'Comprehensive Dental Consultation',
            category: 'General',
            description: 'Complete oral cavity examination',
            defaultCost: 500,
            estimatedDurationMinutes: 30,
            isActive: true,
          },
        ],
      }),
    })
  })

  // Real shape of GET /api/dentists/admin/all
  await page.route('**/api/dentists/admin/all**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          {
            _id: '6ad9051ba066c1d14607791e',
            user: {
              _id: '6ad9051aa066c1d14607791d',
              name: 'Dr. Siddhesh Patil',
              email: 'siddheshvpatil02@gmail.com',
              phone: '+919876543211',
              profilePhoto: { url: '', publicId: '' },
            },
            specialization: 'Chief Dental Surgeon',
            qualifications: ['BDS', 'MDS'],
            experienceYears: 10,
            consultationFee: 500,
            isVerified: false, // unverified triggers <Check size={14} />
            isActive: true,
            slotDurationMinutes: 30,
            clinicAddress: {
              addressLine: 'Shop 4, Sunrise Plaza',
              city: 'Pune',
              state: 'Maharashtra',
              pincode: '411001',
            },
            weeklyAvailability: [],
          },
        ],
      }),
    })
  })

  // Real shape of GET /api/clinics
  await page.route('**/api/clinics', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          {
            _id: '6adb9e363da4243f772b6e82',
            name: 'DrNutrident Dental - Baner',
            address: { addressLine: '101 Baner Road', city: 'Pune', state: 'Maharashtra' },
            contactPhone: '+91 98221 00000',
            contactEmail: 'contact@drnutrident.com',
            isActive: true,
          },
        ],
      }),
    })
  })

  // Real shape of GET /api/clinic-settings
  await page.route('**/api/clinic-settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          _id: 'default',
          clinicName: 'Dr. Nutrident Clinic',
          platformFee: 20,
          currency: 'INR',
        },
      }),
    })
  })

  await page.route('**/api/admin/system-status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'healthy' } }) })
  })

  // Log in as admin
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('admin@drnutrident.com')
  await page.locator('input[type="password"]').fill('Admin@12345')
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/admin**')

  console.log('--- Navigating to /admin/treatments ---')
  await page.goto('/admin/treatments')
  await page.waitForTimeout(1000)

  console.log('--- Navigating to /admin/dentists ---')
  await page.goto('/admin/dentists')
  await page.waitForTimeout(1000)

  console.log('--- Navigating to /admin/clinics ---')
  await page.goto('/admin/clinics')
  await page.waitForTimeout(1000)

  console.log('--- Navigating to /admin/settings ---')
  await page.goto('/admin/settings')
  await page.waitForTimeout(1000)

  console.log('TOTAL PAGE CRASHES CAPTURED:', errors.length)
  for (const err of errors) {
    console.log('Crash URL:', err.page)
    console.log('Error:', err.message)
    console.log('Stack:', err.stack)
  }
})
