import { describe, expect, it } from 'vitest'
import { isPastSlot } from './booking.js'
import { FDI_TEETH } from './teeth.js'

describe('appointment slot timing', () => {
  const now = new Date('2026-10-22T04:30:00.000Z')

  it('filters slots already elapsed in the clinic timezone', () => {
    expect(isPastSlot('2026-10-22', '09:59', now, 'Asia/Kolkata')).toBe(true)
    expect(isPastSlot('2026-10-22', '10:00', now, 'Asia/Kolkata')).toBe(true)
    expect(isPastSlot('2026-10-22', '10:01', now, 'Asia/Kolkata')).toBe(false)
    expect(isPastSlot('2026-10-21', '23:59', now, 'Asia/Kolkata')).toBe(true)
    expect(isPastSlot('2026-10-23', '00:01', now, 'Asia/Kolkata')).toBe(false)
  })
})

describe('FDI dental chart', () => {
  it('contains all 32 valid permanent teeth exactly once', () => {
    expect(FDI_TEETH).toHaveLength(32)
    expect(new Set(FDI_TEETH).size).toBe(32)
    expect(FDI_TEETH.every((tooth) => /^[1-4][1-8]$/.test(String(tooth)))).toBe(true)
  })
})