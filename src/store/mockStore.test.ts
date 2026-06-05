// Pure-logic tests for the mock store (node env, no DOM): the resets-in
// scrubbers exposed in the Preview tab, and the guards around absent objects.

import { describe, it, expect, beforeEach } from 'vitest'
import { useMockStore } from './mockStore'

beforeEach(() => {
  useMockStore.getState().reset()
})

describe('reset countdown scrubbers', () => {
  it('setSessionResetMinutes pins five_hour.resets_at to now + minutes', () => {
    const s = useMockStore.getState()
    s.setSessionResetMinutes(90)
    const m = useMockStore.getState().mock
    expect(m.rate_limits?.five_hour?.resets_at).toBe(m._now + 90 * 60)
  })

  it('setWeekResetMinutes pins seven_day.resets_at to now + minutes', () => {
    const s = useMockStore.getState()
    s.setWeekResetMinutes(60 * 48) // 2 days
    const m = useMockStore.getState().mock
    expect(m.rate_limits?.seven_day?.resets_at).toBe(m._now + 48 * 3600)
  })

  it('is a no-op when rate_limits is absent', () => {
    const s = useMockStore.getState()
    s.toggleRateLimits(false)
    const before = useMockStore.getState().mock
    useMockStore.getState().setSessionResetMinutes(90)
    expect(useMockStore.getState().mock).toBe(before)
  })

  it('does not disturb the used percentage', () => {
    const s = useMockStore.getState()
    s.setSessionPct(77)
    s.setSessionResetMinutes(5)
    const m = useMockStore.getState().mock
    expect(m.rate_limits?.five_hour?.used_percentage).toBe(77)
    expect(m.rate_limits?.five_hour?.resets_at).toBe(m._now + 300)
  })
})

describe('columns clamp', () => {
  it('clamps to [20, 200]', () => {
    const s = useMockStore.getState()
    s.setColumns(5)
    expect(useMockStore.getState().mock._columns).toBe(20)
    s.setColumns(999)
    expect(useMockStore.getState().mock._columns).toBe(200)
  })
})
