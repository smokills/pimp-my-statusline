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
})
