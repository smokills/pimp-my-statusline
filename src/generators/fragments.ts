// Style → SGR-param helpers, mirroring src/preview/renderToAnsi.ts EXACTLY.
// The segment emitters build a SpanPlan (spanplan.ts) whose styling is resolved
// through these functions, so the generated scripts and the preview agree on
// the canonical serialization (param order bold;dim;color; ansi16 = code,
// fixed = 38;5;code; threshold resolved at runtime via a color() fn).

import type { TextStyle } from '../model/types'

/** Baked SGR params for a CONCRETE style (non-threshold), or null when the
 *  style yields no params (⇒ plain text, no escapes). Param order: bold (1),
 *  dim (2), then color (ansi16 = code, fixed = 38;5;code). Threshold colors are
 *  NOT handled here — the caller routes them to the runtime color() fn. */
export function concreteParams(style: TextStyle | undefined): string | null {
  if (!style) return null
  const params: string[] = []
  if (style.bold) params.push('1')
  if (style.dim) params.push('2')
  const color = style.color
  if (color) {
    if (color.kind === 'ansi16') params.push(String(color.code))
    else if (color.kind === 'fixed') params.push(`38;5;${color.code}`)
    // threshold is handled by the caller, never here.
  }
  return params.length > 0 ? params.join(';') : null
}

/** True when this style is a threshold color (the caller routes it to runtime). */
export function isThreshold(style: TextStyle | undefined): boolean {
  return style?.color?.kind === 'threshold'
}

/** The bold/dim prefix params for a threshold style, emitted BEFORE the runtime
 *  color (mirrors the bold;dim;color order). Returns "1" / "2" / "1;2" / null. */
export function thresholdBoldDim(style: TextStyle | undefined): string | null {
  if (!style) return null
  const params: string[] = []
  if (style.bold) params.push('1')
  if (style.dim) params.push('2')
  return params.length > 0 ? params.join(';') : null
}
