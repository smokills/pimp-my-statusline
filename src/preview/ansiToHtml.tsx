// ansiToHtml — the deliberately DUMB parser. It understands ONLY SGR sequences
// (\x1b[...m) and OSC8 hyperlinks (which it strips), with ZERO segment
// knowledge. All rendering semantics live in renderToAnsi/model/pets; this file
// just turns the resulting ANSI byte string into styled React spans. Keeping it
// dumb is what guarantees it can't silently diverge from the generated scripts.

import type { JSX } from 'react'
import { XTERM256, ANSI16_TO_XTERM } from './xterm256'

export interface AnsiSpan {
  text: string
  color?: string // resolved '#rrggbb'
  bold?: boolean
  dim?: boolean
}

// SGR: ESC [ <params> m   (params: digits and ';')
const SGR_RE = /\x1b\[([0-9;]*)m/g
// OSC 8 hyperlink: ESC ] 8 ; ; <uri> ST   (ST = BEL \x07 or ESC \). Stripped.
const OSC8_RE = /\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g

/** Foreground tracked as either a normal ANSI-16 base index (0-7, brightened to
 *  8-15 when bold is active — the common terminal default) or an already-fixed
 *  xterm-256 index (from 90-97 bright codes or a 38;5;N sequence). */
type Fg =
  | { kind: 'none' }
  | { kind: 'ansi16'; base: number } // 30-37 → base 0-7
  | { kind: 'xterm'; idx: number } // 90-97 → 8-15, or 38;5;N

interface State {
  bold: boolean
  dim: boolean
  fg: Fg
}

function freshState(): State {
  return { bold: false, dim: false, fg: { kind: 'none' } }
}

/**
 * Resolve the current state's foreground to a hex color. A normal ANSI-16
 * color (30-37) brightens to its 8-15 variant when bold is active — this is
 * the common terminal default ("bold = bright"), and we resolve it with the
 * FINAL bold state of the escape, so `1;34` and `34;1` both yield bright blue.
 */
function resolveColor(state: State): string | undefined {
  if (state.fg.kind === 'ansi16') {
    const idx = state.bold ? state.fg.base + 8 : state.fg.base
    return XTERM256[idx]
  }
  if (state.fg.kind === 'xterm') {
    return XTERM256[state.fg.idx]
  }
  return undefined
}

/** Apply one SGR escape's params (already split into numbers) to the state, in
 *  order. Color params record their RAW kind; the actual hex is resolved later
 *  against the FINAL bold state (so bold after a 30-37 still brightens). */
function applyParams(state: State, params: number[]): void {
  for (let i = 0; i < params.length; i++) {
    const p = params[i]
    if (p === 0) {
      state.bold = false
      state.dim = false
      state.fg = { kind: 'none' }
    } else if (p === 1) {
      state.bold = true
    } else if (p === 2) {
      state.dim = true
    } else if (p >= 30 && p <= 37) {
      state.fg = { kind: 'ansi16', base: ANSI16_TO_XTERM[p] }
    } else if (p >= 90 && p <= 97) {
      state.fg = { kind: 'xterm', idx: ANSI16_TO_XTERM[p] }
    } else if (p === 38 && params[i + 1] === 5) {
      // 38;5;N — extended fixed color. Consume the two following params.
      const n = params[i + 2]
      if (n !== undefined) state.fg = { kind: 'xterm', idx: n }
      i += 2
    } else if (p === 39) {
      state.fg = { kind: 'none' } // default foreground
    }
    // Unknown params (e.g. background colors, 38;2;r;g;b truecolor) ignored.
  }
}

function styleFromState(state: State, text: string): AnsiSpan {
  const span: AnsiSpan = { text }
  const color = resolveColor(state)
  if (color !== undefined) span.color = color
  if (state.bold) span.bold = true
  if (state.dim) span.dim = true
  return span
}

/**
 * Parse one line of ANSI into styled spans (pure / testable). OSC8 sequences are
 * stripped first (text-only); then we walk SGR escapes, emitting a span for each
 * run of text between escapes under the then-current style. Empty text runs are
 * not emitted. Unknown SGR params are ignored gracefully.
 */
export function ansiLineToSpans(line: string): AnsiSpan[] {
  const clean = line.replace(OSC8_RE, '')
  const spans: AnsiSpan[] = []
  const state = freshState()

  SGR_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = SGR_RE.exec(clean)) !== null) {
    const text = clean.slice(last, m.index)
    if (text.length > 0) spans.push(styleFromState(state, text))
    // Parse params: empty string ⇒ [0] (CSI m == CSI 0 m == reset).
    const raw = m[1]
    const params = raw === '' ? [0] : raw.split(';').map((s) => Number(s))
    applyParams(state, params)
    last = SGR_RE.lastIndex
  }
  const tail = clean.slice(last)
  if (tail.length > 0) spans.push(styleFromState(state, tail))
  return spans
}

// ---------------------------------------------------------------------------
// React rendering
// ---------------------------------------------------------------------------

/** Render one ANSI line as inline-styled <span>s. bold → fontWeight 700,
 *  dim → opacity 0.6, color → inline color. */
export function AnsiLine({ line }: { line: string }): JSX.Element {
  const spans = ansiLineToSpans(line)
  return (
    <>
      {spans.map((s, i) => (
        <span
          key={i}
          style={{
            color: s.color,
            fontWeight: s.bold ? 700 : undefined,
            opacity: s.dim ? 0.6 : undefined,
          }}
        >
          {s.text}
        </span>
      ))}
    </>
  )
}
