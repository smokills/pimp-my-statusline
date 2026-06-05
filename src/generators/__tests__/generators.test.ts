/// <reference types="node" />
import { afterAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generate, LANGUAGES, scriptFileName } from '../index'
import type { Lang } from '../types'
import { defaultConfig } from '../../model/presets/defaultPreset'
import { MOCK_PRESETS } from '../../model/presets/mockPresets'
import { SEGMENTS, defaultThresholdStops } from '../../model/segments'
import type { SegmentType, StatuslineConfig } from '../../model/types'
import { DEFAULT_PET_THRESHOLDS } from '../../pets/types'
import { buildMaximalConfig, serializeMock } from './fixtures'
import { buildMock, type MockData } from '../../model/mock'

// ---------------------------------------------------------------------------
// Tmp workspace + spawn helpers
// ---------------------------------------------------------------------------

const ROOT = mkdtempSync(join(tmpdir(), 'pmsl-gen-'))
afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

let counter = 0
function writeScripts(config: StatuslineConfig): Record<Lang, string> {
  const id = counter++
  const paths = {} as Record<Lang, string>
  for (const lang of LANGUAGES) {
    const p = join(ROOT, `${id}_${scriptFileName(lang)}`)
    writeFileSync(p, generate({ ...config, language: lang }, lang))
    paths[lang] = p
  }
  return paths
}

function run(lang: Lang, scriptPath: string, mock: MockData): string {
  const { json, env } = serializeMock(mock)
  const cmd = lang === 'bash' ? 'bash' : lang === 'python' ? 'python3' : 'node'
  return execFileSync(cmd, [scriptPath], {
    input: json,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
}

// ---------------------------------------------------------------------------
// 1. Syntax validity
// ---------------------------------------------------------------------------

function checkSyntax(lang: Lang, scriptPath: string): void {
  if (lang === 'bash') execFileSync('bash', ['-n', scriptPath])
  else if (lang === 'python') execFileSync('python3', ['-m', 'py_compile', scriptPath])
  else execFileSync('node', ['--check', scriptPath])
}

describe('syntax validity', () => {
  const configs: Record<string, StatuslineConfig> = {
    default: defaultConfig(),
    maximalPet: buildMaximalConfig(true),
  }
  for (const [name, cfg] of Object.entries(configs)) {
    for (const lang of LANGUAGES) {
      it(`${name} (${lang}) is syntactically valid`, () => {
        const dir = mkdtempSync(join(ROOT, 'syn-'))
        const p = join(dir, scriptFileName(lang))
        writeFileSync(p, generate({ ...cfg, language: lang }, lang))
        expect(() => checkSyntax(lang, p)).not.toThrow()
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 2. Hygiene regexes on generated bash
// ---------------------------------------------------------------------------

describe('bash hygiene', () => {
  const cfg = buildMaximalConfig(true)
  const sh = generate({ ...cfg, language: 'bash' }, 'bash')
  const lines = sh.split('\n')

  it('no echo -e', () => {
    expect(sh).not.toMatch(/echo\s+-e/)
  })
  it("no printf '%b'", () => {
    expect(sh).not.toMatch(/printf\s+(['"])%b/)
  })
  it('no date -d with a non-@ argument', () => {
    // date -d must only ever be followed by "@...".
    expect(sh).not.toMatch(/date -d "(?!@)/)
  })
  it('no cut -d.', () => {
    expect(sh).not.toMatch(/cut -d\./)
  })
  it('has the jq preflight guard with exit 0', () => {
    expect(sh).toMatch(/command -v jq[^\n]*exit 0/)
  })
  it('shebang is /usr/bin/env bash', () => {
    expect(lines[0]).toBe('#!/usr/bin/env bash')
  })
  it('re-import marker is on line 2', () => {
    expect(lines[1]).toMatch(/^# pimp-my-statusline:v1:[A-Za-z0-9_-]+$/)
  })
})

// ---------------------------------------------------------------------------
// 3. Helper pruning
// ---------------------------------------------------------------------------

describe('helper pruning (directory + model only)', () => {
  function minimalConfig(): StatuslineConfig {
    const types: SegmentType[] = ['directory', 'model']
    const segments = types.map((t) => ({ ...SEGMENTS[t].defaults(), id: t }))
    return {
      version: 1,
      language: 'bash',
      rows: [{ id: 'r1', segments: segments as never, joiner: '  ' }],
      pet: {
        enabled: false,
        petId: 'cactus',
        metric: 'context',
        gap: 1,
        thresholds: { ...DEFAULT_PET_THRESHOLDS },
      },
      global: { defaultThresholds: defaultThresholdStops() },
    }
  }
  for (const lang of LANGUAGES) {
    it(`${lang} emits no bar/time_until/pet code`, () => {
      const s = generate({ ...minimalConfig(), language: lang }, lang)
      expect(s).not.toMatch(/\bbar\b\s*[({=]|def bar|const bar/)
      expect(s).not.toMatch(/time_until/)
      expect(s).not.toMatch(/PET_FRAMES|PET_calm|_pet_mood|_petMood/)
      expect(s).not.toMatch(/sgr_wrap/) // no threshold colors here
    })
  }
})

// ---------------------------------------------------------------------------
// 4. Cross-language execution parity (the core test of this phase)
// ---------------------------------------------------------------------------

describe('cross-language execution parity', () => {
  const configs: Record<string, StatuslineConfig> = {
    default: defaultConfig(),
    defaultPetCactus: {
      ...defaultConfig(),
      pet: { ...defaultConfig().pet, enabled: true, petId: 'cactus' },
    },
    maximalPet: buildMaximalConfig(true),
  }
  const mockNames = [
    'typical',
    'fresh',
    'noRateLimits',
    'panic',
    'narrow',
  ] as const

  // The preview renderer is the canonical output. It exists now, so EVERY cell
  // of the matrix verifies all three scripts == renderToAnsi (not just that the
  // three agree with each other). Guarded so the file still works standalone.
  const hasPreview = existsSync(join(process.cwd(), 'src/preview/renderToAnsi.ts'))

  for (const [cname, cfg] of Object.entries(configs)) {
    const paths = writeScripts(cfg)
    for (const mname of mockNames) {
      it(`${cname} × ${mname}: bash == python == node${hasPreview ? ' == renderToAnsi' : ''}`, async () => {
        const mock = MOCK_PRESETS[mname]()
        const outBash = run('bash', paths.bash, mock)
        const outPy = run('python', paths.python, mock)
        const outNode = run('node', paths.node, mock)
        expect(outPy).toBe(outBash)
        expect(outNode).toBe(outBash)
        if (hasPreview) {
          const { renderToAnsi } = await import('../../preview/renderToAnsi')
          const expected = renderToAnsi(cfg, mock).join('\n') + '\n'
          expect(outBash).toBe(expected)
        }
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 5. Pet: width invariance + agreement across pcts
// ---------------------------------------------------------------------------

describe('pet width invariance across pcts', () => {
  function stripAnsi(s: string): string {
    return s
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '')
  }
  // The pet is bound to session_5h; the DISPLAYED rows below do NOT show
  // session, so the row content is identical across pcts and the only thing
  // varying is the pet's mood (its column is fixed-width). This isolates the
  // invariant: changing the pet mood never shifts any line's visible width.
  function petMock(pct: number): MockData {
    return buildMock({
      _now: 1769677500,
      _gitBranch: 'main',
      rate_limits: {
        five_hour: { used_percentage: pct, resets_at: 1769677500 + 3600 },
        seven_day: { used_percentage: pct, resets_at: 1769677500 + 86400 },
      },
    })
  }

  // Rows: directory + model (fixed), separator at a fixed width. No metric
  // segment displays session_5h, so row content is constant across pcts.
  function petLayoutConfig(): StatuslineConfig {
    const directory = { ...SEGMENTS.directory.defaults(), id: 'directory' }
    const model = { ...SEGMENTS.model.defaults(), id: 'model' }
    const separator = { ...SEGMENTS.separator.defaults(), id: 'separator', width: 30 as const }
    return {
      version: 1,
      language: 'bash',
      rows: [
        { id: 'r1', segments: [directory, model] as never, joiner: '  ' },
        { id: 'r2', segments: [separator] as never, joiner: '  ' },
      ],
      pet: {
        enabled: true,
        petId: 'cactus',
        metric: 'session_5h',
        gap: 2,
        thresholds: { ...DEFAULT_PET_THRESHOLDS },
      },
      global: { defaultThresholds: defaultThresholdStops() },
    }
  }

  it('pet (always left) agrees across pct 5/55/95 with constant line widths', () => {
    const cfg = petLayoutConfig()
    const paths = writeScripts(cfg)
    const widthsByPct: number[][] = []
    for (const pct of [5, 55, 95]) {
      const mock = petMock(pct)
      const outBash = run('bash', paths.bash, mock)
      const outPy = run('python', paths.python, mock)
      const outNode = run('node', paths.node, mock)
      expect(outPy).toBe(outBash)
      expect(outNode).toBe(outBash)
      const widths = outBash
        .replace(/\n$/, '')
        .split('\n')
        .map((l) => stripAnsi(l).length)
      widthsByPct.push(widths)
    }
    // every line's visible width is constant across the three pcts.
    expect(widthsByPct[1]).toEqual(widthsByPct[0])
    expect(widthsByPct[2]).toEqual(widthsByPct[0])
  })
})

// ---------------------------------------------------------------------------
// Targeted parity: PR showState (conditional span) + empty git override
// ---------------------------------------------------------------------------

function singleRowConfig(
  segOverrides: Array<{ type: SegmentType; extra?: Record<string, unknown> }>,
): StatuslineConfig {
  const segments = segOverrides.map(({ type, extra }) => ({
    ...SEGMENTS[type].defaults(),
    id: type,
    ...extra,
  }))
  return {
    version: 1,
    language: 'bash',
    rows: [{ id: 'r1', segments: segments as never, joiner: ' | ' }],
    pet: {
      enabled: false,
      petId: 'cactus',
      metric: 'context',
      gap: 1,
      thresholds: { ...DEFAULT_PET_THRESHOLDS },
    },
    global: { defaultThresholds: defaultThresholdStops() },
  }
}

describe('targeted parity', () => {
  it('PR with showState + review_state present (conditional span)', () => {
    const cfg = singleRowConfig([{ type: 'pr', extra: { showState: true } }])
    const paths = writeScripts(cfg)
    const mock = buildMock({
      _now: 1769677500,
      pr: { number: 42, url: 'x', review_state: 'approved' },
    })
    const b = run('bash', paths.bash, mock)
    expect(b.trimEnd()).toContain('#42')
    expect(b.trimEnd()).toContain('approved')
    expect(run('python', paths.python, mock)).toBe(b)
    expect(run('node', paths.node, mock)).toBe(b)
  })

  it('PR with showState but review_state absent (timer-style omission)', () => {
    const cfg = singleRowConfig([{ type: 'pr', extra: { showState: true } }])
    const paths = writeScripts(cfg)
    const mock = buildMock({ _now: 1769677500, pr: { number: 7, url: 'x' } })
    const b = run('bash', paths.bash, mock)
    expect(b.trimEnd()).toBe('#7')
    expect(run('python', paths.python, mock)).toBe(b)
    expect(run('node', paths.node, mock)).toBe(b)
  })

  it('empty PMSL_GIT_BRANCH override drops the segment (rule #8)', () => {
    const cfg = singleRowConfig([{ type: 'gitBranch' }, { type: 'model' }])
    const paths = writeScripts(cfg)
    const mock = buildMock({ _now: 1769677500, _gitBranch: '' })
    const b = run('bash', paths.bash, mock)
    expect(b).toBe('Opus\n') // git dropped; only the model remains, no joiner
    expect(run('python', paths.python, mock)).toBe(b)
    expect(run('node', paths.node, mock)).toBe(b)
  })
})

// ---------------------------------------------------------------------------
// Regression: user strings with control whitespace; duplicate same-type segs
// ---------------------------------------------------------------------------

describe('regression', () => {
  it('user strings with newlines/tabs (staticText, joiner) — syntax + parity', () => {
    // A staticText with a literal newline, another with a tab, and a joiner
    // that contains a newline. The canonical output (renderToAnsi) passes the
    // raw bytes through; all three scripts must agree (python must \n-escape
    // its literals — the bug this guards).
    const cfg: StatuslineConfig = {
      version: 1,
      language: 'bash',
      rows: [
        {
          id: 'r1',
          segments: [
            { id: 's1', type: 'staticText', enabled: true, text: 'line1\nline2' },
            { ...SEGMENTS.model.defaults(), id: 'model' },
            { id: 's2', type: 'staticText', enabled: true, text: 'a\tb' },
          ] as never,
          joiner: 'x\ny',
        },
      ],
      pet: {
        enabled: false,
        petId: 'cactus',
        metric: 'context',
        gap: 1,
        thresholds: { ...DEFAULT_PET_THRESHOLDS },
      },
      global: { defaultThresholds: defaultThresholdStops() },
    }
    const paths = writeScripts(cfg)
    for (const lang of LANGUAGES) {
      const dir = mkdtempSync(join(ROOT, 'nl-'))
      const p = join(dir, scriptFileName(lang))
      writeFileSync(p, generate({ ...cfg, language: lang }, lang))
      expect(() => checkSyntax(lang, p)).not.toThrow()
    }
    const mock = MOCK_PRESETS.typical()
    const b = run('bash', paths.bash, mock)
    expect(b).toContain('line1\nline2') // the newline survived as a real byte
    expect(b).toContain('a\tb')
    expect(run('python', paths.python, mock)).toBe(b)
    expect(run('node', paths.node, mock)).toBe(b)
  })

  it('two same-type segments in one row (model×2, staticText×2, context×2)', () => {
    // Distinct uids must keep temp/output vars unique (node `const` would
    // otherwise SyntaxError on a redeclared identifier).
    const cfg: StatuslineConfig = {
      version: 1,
      language: 'bash',
      rows: [
        {
          id: 'r1',
          segments: [
            { ...SEGMENTS.model.defaults(), id: 'm1' },
            { id: 's1', type: 'staticText', enabled: true, text: 'A' },
            { ...SEGMENTS.model.defaults(), id: 'm2' },
            { id: 's2', type: 'staticText', enabled: true, text: 'B' },
            { ...SEGMENTS.context.defaults(), id: 'c1' },
            { ...SEGMENTS.context.defaults(), id: 'c2' },
          ] as never,
          joiner: ' ',
        },
      ],
      pet: {
        enabled: false,
        petId: 'cactus',
        metric: 'context',
        gap: 1,
        thresholds: { ...DEFAULT_PET_THRESHOLDS },
      },
      global: { defaultThresholds: defaultThresholdStops() },
    }
    const paths = writeScripts(cfg)
    for (const lang of LANGUAGES) {
      const dir = mkdtempSync(join(ROOT, 'dup-'))
      const p = join(dir, scriptFileName(lang))
      writeFileSync(p, generate({ ...cfg, language: lang }, lang))
      expect(() => checkSyntax(lang, p)).not.toThrow()
    }
    const mock = MOCK_PRESETS.typical()
    const b = run('bash', paths.bash, mock)
    expect(run('python', paths.python, mock)).toBe(b)
    expect(run('node', paths.node, mock)).toBe(b)
  })
})

// ---------------------------------------------------------------------------
// Cost formatting parity on realistic values
// ---------------------------------------------------------------------------

describe('cost formatting parity (realistic values)', () => {
  function costConfig(): StatuslineConfig {
    const cost = { ...SEGMENTS.cost.defaults(), id: 'cost' }
    return {
      version: 1,
      language: 'bash',
      rows: [{ id: 'r1', segments: [cost] as never, joiner: '  ' }],
      pet: {
        enabled: false,
        petId: 'cactus',
        metric: 'context',
        gap: 1,
        thresholds: { ...DEFAULT_PET_THRESHOLDS },
      },
      global: { defaultThresholds: defaultThresholdStops() },
    }
  }
  const paths = writeScripts(costConfig())
  // Real CC costs are many-digit token-cost sums; these exercise the common
  // rounding paths. (Exact sub-ULP ties like 2.685 are a documented bash printf
  // limitation — see fmt_cost's comment — and are excluded here.)
  const vals = [0, 0.42, 12.87, 3.4567, 0.0034, 1.2345, 7.891, 0.99, 105.55, 0.067, 0.009]
  for (const v of vals) {
    it(`cost ${v}: bash == python == node`, () => {
      const mock = buildMock({
        _now: 1769677500,
        cost: {
          total_cost_usd: v,
          total_duration_ms: 0,
          total_api_duration_ms: 0,
          total_lines_added: 0,
          total_lines_removed: 0,
        },
      })
      const b = run('bash', paths.bash, mock)
      expect(run('python', paths.python, mock)).toBe(b)
      expect(run('node', paths.node, mock)).toBe(b)
    })
  }
})

// ---------------------------------------------------------------------------
// File-name helper + LANGUAGES surface
// ---------------------------------------------------------------------------

describe('public surface', () => {
  it('LANGUAGES is the three languages', () => {
    expect([...LANGUAGES]).toEqual(['bash', 'python', 'node'])
  })
  it('scriptFileName per language', () => {
    expect(scriptFileName('bash')).toBe('statusline.sh')
    expect(scriptFileName('python')).toBe('statusline.py')
    expect(scriptFileName('node')).toBe('statusline.js')
  })
})
