import { describe, it, expect } from 'vitest'
import { needsRefreshInterval } from './refreshInterval'
import { defaultConfig } from '../../model/presets/defaultPreset'
import type { StatuslineConfig, MetricSegment, Row } from '../../model/types'

function rowsOnly(rows: Row[]): StatuslineConfig {
  return { ...defaultConfig(), rows }
}

describe('needsRefreshInterval', () => {
  it('is true for the default preset (peak + session timer present)', () => {
    expect(needsRefreshInterval(defaultConfig())).toBe(true)
  })

  it('is true when a peak segment is present', () => {
    const cfg = defaultConfig()
    // strip everything but keep peak on row3
    expect(needsRefreshInterval(cfg)).toBe(true)
  })

  it('is true when any metric segment renders a timer part', () => {
    const seg: MetricSegment = {
      id: 's',
      type: 'session',
      enabled: true,
      parts: ['bar', 'percent', 'timer'],
      barWidth: 5,
      barChars: { filled: '█', empty: '░' },
    }
    expect(needsRefreshInterval(rowsOnly([{ id: 'r', segments: [seg], joiner: '  ' }]))).toBe(true)
  })

  it('is false for a static layout (no peak, no timer parts)', () => {
    const ctx: MetricSegment = {
      id: 'c',
      type: 'context',
      enabled: true,
      parts: ['percent'],
      barWidth: 5,
      barChars: { filled: '█', empty: '░' },
    }
    const cfg = rowsOnly([{ id: 'r', segments: [ctx], joiner: '  ' }])
    expect(needsRefreshInterval(cfg)).toBe(false)
  })

  it('ignores disabled timer-bearing segments', () => {
    const seg: MetricSegment = {
      id: 's',
      type: 'session',
      enabled: false,
      parts: ['timer'],
      barWidth: 5,
      barChars: { filled: '█', empty: '░' },
    }
    expect(needsRefreshInterval(rowsOnly([{ id: 'r', segments: [seg], joiner: '  ' }]))).toBe(false)
  })
})
