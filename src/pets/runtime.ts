// Pure, dependency-free pet runtime helpers. These are THE reference semantics
// that the bash / python / node generators mirror byte-for-byte, so keep them
// simple, total, and free of any environment or library coupling.

import type { Mood, PetThresholds, Span, Frame } from './types.ts'
import { MOOD_ORDER } from './types.ts'

// ---------------------------------------------------------------------------
// ANSI handling
// ---------------------------------------------------------------------------

// SGR colour/style sequences: ESC [ ... m
const SGR_RE = /\x1b\[[0-9;]*m/g
// OSC 8 hyperlinks: ESC ] 8 ; ; <uri> ST   where ST is BEL (\x07) or ESC \
const OSC8_RE = /\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g

/** Remove SGR and OSC 8 sequences. Everything else is left untouched. */
export function stripAnsi(s: string): string {
  return s.replace(OSC8_RE, '').replace(SGR_RE, '')
}

/** Visible (printed) length: characters that actually occupy a terminal cell. */
export function visibleLen(s: string): number {
  // `.length` counts UTF-16 code units; this is correct only because the charset
  // invariant (isAllowedChar) forbids multi-unit characters. The bash/python
  // ports measure length differently and rely on the same invariant.
  return stripAnsi(s).length
}

// ---------------------------------------------------------------------------
// Frame normalization
// ---------------------------------------------------------------------------

/**
 * Pad each row on the right to exactly `width` visible cells. Asserts the frame
 * has exactly `height` rows and that no row exceeds `width` — both are authoring
 * errors and throw with a descriptive message. Pads only; never crops.
 */
export function normalizeFrame(rawRows: string[], width: number, height: number): string[] {
  if (rawRows.length !== height) {
    throw new Error(
      `normalizeFrame: expected ${height} rows, got ${rawRows.length}`,
    )
  }
  return rawRows.map((row, i) => {
    const vis = visibleLen(row)
    if (vis > width) {
      throw new Error(
        `normalizeFrame: row ${i} has visible width ${vis} > width ${width}: ${JSON.stringify(row)}`,
      )
    }
    return row + ' '.repeat(width - vis)
  })
}

// ---------------------------------------------------------------------------
// Mood selection
// ---------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n
}

function toMoodSet(availableMoods: Set<Mood> | Mood[]): Set<Mood> {
  return availableMoods instanceof Set ? availableMoods : new Set(availableMoods)
}

/**
 * Pick the mood for a percentage. Uses TRUNCATION (matches how the displayed
 * percentage is truncated), not rounding. Never returns a mood the pet lacks:
 * idle falls back to calm; any other missing mood falls back to the nearest
 * defined lower mood, ultimately calm.
 *
 * Boundaries (with clamped, truncated p):
 *   idle    when p <= thresholds.idle   (only if an idle frame exists)
 *   calm    when p <  thresholds.calm
 *   wary    when p <  thresholds.wary
 *   alarmed when p <  thresholds.alarmed
 *   panic   otherwise
 */
export function selectMood(
  pct: number,
  thresholds: PetThresholds,
  availableMoods: Set<Mood> | Mood[],
): Mood {
  const available = toMoodSet(availableMoods)
  const p = clamp(Math.trunc(pct), 0, 100)

  let want: Mood
  if (available.has('idle') && p <= thresholds.idle) {
    want = 'idle'
  } else if (p < thresholds.calm) {
    want = 'calm'
  } else if (p < thresholds.wary) {
    want = 'wary'
  } else if (p < thresholds.alarmed) {
    want = 'alarmed'
  } else {
    want = 'panic'
  }
  return resolveMood(want, available)
}

/**
 * Resolve a desired mood against what the pet actually defines. idle → calm;
 * any other missing mood walks down MOOD_ORDER to the nearest defined lower
 * mood, ultimately calm (which every pet is required to define).
 */
function resolveMood(want: Mood, available: Set<Mood>): Mood {
  if (available.has(want)) return want
  if (want === 'idle') return 'calm'
  // Walk downward through MOOD_ORDER from the desired mood to find the nearest
  // lower mood the pet defines.
  const idx = MOOD_ORDER.indexOf(want)
  for (let i = idx - 1; i >= 0; i--) {
    const m = MOOD_ORDER[i]
    if (m !== 'idle' && available.has(m)) return m
  }
  return 'calm'
}

// ---------------------------------------------------------------------------
// Colorization
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m'
function sgr(n: number): string {
  return `\x1b[38;5;${n}m`
}

/**
 * Colorize one row by walking columns left→right, emitting an SGR sequence only
 * when the colour changes, and a final reset. ANSI is zero-width, so the visible
 * length is unchanged: visibleLen(result) === row.length.
 */
export function colorizeRow(row: string, rowSpans: Span[], bodyColor: number): string {
  // Per-column colour lookup table, defaulting to bodyColor. Spans passed here
  // are assumed to already belong to this row (the .row field is ignored).
  const colors: number[] = new Array(row.length).fill(bodyColor)
  for (const s of rowSpans) {
    for (let c = s.col; c < s.col + s.len && c < row.length; c++) {
      colors[c] = s.color
    }
  }

  let out = ''
  let cur = bodyColor
  out += sgr(bodyColor)
  for (let c = 0; c < row.length; c++) {
    const want = colors[c]
    if (want !== cur) {
      out += sgr(want)
      cur = want
    }
    out += row[c]
  }
  out += RESET
  return out
}

/**
 * Colorize every row of a frame using that row's spans. Returns one ANSI string
 * per row; each preserves the frame's fixed visible width.
 */
export function colorizeFrame(frame: Frame, bodyColor: number): string[] {
  const spans = frame.spans ?? []
  return frame.rows.map((row, r) =>
    colorizeRow(
      row,
      spans.filter((s) => s.row === r),
      bodyColor,
    ),
  )
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** Append spaces up to `target` visible width; no-op when already ≥ target. */
export function padTo(s: string, target: number): string {
  const deficit = target - visibleLen(s)
  return deficit > 0 ? s + ' '.repeat(deficit) : s
}

/**
 * Top-aligned zip of a pet column against the statusline rows. Output length is
 * max(petLines.length, rowLines.length). Composition is ALWAYS top-aligned
 * (there is no valign).
 *
 * left:  petCell + gapStr + rowCell   (trailing spaces are kept — byte parity)
 * right: padTo(rowCell, maxRowVisibleWidth) + gapStr + petCell
 *
 * A missing pet row is a blank cell of `petWidth` spaces; a missing row cell is
 * the empty string.
 */
export function compose(
  petLines: string[],
  petWidth: number,
  rowLines: string[],
  side: 'left' | 'right',
  gap: number,
): string[] {
  const Lout = Math.max(petLines.length, rowLines.length)
  const blank = ' '.repeat(petWidth)
  const gapStr = ' '.repeat(gap)

  const maxRowVisibleWidth = rowLines.reduce((m, r) => Math.max(m, visibleLen(r)), 0)

  const out: string[] = []
  for (let i = 0; i < Lout; i++) {
    const petCell = i < petLines.length ? petLines[i] : blank
    const rowCell = i < rowLines.length ? rowLines[i] : ''
    if (side === 'left') {
      out.push(petCell + gapStr + rowCell)
    } else {
      out.push(padTo(rowCell, maxRowVisibleWidth) + gapStr + petCell)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Character safety
// ---------------------------------------------------------------------------

const BOX_DRAWING = new Set([...'─│┌┐└┘├┤┬┴┼╭╮╯╰╱╲'])

/**
 * Printable ASCII (0x20–0x7E) or a single-width box-drawing glyph from the
 * allowlist. Everything else — double-width East Asian, emoji, combining marks,
 * tabs, control chars — is rejected.
 */
export function isAllowedChar(ch: string): boolean {
  const cp = ch.codePointAt(0)
  if (cp === undefined) return false
  if (cp >= 0x20 && cp <= 0x7e) return true
  return BOX_DRAWING.has(ch)
}
