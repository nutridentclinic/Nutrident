# Local Setup & Testing Guide

## Prerequisites

- **Node.js**: v22.12 or newer
- **npm**: v10+
- **Database**: Local or containerized MongoDB (for backend integration only; test suites run self-contained with `mongodb-memory-server`)

---

## 1. Installation

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd frontend
npm install
```

---

## 2. Automated Test Execution

### Backend Automated Test Suite (Jest + Supertest)
The backend test suite uses `mongodb-memory-server` and mock providers. It runs completely offline without connecting to external services or altering live databases:
```bash
cd backend
npm test
```
- Runs 7 test suites (31 tests) covering single-dentist enforcement, token versioning, session logout revocation, constant-time OTP lockout, FDI 32 adult teeth validation, file download ownership, clinic timezone availability, and queue authorization.

### Frontend Unit & Domain Test Suite (Vitest)
The frontend tests use Vitest, Testing Library, and MSW:
```bash
cd frontend
npm test -- --run
```
- Runs 5 test files (24 tests) covering API client capabilities fallback, domain mapping, error boundary handling, booking slot algorithms, and protected route access.

### Frontend End-to-End Test Suite (Playwright)
Playwright launches automated Chromium and WebKit (Safari) browser instances against Vite dev server:
```bash
cd frontend
npx playwright test
```
To run specifically on Chromium or WebKit:
```bash
npx playwright test --project=chromium
npx playwright test --project=webkit
```
- Verifies logout revocation, Back/Forward cache immunity, single-doctor public profile and URL redirects, direct appointment booking without doctor dropdown, walk-in patient registration, and admin clinician account management.

---

## 3. Production Build Validation

To verify production bundle compilation:
```bash
cd frontend
npm run build
```
Builds the optimized production bundle in `frontend/dist/` in under 2 seconds with zero errors.