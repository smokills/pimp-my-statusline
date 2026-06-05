import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../presets/defaultPreset'
import type { MetricSegment, SeparatorSegment } from '../types'

describe('defaultConfig shape', () => {
  const cfg = defaultConfig()

  it('has 3 rows', () => {
    expect(cfg.rows).toHaveLength(3)
  })

  it('row 1 is directory + gitBranch with two-space joiner', () => {
    expect(cfg.rows[0].joiner).toBe('  ')
    expect(cfg.rows[0].segments.map((s) => s.type)).toEqual([
      'directory',
      'gitBranch',
    ])
  })

  it('row 2 separator is fixed width 74', () => {
    const sep = cfg.rows[1].segments[0] as SeparatorSegment
    expect(sep.type).toBe('separator')
    expect(sep.width).toBe(74)
    expect(sep.fill).toBe('─')
  })

  it('row 3 ordered model effort context session week', () => {
    expect(cfg.rows[2].segments.map((s) => s.type)).toEqual([
      'model',
      'effort',
      'context',
      'session',
      'week',
    ])
  })

  it('context has no bar (percent only)', () => {
    const ctx = cfg.rows[2].segments.find((s) => s.type === 'context') as MetricSegment
    expect(ctx.parts).toEqual(['percent'])
  })

  it('session has bar+percent+timer', () => {
    const s = cfg.rows[2].segments.find((s) => s.type === 'session') as MetricSegment
    expect(s.parts).toEqual(['bar', 'percent', 'timer'])
  })

  it('week has no timer', () => {
    const w = cfg.rows[2].segments.find((s) => s.type === 'week') as MetricSegment
    expect(w.parts).toEqual(['bar', 'percent'])
  })

  it('effort and context carry joinBefore single-space', () => {
    const effort = cfg.rows[2].segments.find((s) => s.type === 'effort')
    const context = cfg.rows[2].segments.find((s) => s.type === 'context')
    expect(effort?.joinBefore).toBe(' ')
    expect(context?.joinBefore).toBe(' ')
  })

  it('uses ansi16 colors for byte-faithfulness', () => {
    const dir = cfg.rows[0].segments[0]
    expect(dir.type === 'directory' && dir.style?.color).toEqual({
      kind: 'ansi16',
      code: 34,
    })
  })

  it('pet disabled and emoji off', () => {
    expect(cfg.pet.enabled).toBe(false)
    expect(cfg.global.emoji).toBe(false)
  })
})
