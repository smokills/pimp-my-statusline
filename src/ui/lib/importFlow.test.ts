import { describe, it, expect } from 'vitest'
import { analyzeImport, normalizeScript } from './importFlow'
import { generate } from '../../generators'
import { defaultConfig } from '../../model/presets/defaultPreset'

describe('normalizeScript', () => {
  it('strips trailing whitespace and collapses trailing blank lines', () => {
    expect(normalizeScript('a  \nb\t\n\n\n')).toBe('a\nb\n')
  })
  it('normalizes CRLF to LF', () => {
    expect(normalizeScript('a\r\nb\r\n')).toBe('a\nb\n')
  })
})

describe('analyzeImport', () => {
  it('fails with an inline error when no marker is present', () => {
    const res = analyzeImport('echo "hello, no marker here"')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/no pimp-my-statusline marker/)
  })

  it('recovers the embedded config from a clean generated script', () => {
    const cfg = defaultConfig()
    const script = generate(cfg, 'bash')
    const res = analyzeImport(script)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.handEdited).toBe(false)
      expect(res.rows).toBe(cfg.rows.length)
      expect(res.elements).toBe(cfg.rows.reduce((n, r) => n + r.segments.length, 0))
    }
  })

  it('detects hand edits in the script body', () => {
    const cfg = defaultConfig()
    const script = generate(cfg, 'bash')
    // Inject a junk line in the body (the marker on line 2 is untouched).
    const lines = script.split('\n')
    lines.splice(5, 0, 'echo "I edited this by hand"')
    const res = analyzeImport(lines.join('\n'))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.handEdited).toBe(true)
  })

  it('treats trailing-whitespace-only differences as NOT hand edits', () => {
    const cfg = { ...defaultConfig(), language: 'python' as const }
    const script = generate(cfg, 'python')
    const withTrailing = script
      .split('\n')
      .map((l) => l + '   ')
      .join('\n')
    const res = analyzeImport(withTrailing)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.handEdited).toBe(false)
  })

  it('round-trips across all three languages', () => {
    for (const lang of ['bash', 'python', 'node'] as const) {
      const cfg = { ...defaultConfig(), language: lang }
      const res = analyzeImport(generate(cfg, lang))
      expect(res.ok).toBe(true)
      if (res.ok) expect(res.config.language).toBe(lang)
    }
  })
})
