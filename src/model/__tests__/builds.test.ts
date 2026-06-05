import { describe, expect, it } from 'vitest'
import { BUILDS } from '../presets/builds'
import { parseConfig } from '../schema'
import { typical } from '../presets/mockPresets'
import { renderToAnsi } from '../../preview/renderToAnsi'
import { generate, LANGUAGES } from '../../generators'

describe('prefab builds', () => {
  it('build ids and names are unique', () => {
    expect(new Set(BUILDS.map((b) => b.id)).size).toBe(BUILDS.length)
    expect(new Set(BUILDS.map((b) => b.name)).size).toBe(BUILDS.length)
  })

  describe.each(BUILDS.map((b) => [b.name, b] as const))('%s', (_name, build) => {
    it('passes the zod schema', () => {
      expect(parseConfig(build.make())).not.toBeNull()
    })

    it('row and segment ids are unique within the config', () => {
      const cfg = build.make()
      const ids = [
        ...cfg.rows.map((r) => r.id),
        ...cfg.rows.flatMap((r) => r.segments.map((s) => s.id)),
      ]
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('renders to ANSI against the typical mock', () => {
      const cfg = build.make()
      const lines = renderToAnsi(cfg, typical())
      // Pet builds may add lines (pet height) beyond the row count.
      expect(lines.length).toBeGreaterThanOrEqual(cfg.rows.length)
      expect(lines.some((l) => l.length > 0)).toBe(true)
    })

    it('generates a marked script in every language', () => {
      for (const lang of LANGUAGES) {
        expect(generate(build.make(), lang)).toContain('pimp-my-statusline:v1:')
      }
    })

    it('make() returns fresh instances on every call (no shared references)', () => {
      const a = build.make()
      const b = build.make()
      expect(a).toEqual(b)
      expect(a.rows[0]).not.toBe(b.rows[0])
      expect(a.rows[0].segments[0]).not.toBe(b.rows[0].segments[0])
      expect(a.global.defaultThresholds).not.toBe(b.global.defaultThresholds)
      expect(a.pet.thresholds).not.toBe(b.pet.thresholds)
    })
  })
})
