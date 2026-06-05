// Shared segment helpers that are NOT language-specific: the `decorate`
// wrapper (emoji → label → prefix → value → suffix), mirroring segments.ts
// decorate() exactly, and the metric value-span builder. Extraction (jq / dict
// / optional chaining) is inherently language-specific and lives in each
// emitter; everything ABOVE the raw runtime variables is shared here so the
// three languages cannot drift on ordering or styling.

import type { MetricSegment, Segment, TextStyle } from '../../model/types'
import type { PlanSpan, TextPiece } from '../spanplan'
import { concreteSpan, lit, styledSpan, v } from '../spanplan'

/** A value span plus optional run-time presence condition (the metric/peak
 *  timer is present only when its countdown string is non-empty). When
 *  `whenVar` is set, the emitter wraps THIS span AND its leading separator in a
 *  runtime conditional. */
export interface ValueSpan {
  span: PlanSpan
  /** When set: render only if this runtime string var is non-empty. */
  whenVar?: string
}

/** Decorate value spans with emoji/label/prefix/suffix, mirroring
 *  segments.ts decorate(). Returns the full ordered span list. Emoji honors the
 *  GLOBAL emoji flag (baked at generate time) AND per-segment show. */
export function decorate(
  seg: Segment,
  globalEmoji: boolean,
  valueSpans: ValueSpan[],
): ValueSpan[] {
  const out: ValueSpan[] = []
  if (globalEmoji && seg.emoji?.show && seg.emoji.glyph) {
    out.push({ span: concreteSpan([lit(seg.emoji.glyph + ' ')], undefined) })
  }
  if (seg.label?.show && seg.label.text) {
    out.push({ span: concreteSpan([lit(seg.label.text + ' ')], seg.label.style) })
  }
  if (seg.prefix) out.push({ span: concreteSpan([lit(seg.prefix)], undefined) })
  out.push(...valueSpans)
  if (seg.suffix) out.push({ span: concreteSpan([lit(seg.suffix)], undefined) })
  return out
}

/** Build the metric value spans (bar / percent / timer) mirroring
 *  evaluateMetric(). `pctVar` holds the runtime truncated percent; `barExpr` is
 *  a runtime expression (variable name) holding the bar string; `timerVar`
 *  holds the runtime timer string (may be empty → part omitted). Single-space
 *  separators between rendered parts are encoded as literal ' ' spans that
 *  share the timer's runtime condition where they precede the timer. */
export function metricValueSpans(
  seg: MetricSegment,
  opts: {
    pctVar: string
    barVar: string // runtime var holding the bar string
    pctTextVar: string // runtime var holding "<pct>%"
    timerVar: string | null // runtime var holding "(timer)" body, or null if no timer part
    colorFnName: (stops: import('../../model/types').ThresholdStop[]) => string
  },
): ValueSpan[] {
  const spans: ValueSpan[] = []
  // Track whether anything has been emitted so far so the single-space
  // separators match evaluateMetric's "if value.length>0 push space".
  // Because bar/percent are always present when in `parts`, and timer is the
  // only conditional one, we can compute separator placement statically for
  // bar/percent and conditionally for timer.
  let emittedStatic = false

  for (const part of seg.parts) {
    if (part === 'bar') {
      if (emittedStatic) spans.push({ span: concreteSpan([lit(' ')], undefined) })
      spans.push({ span: metricStyled([v(opts.barVar)], seg.barStyle ?? seg.valueStyle, opts) })
      emittedStatic = true
    } else if (part === 'percent') {
      if (emittedStatic) spans.push({ span: concreteSpan([lit(' ')], undefined) })
      spans.push({ span: metricStyled([v(opts.pctTextVar)], seg.valueStyle, opts) })
      emittedStatic = true
    } else if (part === 'timer') {
      // Timer only meaningful for session/week (timerVar non-null) and only
      // when the runtime string is non-empty. The leading separator is part of
      // the conditional group iff something was already emitted.
      if (opts.timerVar === null) continue
      const tVar = opts.timerVar
      if (emittedStatic) {
        spans.push({
          span: concreteSpan([lit(' ')], undefined),
          whenVar: tVar,
        })
      }
      spans.push({
        span: timerSpan(tVar, seg.timerStyle),
        whenVar: tVar,
      })
      // NOTE: timer never sets emittedStatic for following parts because
      // metric parts after timer are not used by any preset; if they were, the
      // separator logic would need to account for the runtime-conditional
      // emission. We assert parts ordering keeps timer last (it always is).
    }
  }
  return spans
}

function metricStyled(
  pieces: TextPiece[],
  style: TextStyle | undefined,
  opts: { pctVar: string; colorFnName: (s: import('../../model/types').ThresholdStop[]) => string },
): PlanSpan {
  if (style?.color?.kind === 'threshold') {
    return styledSpan(pieces, style, {
      fn: opts.colorFnName(style.color.stops),
      pctVar: opts.pctVar,
    })
  }
  return concreteSpan(pieces, style)
}

/** The timer span wraps "(<timer>)" — note the parens are literal and the
 *  timer body is the runtime var. */
function timerSpan(timerVar: string, style: TextStyle | undefined): PlanSpan {
  return concreteSpan([lit('('), v(timerVar), lit(')')], style)
}
