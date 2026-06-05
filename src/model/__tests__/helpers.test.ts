import { describe, expect, it } from 'vitest'
import {
  barFill,
  barString,
  fmtCost,
  fmtDuration,
  resolveThreshold,
  timeUntil,
  truncPct,
} from '../evaluate-helpers'
import type { ThresholdStop } from '../types'

describe('truncPct', () => {
  it('truncates floats', () => {
    expect(truncPct(23.9)).toBe(23)
    expect(truncPct(0.9)).toBe(0)
  })
  it('null/undefined → 0', () => {
    expect(truncPct(null)).toBe(0)
    expect(truncPct(undefined)).toBe(0)
    expect(truncPct(NaN)).toBe(0)
  })
  it('clamps to [0,100]', () => {
    expect(truncPct(150)).toBe(100)
    expect(truncPct(-5)).toBe(0)
    expect(truncPct(100)).toBe(100)
    expect(truncPct(0)).toBe(0)
  })
})

describe('barFill', () => {
  it('boundaries', () => {
    expect(barFill(0, 5)).toBe(0)
    expect(barFill(100, 5)).toBe(5)
    expect(barFill(97, 5)).toBe(4) // trunc(97*5/100)=trunc(4.85)=4
  })
  it('clamps above 100', () => {
    expect(barFill(140, 5)).toBe(5) // min(7,5)
  })
  it('equivalent to pct/20 at w=5 for 0..100', () => {
    for (let p = 0; p <= 100; p++) {
      expect(barFill(p, 5)).toBe(Math.trunc(p / 20))
    }
  })
})

describe('barString', () => {
  it('renders filled then empty', () => {
    expect(barString(40, 5, '█', '░')).toBe('██░░░')
    expect(barString(0, 5, '█', '░')).toBe('░░░░░')
    expect(barString(100, 5, '█', '░')).toBe('█████')
  })
})

describe('timeUntil', () => {
  it('exact formats', () => {
    expect(timeUntil(7320, 0)).toBe('2h2m')
    expect(timeUntil(540, 0)).toBe('9m')
  })
  it('empty when <= 0', () => {
    expect(timeUntil(0, 0)).toBe('')
    expect(timeUntil(-100, 0)).toBe('')
  })
  it('drops hours when zero', () => {
    expect(timeUntil(59, 0)).toBe('0m')
    expect(timeUntil(3600, 0)).toBe('1h0m')
  })
})

describe('fmtDuration', () => {
  it('hours/minutes/seconds tiers', () => {
    expect(fmtDuration(7320 * 1000)).toBe('2h2m')
    expect(fmtDuration(540 * 1000)).toBe('9m0s')
    expect(fmtDuration(45 * 1000)).toBe('45s')
    expect(fmtDuration(0)).toBe('0s')
    expect(fmtDuration(23 * 60 * 1000)).toBe('23m0s')
  })
})

describe('fmtCost', () => {
  it('two decimals with $', () => {
    expect(fmtCost(0.42)).toBe('$0.42')
    expect(fmtCost(0)).toBe('$0.00')
    expect(fmtCost(12.875)).toBe('$12.88')
  })
})

describe('resolveThreshold', () => {
  const stops: ThresholdStop[] = [
    { at: 90, code: 31 },
    { at: 70, code: 33 },
    { at: 0, code: 32 },
  ]
  it('picks the right stop', () => {
    expect(resolveThreshold(stops, 89)?.code).toBe(33)
    expect(resolveThreshold(stops, 90)?.code).toBe(31)
    expect(resolveThreshold(stops, 5)?.code).toBe(32)
    expect(resolveThreshold(stops, 70)?.code).toBe(33)
  })
  it('null when no stop matches', () => {
    expect(resolveThreshold([{ at: 50, code: 1 }], 10)).toBeNull()
  })
  it('order-independent (sorts descending)', () => {
    const shuffled: ThresholdStop[] = [
      { at: 0, code: 32 },
      { at: 90, code: 31 },
      { at: 70, code: 33 },
    ]
    expect(resolveThreshold(shuffled, 95)?.code).toBe(31)
  })
})
