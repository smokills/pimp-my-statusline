import { describe, expect, it } from 'vitest'
import { renderToAnsi, renderRowsToAnsi } from '../renderToAnsi'
import { stripAnsi as stripAnsiLocal } from '../width'
import { defaultConfig } from '../../model/presets/defaultPreset'
import { typical, fresh, noRateLimits } from '../../model/presets/mockPresets'
import type { StatuslineConfig } from '../../model/types'

const ESC = '\x1b'

// ---------------------------------------------------------------------------
// Golden-by-hand: defaultConfig × typical → EXACT 3-line ANSI output.
//
// Derived from the model semantics (mockPresets.typical + defaultPreset +
// evaluate). Mock values: cwd ~/dev/pimp-my-statusline, branch main, Opus,
// effort high, ctx 34%, 5h 23.5%→23, 7d 41.2%→41, 5h resets +7200s ⇒ 2h0m.
// Threshold @<70 ⇒ green ansi16(32). Canonical SGR order: bold(1) ; dim(2) ;
// color.
// ---------------------------------------------------------------------------

describe('renderToAnsi golden — defaultConfig × typical', () => {
  const lines = renderToAnsi(defaultConfig(), typical())

  it('emits exactly 3 lines', () => {
    expect(lines).toHaveLength(3)
  })

  it('row1: directory(1;34) + "  " + gitBranch(1;32)', () => {
    expect(lines[0]).toBe(
      `${ESC}[1;34m~/dev/pimp-my-statusline${ESC}[0m  ${ESC}[1;32mmain${ESC}[0m`,
    )
  })

  it('row2: separator 74× ─ dim white (2;37)', () => {
    expect(lines[1]).toBe(`${ESC}[2;37m${'─'.repeat(74)}${ESC}[0m`)
  })

  it('row3: model effort context  session  week (hand-derived)', () => {
    const expected =
      `${ESC}[1;37mOpus${ESC}[0m` + // model
      ` ` + // effort joinBefore (single space)
      `${ESC}[2;37mhigh${ESC}[0m` + // effort
      ` ` + // context joinBefore (single space)
      `${ESC}[32m34%${ESC}[0m` + // context (threshold@34 → green 32)
      `  ` + // row.joiner (double space) before session
      `${ESC}[36mSession ${ESC}[0m` + // session label (cyan 36)
      `${ESC}[32m█░░░░${ESC}[0m` + // session bar (23% → 1 filled, green)
      ` ` +
      `${ESC}[32m23%${ESC}[0m` + // session percent
      ` ` +
      `${ESC}[2;37m(2h0m)${ESC}[0m` + // session timer (dim white)
      `  ` + // joiner before week
      `${ESC}[35mWeek ${ESC}[0m` + // week label (magenta 35)
      `${ESC}[32m██░░░${ESC}[0m` + // week bar (41% → 2 filled, green)
      ` ` +
      `${ESC}[32m41%${ESC}[0m` // week percent
    expect(lines[2]).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// joinBefore literal-byte semantics on row3
// ---------------------------------------------------------------------------

describe('joinBefore join bytes on row3', () => {
  const row3 = renderToAnsi(defaultConfig(), typical())[2]

  it('model→effort and effort→context join with a SINGLE space', () => {
    // exactly one space between Opus reset and high escape
    expect(row3).toContain(`Opus${ESC}[0m ${ESC}[2;37mhigh`)
    // exactly one space between high reset and context escape
    expect(row3).toContain(`high${ESC}[0m ${ESC}[32m34%`)
  })

  it('major groups (context→session, session→week) join with TWO spaces', () => {
    expect(row3).toContain(`34%${ESC}[0m  ${ESC}[36mSession`)
    // session timer ... then two spaces before week label
    expect(row3).toContain(`(2h0m)${ESC}[0m  ${ESC}[35mWeek`)
  })
})

// ---------------------------------------------------------------------------
// Absence: dropped segments leave no dangling joiners; empty rows preserved.
// ---------------------------------------------------------------------------

describe('absence — fresh / noRateLimits', () => {
  it('noRateLimits: session/week dropped, no dangling joiner around them', () => {
    const row3 = renderToAnsi(defaultConfig(), noRateLimits())[2]
    // context present (28%), session+week dropped — row ends at context.
    expect(row3).not.toContain('Session')
    expect(row3).not.toContain('Week')
    expect(row3).toContain(`28%${ESC}[0m`)
    expect(row3.endsWith(`28%${ESC}[0m`)).toBe(true) // no trailing joiner
    expect(row3).not.toContain(`${ESC}[0m    ${ESC}`) // no 4-space gap
  })

  it('fresh: ctx null→0%, no rate_limits; row3 has model/context only', () => {
    const row3 = renderToAnsi(defaultConfig(), fresh())[2]
    // fresh has no effort → effort dropped. ctx present-null → 0%.
    expect(row3).not.toContain('high')
    expect(row3).toContain(`${ESC}[32m0%${ESC}[0m`)
    expect(row3).not.toContain('Session')
    expect(row3).not.toContain('Week')
    // model joins directly to context with a single space (effort dropped, and
    // context's joinBefore=' ' governs the join immediately before it).
    expect(row3).toContain(`Opus${ESC}[0m ${ESC}[32m0%`)
  })

  it('a row whose segments all drop/disable STILL emits an empty line', () => {
    const cfg: StatuslineConfig = {
      version: 1,
      language: 'bash',
      rows: [
        // row with a single disabled segment → empty
        {
          id: 'r1',
          segments: [{ id: 'm', type: 'model', enabled: false }],
          joiner: '  ',
        },
        // row whose only segment drops on absence (effort absent in baseline)
        {
          id: 'r2',
          segments: [{ id: 'e', type: 'effort', enabled: true }],
          joiner: '  ',
        },
      ],
      pet: defaultConfig().pet,
      global: { emoji: false, defaultThresholds: [] },
    }
    const lines = renderRowsToAnsi(cfg, fresh())
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('')
    expect(lines[1]).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Plain (no-style) spans: a style-less / empty-style span emits no escapes.
// ---------------------------------------------------------------------------

describe('plain span serialization', () => {
  it('a segment with no style produces no escape sequences', () => {
    const cfg: StatuslineConfig = {
      version: 1,
      language: 'bash',
      rows: [
        { id: 'r', segments: [{ id: 'm', type: 'model', enabled: true }], joiner: '  ' },
      ],
      pet: defaultConfig().pet,
      global: { emoji: false, defaultThresholds: [] },
    }
    const line = renderRowsToAnsi(cfg, typical())[0]
    expect(line).toBe('Opus')
    expect(line).not.toContain(ESC)
  })
})

// ---------------------------------------------------------------------------
// Pet composition
// ---------------------------------------------------------------------------

describe('pet composition — cactus on default config', () => {
  function withPet(
    overrides: Partial<StatuslineConfig['pet']>,
  ): StatuslineConfig {
    const cfg = defaultConfig()
    cfg.pet = { ...cfg.pet, enabled: true, petId: 'cactus', ...overrides }
    return cfg
  }

  it('disabled pet (default) leaves rows untouched', () => {
    const cfg = defaultConfig()
    expect(renderToAnsi(cfg, typical())).toEqual(renderRowsToAnsi(cfg, typical()))
  })

  it('unknown pet id renders rows without pet', () => {
    const cfg = withPet({ petId: 'nope-not-a-pet' })
    expect(renderToAnsi(cfg, typical())).toEqual(renderRowsToAnsi(cfg, typical()))
  })

  it('pet column + gap prefixes each line (always left); gap honored', () => {
    const cfg = withPet({ gap: 2, metric: 'context' })
    const lines = renderToAnsi(cfg, typical())
    // 3 rows, cactus is 3 tall → 3 output lines.
    expect(lines).toHaveLength(3)
    // Each line begins with petWidth(6) art cells then exactly gap(2) spaces
    // before the row content. Verify the gap on row 1 (which has content) by
    // stripping ANSI and checking the 6 pet cells are followed by 2 spaces and
    // then a non-space (the directory ~).
    const plain0 = stripAnsiLocal(lines[0])
    expect(plain0.slice(6, 8)).toBe('  ') // gap = 2 spaces
    expect(plain0[8]).not.toBe(' ') // row content begins right after the gap
  })

  it('mood frames differ across pct 5 / 55 / 95 (metric context)', () => {
    const mk = (pct: number) => {
      const m = typical()
      m.context_window = {
        total_input_tokens: 0,
        total_output_tokens: 0,
        context_window_size: 200000,
        used_percentage: pct,
        remaining_percentage: 100 - pct,
        current_usage: null,
      }
      return m
    }
    const cfg = withPet({ metric: 'context', gap: 1 })
    // cactus thresholds default: idle<=10, calm<50, wary<80, alarmed<90, else panic
    const low = renderToAnsi(cfg, mk(5)) // idle
    const mid = renderToAnsi(cfg, mk(55)) // wary
    const high = renderToAnsi(cfg, mk(95)) // panic

    // Compare the pet art itself (left 6 cells, ANSI stripped) across moods.
    const petCol = (line: string) => stripAnsiLocal(line).slice(0, 6)
    expect(petCol(low[0])).not.toBe(petCol(mid[0])) // idle vs wary
    expect(petCol(mid[0])).not.toBe(petCol(high[0])) // wary vs panic

    // Each render produces exactly 3 lines (cactus height 3 >= 3 rows).
    for (const set of [low, mid, high]) {
      expect(set).toHaveLength(3)
    }

    // THE hard constraint: the pet column never changes width across moods.
    // Row content varies with the pct ("5%" vs "55%"), so total line width is
    // NOT invariant — what must hold is that the content always starts at the
    // same column: pet width (6) + gap (1) = 7 for every line of every mood.
    for (const set of [low, mid, high]) {
      for (const line of set) {
        const plain = stripAnsiLocal(line)
        expect(plain.length).toBeGreaterThanOrEqual(7)
        expect(plain[6]).toBe(' ') // the gap column, always blank
      }
    }
  })

  it('every line starts at the same content column (pet width + gap)', () => {
    const cfg = withPet({ gap: 1, metric: 'context' })
    const lines = renderToAnsi(cfg, typical())
    // Pet is ALWAYS at the left: content begins at column petWidth(6)+gap(1)
    // on every line, so the pet reads as a stable column.
    for (const line of lines) {
      const plain = stripAnsiLocal(line)
      expect(plain.slice(0, 7).length).toBe(7)
      expect(plain[6]).toBe(' ')
    }
  })
})
