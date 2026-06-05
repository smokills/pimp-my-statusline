import { describe, expect, it } from 'vitest'
import { parseConfig, statuslineConfigSchema } from '../schema'
import { defaultConfig } from '../presets/defaultPreset'

describe('schema round-trip', () => {
  it('defaultConfig parses and is deep-equal after JSON round-trip', () => {
    const cfg = defaultConfig()
    const json = JSON.parse(JSON.stringify(cfg))
    const parsed = parseConfig(json)
    expect(parsed).toEqual(cfg)
  })

  it('validates the in-memory defaultConfig directly', () => {
    expect(statuslineConfigSchema.safeParse(defaultConfig()).success).toBe(true)
  })

  it('rejects garbage', () => {
    expect(parseConfig(null)).toBeNull()
    expect(parseConfig({})).toBeNull()
    expect(parseConfig({ version: 2, rows: [] })).toBeNull()
    expect(parseConfig('not an object')).toBeNull()
  })

  it('rejects an unknown segment type', () => {
    const bad = defaultConfig() as unknown as { rows: { segments: unknown[] }[] }
    bad.rows[0].segments[0] = { id: 'x', type: 'bogus', enabled: true }
    expect(parseConfig(bad)).toBeNull()
  })

  it('accepts all three ColorSpec kinds', () => {
    const cfg = defaultConfig()
    // fixed
    const c1 = JSON.parse(JSON.stringify(cfg))
    c1.rows[0].segments[0].style.color = { kind: 'fixed', code: 200 }
    expect(parseConfig(c1)).not.toBeNull()
    // threshold (already present on metric value styles)
    expect(parseConfig(JSON.parse(JSON.stringify(cfg)))).not.toBeNull()
  })

  // ---- tightened bounds ----

  it('rejects a fixed color code out of 0..255', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig()))
    cfg.rows[0].segments[0].style.color = { kind: 'fixed', code: 256 }
    expect(parseConfig(cfg)).toBeNull()
  })

  it('rejects an ansi16 code outside 30-37|90-97', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig()))
    cfg.rows[0].segments[0].style.color = { kind: 'ansi16', code: 38 }
    expect(parseConfig(cfg)).toBeNull()
  })

  it('accepts valid ansi16 codes in both ranges', () => {
    for (const code of [30, 37, 90, 97]) {
      const cfg = JSON.parse(JSON.stringify(defaultConfig()))
      cfg.rows[0].segments[0].style.color = { kind: 'ansi16', code }
      expect(parseConfig(cfg)).not.toBeNull()
    }
  })

  it('rejects a threshold `at` outside 0..100', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig()))
    cfg.global.defaultThresholds = [{ at: 101, code: 31, ansi16: true }]
    expect(parseConfig(cfg)).toBeNull()
  })

  it('rejects barWidth out of range / non-integer', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig()))
    const ctx = cfg.rows[2].segments.find((s: { type: string }) => s.type === 'context')
    ctx.barWidth = 0
    expect(parseConfig(cfg)).toBeNull()
    ctx.barWidth = 2.5
    expect(parseConfig(cfg)).toBeNull()
    ctx.barWidth = 41
    expect(parseConfig(cfg)).toBeNull()
  })

  it('rejects a non-integer/zero separator width', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig()))
    cfg.rows[1].segments[0].width = 0
    expect(parseConfig(cfg)).toBeNull()
    cfg.rows[1].segments[0].width = 73.5
    expect(parseConfig(cfg)).toBeNull()
    cfg.rows[1].segments[0].width = 'full'
    expect(parseConfig(cfg)).not.toBeNull()
  })

  it('rejects pet gap out of 0..3', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig()))
    cfg.pet.gap = 4
    expect(parseConfig(cfg)).toBeNull()
    cfg.pet.gap = -1
    expect(parseConfig(cfg)).toBeNull()
  })

  it('default preset (width 74, gap 1, ansi16 codes) still round-trips after tightening', () => {
    const cfg = defaultConfig()
    expect(parseConfig(JSON.parse(JSON.stringify(cfg)))).toEqual(cfg)
  })
})
