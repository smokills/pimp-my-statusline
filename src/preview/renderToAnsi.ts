// renderToAnsi — config + mock → the EXACT byte string the generated
// bash/python/node scripts print. This is the parity reference: a later phase
// diffs `renderToAnsi(config, mock).join('\n')` against each script's stdout
// byte-for-byte. The ANSI→HTML parser (ansiToHtml.tsx) is deliberately dumb —
// it understands only SGR + OSC8 — so EVERY semantic decision lives here and in
// the model/pets layers, never in the parser.
//
// Composition reuses src/pets/runtime (selectMood / colorizeFrame / compose) —
// we never reimplement pet logic here.

import type { StatuslineConfig, Row, TextStyle, SegmentRender } from '../model/types'
import type { MockData } from '../model/mock'
import { evaluateSegment } from '../model/segments'
import { truncPct } from '../model/evaluate-helpers'
import { getPet } from '../pets/pets'
import { selectMood, colorizeFrame, compose } from '../pets/runtime'
import type { Mood } from '../pets/types'

// ---------------------------------------------------------------------------
// Span serialization — THE canonical SGR encoding
// ---------------------------------------------------------------------------

/**
 * Serialize one span's style into SGR parameters, in this EXACT order:
 *   1) `1`  when bold
 *   2) `2`  when dim
 *   3) color: `<code>` for ansi16, `38;5;<code>` for fixed
 * joined with ';'. Examples:
 *   bold + ansi16(34)  → "1;34"
 *   dim  + ansi16(37)  → "2;37"
 *   fixed(46)          → "38;5;46"
 *   bold + fixed(196)  → "1;38;5;196"
 *
 * Returns null when the style yields no recognizable params (⇒ plain text, no
 * escapes). Spans reaching here always carry CONCRETE colors: evaluate()
 * pre-resolves threshold ColorSpecs, so this function never sees `kind:
 * 'threshold'` (it would fall through to "no color params" if it did).
 *
 * THIS is the canonical serialization the generators mirror. Keep it the single
 * source of the param order.
 */
function styleToParams(style: TextStyle): string | null {
  const params: string[] = []
  if (style.bold) params.push('1')
  if (style.dim) params.push('2')
  const color = style.color
  if (color) {
    if (color.kind === 'ansi16') params.push(String(color.code))
    else if (color.kind === 'fixed') params.push(`38;5;${color.code}`)
    // kind === 'threshold' should never reach here (evaluate pre-resolves it);
    // if it somehow does, we emit no color param rather than guessing.
  }
  return params.length > 0 ? params.join(';') : null
}

/** Serialize a single span to its ANSI byte string.
 *  - no style / empty style / unrecognized style  → plain text (no escapes)
 *  - otherwise ONE `\x1b[<params>m` + text + `\x1b[0m` (reset).
 */
function serializeSpan(span: { text: string; style?: TextStyle }): string {
  if (!span.style) return span.text
  const params = styleToParams(span.style)
  if (params === null) return span.text
  return `\x1b[${params}m${span.text}\x1b[0m`
}

/** Serialize a whole SegmentRender (its spans, in order). */
function serializeRender(render: SegmentRender): string {
  let out = ''
  for (const span of render.spans) out += serializeSpan(span)
  return out
}

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

/**
 * Render one row to its ANSI string. For each ENABLED segment we evaluate, DROP
 * segments whose render has empty spans (graceful absence — no dangling
 * joiner), then join: the join string before each kept segment after the first
 * is `seg.joinBefore ?? row.joiner`.
 */
function renderRow(row: Row, mock: MockData): string {
  const kept: { seg: (typeof row.segments)[number]; ansi: string }[] = []
  for (const seg of row.segments) {
    if (!seg.enabled) continue
    const render = evaluateSegment(seg, mock)
    if (render.spans.length === 0) continue // dropped: empty render
    kept.push({ seg, ansi: serializeRender(render) })
  }
  let out = ''
  for (let i = 0; i < kept.length; i++) {
    if (i > 0) out += kept[i].seg.joinBefore ?? row.joiner
    out += kept[i].ansi
  }
  return out
}

/**
 * Render every configured row to an ANSI string. One entry per `config.rows[i]`
 * UNCONDITIONALLY — a row whose segments all dropped/disabled STILL emits an
 * empty string. The generated scripts print one line per configured row no
 * matter what (one `echo`/`print`/`console.log` per row), so emitting the empty
 * line here keeps preview↔script parity simple.
 */
export function renderRowsToAnsi(config: StatuslineConfig, mock: MockData): string[] {
  return config.rows.map((row) => renderRow(row, mock))
}

// ---------------------------------------------------------------------------
// Pet metric extraction
// ---------------------------------------------------------------------------

/**
 * Percentage that drives the pet's mood, mirroring metricSource() semantics but
 * with the pet's "always renders" rule: if the source OBJECT is absent, treat
 * pct as 0 (the pet still renders, at its lowest mood — same default-to-zero
 * rule session/week segments follow; only context drops on absence). truncPct
 * matches the displayed truncation everywhere.
 */
function petPercent(metric: StatuslineConfig['pet']['metric'], mock: MockData): number {
  if (metric === 'context') {
    return truncPct(mock.context_window?.used_percentage)
  }
  if (metric === 'session_5h') {
    return truncPct(mock.rate_limits?.five_hour?.used_percentage)
  }
  // week_7d
  return truncPct(mock.rate_limits?.seven_day?.used_percentage)
}

// ---------------------------------------------------------------------------
// Top-level render (+ pet composition)
// ---------------------------------------------------------------------------

/**
 * Full preview render: rows, then pet composition when `config.pet.enabled`.
 * Returns one ANSI string per output line (== rows when the pet is disabled or
 * its id is unknown; otherwise max(petHeight, rowCount) lines from compose()).
 */
export function renderToAnsi(config: StatuslineConfig, mock: MockData): string[] {
  const rowLines = renderRowsToAnsi(config, mock)
  if (!config.pet.enabled) return rowLines

  const pet = getPet(config.pet.petId)
  if (pet === undefined) return rowLines // unknown id → no pet, just the rows

  const pct = petPercent(config.pet.metric, mock)
  const available = Object.keys(pet.frames) as Mood[]
  const mood = selectMood(pct, config.pet.thresholds, available)
  const frame = pet.frames[mood]
  // `calm` is required on every pet, and selectMood resolves to a defined mood,
  // so `frame` is always present; guard keeps the types honest.
  if (frame === undefined) return rowLines

  const petLines = colorizeFrame(frame, pet.bodyColor)
  return compose(petLines, pet.width, rowLines, config.pet.gap)
}
