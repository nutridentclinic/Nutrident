import { test, expect } from '@playwright/test'

const mockPatient = {
  _id: '6ad9051aa066c1d146077999',
  name: 'Test Patient',
  email: 'patient@example.com',
  phone: '9999999999',
  role: 'patient',
  active: true,
}

const mockProfile = {
  _id: '6ad9051ba066c1d146077888',
  user: '6ad9051aa066c1d146077999',
}

test.describe('A1: Logout and Back/Forward session invalidation suite', () => {
  let logoutCalled = false

  test.beforeEach(async ({ page }) => {
    logoutCalled = false
    // Intercept API routes with mock data to make tests deterministic and independent of live credentials
    await page.route('**/api/clinic-settings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Settings',
          data: { clinicName: 'Nutrident Dental Clinic', platformFee: 20, cancellationFullRefundHours: 24 },
        }),
      })
    })

    await page.route('**/api/dentists**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Dentists',
          data: [{ _id: 'd1', user: { name: 'Dr. Siddhesh Patil' }, consultationFee: 200, isActive: true }],
          meta: { total: 1 },
        }),
      })
    })

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Logged in',
          data: {
            user: mockPatient,
            accessToken: 'mock-access-token-12345',
            refreshToken: 'mock-refresh-token-67890',
          },
        }),
      })
    })

    await page.route('**/api/auth/me', async (route) => {
      const authHeader = route.request().headers()['authorization']
      if (!authHeader || !authHeader.includes('Bearer mock-access-token-12345')) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Invalid or expired token.' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Profile',
          data: { user: mockPatient, profile: mockProfile },
        }),
      })
    })

    await page.route('**/api/auth/logout', async (route) => {
      logoutCalled = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Logged out successfully' }),
      })
    })

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
  })

  test('sign out prevents re-entry via back/forward, reload, or new tab', async ({ page, context }) => {
    // 1. Visit login page and log in
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('patient@example.com')
    await page.locator('input[type="password"]').fill('Password123!')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Expect to land in portal
    await page.waitForURL('**/app**')
    await expect(page.locator('.portal-shell')).toBeVisible()

    // 2. Open three portal pages
    // Page 1: /app (Overview)
    await expect(page.locator('.portal-content')).toBeVisible()

    // Page 2: /app/appointments
    await page.locator('a[href="/app/appointments"]').first().click()
    await page.waitForURL('**/app/appointments**')
    await expect(page.locator('.portal-shell')).toBeVisible()

    // Page 3: /app/prescriptions
    await page.locator('a[href="/app/prescriptions"]').first().click()
    await page.waitForURL('**/app/prescriptions**')
    await expect(page.locator('.portal-shell')).toBeVisible()

    // 3. Click Sign out
    const signOutBtn = page.locator('button.logout-link, button:has-text("Sign out")')
    await signOutBtn.click()
    await page.waitForURL('**/login**')
    await page.locator('input[type="email"]').waitFor()

    // Helper to check logged-out guarantees after any navigation
    const assertLoggedOutState = async (stepDescription) => {
      const currentUrl = page.url()
      const portalShellCount = await page.locator('.portal-shell').count()
      const authStorage = await page.evaluate(() => {
        try {
          const raw = localStorage.getItem('drn-auth')
          return raw ? JSON.parse(raw) : null
        } catch {
          return null
        }
      })
      console.log(`[TEST STEP: ${stepDescription}] url=${currentUrl}, portalShellCount=${portalShellCount}, authStorage=`, JSON.stringify(authStorage))

      // If page went back before initial page (about:blank), skip url check or assert
      if (currentUrl === 'about:blank') return

      const isPublicOrLogin = currentUrl.includes('/login') || currentUrl.endsWith('/') || currentUrl.includes('/services')
      expect(isPublicOrLogin, `${stepDescription}: URL should be /login or public, but was ${currentUrl}`).toBe(true)

      // Assert no element of .portal-shell is in the DOM
      expect(portalShellCount, `${stepDescription}: .portal-shell should not exist in DOM`).toBe(0)

      // Assert localStorage['drn-auth'] holds no user/profile/tokens
      if (authStorage) {
        const state = authStorage.state || authStorage
        expect(state.user, `${stepDescription}: localStorage user should be null or omitted`).toBeFalsy()
        expect(state.profile, `${stepDescription}: localStorage profile should be null or omitted`).toBeFalsy()
        expect(state.accessToken, `${stepDescription}: localStorage accessToken should be null or omitted`).toBeFalsy()
        expect(state.refreshToken, `${stepDescription}: localStorage refreshToken should be null or omitted`).toBeFalsy()
      }

      // Assert React Query cache is empty
      const queryCacheSize = await page.evaluate(() => {
        const qc = window.__QUERY_CLIENT__
        return qc ? qc.getQueryCache().getAll().length : 0
      })
      expect(queryCacheSize, `${stepDescription}: queryCache should be empty (0 queries)`).toBe(0)
    }

    // Check immediately after logout
    // Assert A3 requirements: server logout called, redirected to /login, and drn-auth removed from localStorage
    expect(logoutCalled, 'POST /api/auth/logout should be called on sign out').toBe(true)
    expect(page.url(), 'URL after sign out should be /login').toContain('/login')
    const rawAuth = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('drn-auth')
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    })
    if (rawAuth) {
      const state = rawAuth.state || rawAuth
      expect(state.user, 'localStorage holds no user').toBeFalsy()
      expect(state.profile, 'localStorage holds no profile').toBeFalsy()
      expect(state.accessToken, 'localStorage holds no access token').toBeFalsy()
      expect(state.refreshToken, 'localStorage holds no refresh token').toBeFalsy()
    }

    await assertLoggedOutState('Immediately after logout')

    // 4. page.goBack() x 3
    for (let i = 1; i <= 3; i++) {
      await page.goBack()
      await page.waitForTimeout(300)
      await assertLoggedOutState(`After goBack() #${i}`)
    }

    // 5. page.goForward() x 3
    for (let i = 1; i <= 3; i++) {
      await page.goForward()
      await page.waitForTimeout(300)
      await assertLoggedOutState(`After goForward() #${i}`)
    }

    // 6. Reload page
    await page.reload()
    await page.waitForTimeout(300)
    await assertLoggedOutState('After page.reload()')

    // 7. Open /app in a new tab
    const newPage = await context.newPage()
    await newPage.goto('/app')
    await newPage.waitForTimeout(500)
    expect(newPage.url()).toContain('/login')
    expect(await newPage.locator('.portal-shell').count()).toBe(0)
    await newPage.close()
  })
})
