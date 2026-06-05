/// <reference types="node" />
// Golden snapshots + percentage edge battery + DST seam agreement.
//
// Golden files live in tests/golden/*.ansi (trailing whitespace preserved via
// .gitattributes/.editorconfig). They pin renderToAnsi's exact bytes so a
// regression shows up as a human-readable diff. Regenerate deliberately with:
//   UPDATE_GOLDEN=1 npm test -- golden
//
// The edge battery runs the FULL chain (renderToAnsi + generated bash/python/
// node executed for real) on percentage extremes: exact 0 (the zero-arg printf
// bar bug), exact 100, .5 ties (trunc, not round), scientific notation 1e-06
// (the `cut -d.` killer), and null.
import { describe, expect, it, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generate, LANGUAGES, scriptFileName } from '../generators/index'
import type { Lang } from '../generators/types'
import { renderToAnsi } from '../preview/renderToAnsi'
import { defaultConfig } from '../model/presets/defaultPreset'
import { typical, panic, fresh } from '../model/presets/mockPresets'
import { buildMaximalConfig, serializeMock } from '../generators/__tests__/fixtures'
import type { MockData } from '../model/mock'
import type { StatuslineConfig } from '../model/types'

const GOLDEN_DIR = join(process.cwd(), 'tests', 'golden')
const UPDATE = process.env.UPDATE_GOLDEN === '1'

const TMP = mkdtempSync(join(tmpdir(), 'pmsl-golden-'))
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

function runScript(lang: Lang, config: StatuslineConfig, mock: MockData): string {
  const p = join(TMP, `${Math.abs(hash(lang + JSON.stringify(config)))}_${scriptFileName(lang)}`)
  if (!existsSync(p)) writeFileSync(p, generate({ ...config, language: lang }, lang))
  const { json, env } = serializeMock(mock)
  const cmd = lang === 'bash' ? 'bash' : lang === 'python' ? 'python3' : 'node'
  return execFileSync(cmd, [p], { input: json, env: { ...process.env, ...env }, encoding: 'utf8' })
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

// ---------------------------------------------------------------------------
// 1. Committed golden snapshots (renderToAnsi is the canonical byte source;
//    the parity matrix already proves scripts == renderToAnsi)
// ---------------------------------------------------------------------------

function withPet(cfg: StatuslineConfig): StatuslineConfig {
  return { ...cfg, pet: { ...cfg.pet, enabled: true, petId: 'cactus' } }
}

const GOLDEN_CASES: [string, StatuslineConfig, MockData][] = [
  ['default-typical', defaultConfig(), typical()],
  ['default-panic', defaultConfig(), panic()],
  ['default-fresh', defaultConfig(), fresh()],
  ['default-pet-cactus-typical', withPet(defaultConfig()), typical()],
  ['default-pet-cactus-panic', withPet(defaultConfig()), panic()],
  ['maximal-pet-typical', buildMaximalConfig(true), typical()],
]

describe('golden snapshots (tests/golden/*.ansi)', () => {
  for (const [name, cfg, mock] of GOLDEN_CASES) {
    it(name, () => {
      const actual = renderToAnsi(cfg, mock).join('\n') + '\n'
      const file = join(GOLDEN_DIR, `${name}.ansi`)
      if (UPDATE || !existsSync(file)) {
        mkdirSync(GOLDEN_DIR, { recursive: true })
        writeFileSync(file, actual)
      }
      const expected = readFileSync(file, 'utf8')
      expect(actual).toBe(expected)
    })
  }
})

// ---------------------------------------------------------------------------
// 2. Percentage edge battery — full chain at the extremes
// ---------------------------------------------------------------------------

function mockAtPct(pct: number | null): MockData {
  const m = typical()
  m.context_window = {
    total_input_tokens: 0,
    total_output_tokens: 0,
    context_window_size: 200000,
    used_percentage: pct,
    remaining_percentage: pct === null ? null : 100 - pct,
    current_usage: null,
  }
  // Drive session/week too, so bar math is exercised at the same extremes
  // (clamped where needed). Keep resets_at so the timer renders.
  if (m.rate_limits?.five_hour) m.rate_limits.five_hour.used_percentage = pct ?? 0
  if (m.rate_limits?.seven_day) m.rate_limits.seven_day.used_percentage = pct ?? 0
  return m
}

// Config where context ALSO shows a bar, so 0%/100% exercise barFill bounds
// (the user's preset is percent-only on context).
function contextWithBar(): StatuslineConfig {
  const cfg = defaultConfig()
  for (const row of cfg.rows) {
    for (const seg of row.segments) {
      if (seg.type === 'context' && 'parts' in seg) seg.parts = ['bar', 'percent']
    }
  }
  return cfg
}

describe('percentage edge battery (0 / 100 / .5 ties / 1e-06 / null)', () => {
  const cases: [string, number | null][] = [
    ['exact-0', 0],
    ['exact-100', 100],
    ['tie-49.5', 49.5],
    ['tie-48.5', 48.5],
    ['sci-1e-06', 1e-6],
    ['null', null],
  ]
  const cfg = contextWithBar()

  for (const [name, pct] of cases) {
    it(`${name}: renderToAnsi == bash == python == node`, () => {
      const mock = mockAtPct(pct)
      const expected = renderToAnsi(cfg, mock).join('\n') + '\n'
      for (const lang of LANGUAGES) {
        expect(runScript(lang, cfg, mock), lang).toBe(expected)
      }
    })
  }

  it('exact-0 renders an EMPTY bar (zero-arg printf guard)', () => {
    const mock = mockAtPct(0)
    const lines = renderToAnsi(cfg, mock)
    // barWidth 5 at 0% → all-empty glyphs, zero filled.
    expect(lines[2]).toContain('░░░░░')
    expect(lines[2]).not.toContain('█')
  })

  it('trunc not round: 49.5 displays as 49', () => {
    const lines = renderToAnsi(cfg, mockAtPct(49.5))
    expect(lines[2]).toContain('49%')
    expect(lines[2]).not.toContain('50%')
  })
})

// ---------------------------------------------------------------------------
// 3. DST seam agreement — all four implementations must AGREE byte-for-byte
//    near a Los Angeles DST transition (the ±1h seam vs reality is accepted;
//    divergence BETWEEN implementations is not).
// ---------------------------------------------------------------------------

describe('peak countdown across the spring-forward DST seam', () => {
  // Verified with TZ=America/Los_Angeles date:
  //   1772841600 = Fri 2026-03-06 16:00 PST (off-peak; next window is Monday
  //                2026-03-09 05:00 PDT, scan crosses the Mar 8 spring-forward)
  //   1773055800 = Mon 2026-03-09 04:30 PDT (post-transition weekday pre-window)
  const seams: [string, number][] = [
    ['friday-before-spring-forward', 1772841600],
    ['monday-after-spring-forward', 1773055800],
  ]
  const cfg = defaultConfig()

  for (const [name, epoch] of seams) {
    it(name, () => {
      const mock = typical()
      mock._now = epoch
      if (mock.rate_limits?.five_hour) mock.rate_limits.five_hour.resets_at = epoch + 7200
      if (mock.rate_limits?.seven_day) mock.rate_limits.seven_day.resets_at = epoch + 86400
      const expected = renderToAnsi(cfg, mock).join('\n') + '\n'
      expect(expected).toContain('Off-peak')
      for (const lang of LANGUAGES) {
        expect(runScript(lang, cfg, mock), lang).toBe(expected)
      }
    })
  }
})
