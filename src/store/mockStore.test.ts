// Pure-logic tests for the mock-store time helpers (node env, no DOM).

import { describe, it, expect } from 'vitest'
import { composeNow, decomposeNow } from './mockStore'

describe('clock helpers', () => {
  it('round-trips dow/hour/minute through compose → decompose', () => {
    for (const dow of [1, 3, 5, 7]) {
      for (const hour of [0, 9, 14, 23]) {
        const now = composeNow(dow, hour, 30)
        const parts = decomposeNow(now)
        expect(parts.dow).toBe(dow)
        expect(parts.hour).toBe(hour)
        expect(parts.minute).toBe(30)
      }
    }
  })

  it('produces an epoch in seconds (10-digit range)', () => {
    const now = composeNow(4, 9, 20)
    expect(now).toBeGreaterThan(1_700_000_000)
    expect(now).toBeLessThan(1_800_000_000)
  })
})
