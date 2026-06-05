import { describe, expect, it } from 'vitest'
import { peakState } from '../evaluate-helpers'

const TZ = 'America/Los_Angeles'
const WIN = [1, 2, 3, 4, 5]
const START = 5
const END = 11

// All epochs verified on the dev box:
//   TZ=America/Los_Angeles date -d @<epoch> '+%u %a %Y-%m-%d %H:%M:%S %Z'

describe('peakState', () => {
  it('inside window (Thu 09:20 PT) → inPeak, target = same-day 11:00 PT', () => {
    const now = 1769707200 // Thu 2026-01-29 09:20:00 PST
    const target = 1769713200 // Thu 2026-01-29 11:00:00 PST
    const r = peakState(now, TZ, WIN, START, END)
    expect(r.inPeak).toBe(true)
    expect(r.target).toBe(target)
  })

  it('weekday before 5am (Thu 03:00 PT) → off-peak, target = today 05:00 PT', () => {
    const now = 1769684400 // Thu 2026-01-29 03:00:00 PST
    const target = 1769691600 // Thu 2026-01-29 05:00:00 PST
    const r = peakState(now, TZ, WIN, START, END)
    expect(r.inPeak).toBe(false)
    expect(r.target).toBe(target)
  })

  it('Friday during peak (Fri 09:00 PT) → inPeak, countdown to Fri 11:00 PT', () => {
    const now = 1769792400 // Fri 2026-01-30 09:00:00 PST
    const target = 1769799600 // Fri 2026-01-30 11:00:00 PST
    const r = peakState(now, TZ, WIN, START, END)
    expect(r.inPeak).toBe(true)
    expect(r.target).toBe(target)
  })

  it('Saturday afternoon → off-peak, target = next Monday 05:00 PT', () => {
    const now = 1769896800 // Sat 2026-01-31 14:00:00 PST
    const target = 1770037200 // Mon 2026-02-02 05:00:00 PST
    const r = peakState(now, TZ, WIN, START, END)
    expect(r.inPeak).toBe(false)
    expect(r.target).toBe(target)
  })

  it('Friday after window (Fri 14:00 PT) → off-peak, target = next Monday 05:00 PT', () => {
    const now = 1769810400 // Fri 2026-01-30 14:00:00 PST
    const target = 1770037200 // Mon 2026-02-02 05:00:00 PST
    const r = peakState(now, TZ, WIN, START, END)
    expect(r.inPeak).toBe(false)
    expect(r.target).toBe(target)
  })

  it('exactly at window start is in peak; exactly at end is not', () => {
    const start = 1769691600 // Thu 05:00
    const end = 1769713200 // Thu 11:00
    expect(peakState(start, TZ, WIN, START, END).inPeak).toBe(true)
    const atEnd = peakState(end, TZ, WIN, START, END)
    expect(atEnd.inPeak).toBe(false)
    // at end, next window start is Fri 05:00
    expect(atEnd.target).toBe(1769778000) // Fri 2026-01-30 05:00:00 PST
  })
})
