// SpanPlan — the language-agnostic plan for a segment's rendered value, mirror
// of the SegmentRender span list the preview builds. The shared segment logic
// (segments/shared.ts) produces a SpanPlan; each language Emitter serializes it
// into a concrete value expression via serializeSpanPlan + emitter primitives.

import type { TextStyle } from '../model/types'

/** A piece of a span's text content. */
export type TextPiece =
  | { kind: 'lit'; text: string } // literal known at generate time
  | { kind: 'var'; name: string } // a runtime string variable's value

/** One span: text pieces concatenated, wrapped in a style.
 *  - style undefined / yields no params → plain text (no escapes)
 *  - concrete style → baked SGR `\x1b[params m ... \x1b[0m`
 *  - threshold style → runtime `colorFn(pctVar)` for the color, with static
 *    bold/dim folded in by the wrap helper. */
export interface PlanSpan {
  pieces: TextPiece[]
  /** Concrete baked params (bold;dim;color). null = no styling. */
  concrete?: string | null
  /** Threshold styling: runtime color fn + percent var + static bold/dim. */
  threshold?: { fn: string; pctVar: string; boldDim: string }
}

/** A full segment value: an ordered list of spans (possibly empty → the
 *  segment is dropped from the row). */
export type SpanPlan = PlanSpan[]

// ---------------------------------------------------------------------------
// Span construction helpers (used by segments/shared.ts)
// ---------------------------------------------------------------------------

import { concreteParams, isThreshold, thresholdBoldDim } from './fragments'

/** Build a styled span from concrete (non-threshold) pieces. */
export function concreteSpan(pieces: TextPiece[], style: TextStyle | undefined): PlanSpan {
  return { pieces, concrete: concreteParams(style) }
}

/** Build a threshold span: the color resolves at runtime from `pctVar` via the
 *  named color fn; static bold/dim is folded in. */
export function thresholdSpan(
  pieces: TextPiece[],
  style: TextStyle,
  fn: string,
  pctVar: string,
): PlanSpan {
  return {
    pieces,
    threshold: { fn, pctVar, boldDim: thresholdBoldDim(style) ?? '' },
  }
}

/** Build a span honoring whichever kind of style is present. Threshold styles
 *  require fn + pctVar (the segment emitter supplies them). */
export function styledSpan(
  pieces: TextPiece[],
  style: TextStyle | undefined,
  resolve?: { fn: string; pctVar: string },
): PlanSpan {
  if (isThreshold(style) && resolve) {
    return thresholdSpan(pieces, style!, resolve.fn, resolve.pctVar)
  }
  return concreteSpan(pieces, style)
}

export const lit = (text: string): TextPiece => ({ kind: 'lit', text })
export const v = (name: string): TextPiece => ({ kind: 'var', name })
