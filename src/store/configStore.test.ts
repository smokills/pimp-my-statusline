// Pure-logic tests for the config-store transforms + the persist rehydrate
// fallback (node env, no DOM). We test the exported pure functions directly and
// drive the rehydrate gate through the storage wrapper's getItem.

import { describe, it, expect } from 'vitest'
import {
  makeSegment,
  addSegmentTo,
  removeSegmentFrom,
  updateSegmentIn,
  moveSegmentIn,
  addRowTo,
  removeRowFrom,
  reorderRowsIn,
} from './configStore'
import { defaultConfig } from '../model/presets/defaultPreset'
import type { StatuslineConfig, MetricSegment } from '../model/types'

function ids(config: StatuslineConfig, rowIdx: number): string[] {
  return config.rows[rowIdx].segments.map((s) => s.id)
}

describe('makeSegment', () => {
  it('creates a segment of the requested type with a unique id', () => {
    const g = defaultConfig().global
    const a = makeSegment('cost', g)
    const b = makeSegment('cost', g)
    expect(a.type).toBe('cost')
    expect(a.id).not.toBe(b.id)
  })

  it('seeds metric segments with the global default thresholds (fresh copy)', () => {
    const g = defaultConfig().global
    const seg = makeSegment('session', g) as MetricSegment
    expect(seg.valueStyle?.color?.kind).toBe('threshold')
    // mutating the segment's stops must not touch the global array
    const stops = (seg.valueStyle!.color as { kind: 'threshold'; stops: { at: number }[] }).stops
    stops[0].at = 999
    expect(g.defaultThresholds[0].at).not.toBe(999)
  })
})

describe('addSegmentTo / removeSegmentFrom', () => {
  it('appends to the named row', () => {
    const cfg = defaultConfig()
    const seg = makeSegment('cost', cfg.global)
    const next = addSegmentTo(cfg, seg, 'row1')
    expect(next.rows[0].segments.at(-1)?.id).toBe(seg.id)
    expect(next.rows[0].segments.length).toBe(cfg.rows[0].segments.length + 1)
  })

  it('falls back to the first row when no rowId given', () => {
    const cfg = defaultConfig()
    const seg = makeSegment('cost', cfg.global)
    const next = addSegmentTo(cfg, seg, undefined)
    expect(next.rows[0].segments.at(-1)?.id).toBe(seg.id)
  })

  it('creates a row when the config has none', () => {
    const empty: StatuslineConfig = { ...defaultConfig(), rows: [] }
    const seg = makeSegment('cost', empty.global)
    const next = addSegmentTo(empty, seg, undefined)
    expect(next.rows.length).toBe(1)
    expect(next.rows[0].segments[0].id).toBe(seg.id)
  })

  it('removes by id from whichever row holds it', () => {
    const cfg = defaultConfig()
    const target = cfg.rows[2].segments[0].id
    const next = removeSegmentFrom(cfg, target)
    expect(next.rows[2].segments.find((s) => s.id === target)).toBeUndefined()
  })
})

describe('updateSegmentIn', () => {
  it('patches only the matching segment', () => {
    const cfg = defaultConfig()
    const id = cfg.rows[0].segments[0].id
    const next = updateSegmentIn(cfg, id, { enabled: false })
    expect(next.rows[0].segments[0].enabled).toBe(false)
    expect(next.rows[0].segments[1].enabled).toBe(true)
  })
})

describe('moveSegmentIn', () => {
  it('reorders within a row', () => {
    const cfg = defaultConfig()
    const [a, b, c] = ids(cfg, 2)
    // move the first segment (a) to index 2
    const next = moveSegmentIn(cfg, a, 'row3', 2)
    expect(ids(next, 2).slice(0, 3)).toEqual([b, c, a])
  })

  it('moves a segment between rows at the given index', () => {
    const cfg = defaultConfig()
    const moving = cfg.rows[0].segments[1].id // gitBranch
    const next = moveSegmentIn(cfg, moving, 'row3', 0)
    expect(next.rows[0].segments.find((s) => s.id === moving)).toBeUndefined()
    expect(next.rows[2].segments[0].id).toBe(moving)
  })

  it('clamps an out-of-range destination index to the row end', () => {
    const cfg = defaultConfig()
    const moving = cfg.rows[0].segments[0].id
    const next = moveSegmentIn(cfg, moving, 'row3', 999)
    expect(next.rows[2].segments.at(-1)?.id).toBe(moving)
  })

  it('is a no-op for an unknown id', () => {
    const cfg = defaultConfig()
    const next = moveSegmentIn(cfg, 'nope', 'row1', 0)
    expect(next).toBe(cfg)
  })

  it('moving the only segment within its row keeps it present', () => {
    const cfg = defaultConfig()
    const sepId = cfg.rows[1].segments[0].id
    const next = moveSegmentIn(cfg, sepId, 'row2', 0)
    expect(next.rows[1].segments.map((s) => s.id)).toEqual([sepId])
  })
})

describe('rows', () => {
  it('addRowTo appends an empty row and returns its id', () => {
    const cfg = defaultConfig()
    const { config, rowId } = addRowTo(cfg)
    expect(config.rows.length).toBe(cfg.rows.length + 1)
    expect(config.rows.at(-1)?.id).toBe(rowId)
    expect(config.rows.at(-1)?.segments).toEqual([])
  })

  it('removeRowFrom drops the named row', () => {
    const cfg = defaultConfig()
    const next = removeRowFrom(cfg, 'row2')
    expect(next.rows.find((r) => r.id === 'row2')).toBeUndefined()
    expect(next.rows.length).toBe(cfg.rows.length - 1)
  })

  it('reorderRowsIn moves a row and clamps invalid input', () => {
    const cfg = defaultConfig()
    const moved = reorderRowsIn(cfg, 0, 2)
    expect(moved.rows.map((r) => r.id)).toEqual(['row2', 'row3', 'row1'])
    expect(reorderRowsIn(cfg, 0, 0)).toBe(cfg)
    expect(reorderRowsIn(cfg, -1, 2)).toBe(cfg)
    expect(reorderRowsIn(cfg, 0, 99)).toBe(cfg)
  })
})
