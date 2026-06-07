// Pure evaluation helpers — THE shared semantics. The bash/python/node
// generators (later phase) mirror these byte-for-byte, so the math and the
// string formats here are load-bearing. Everything here is deterministic and
// side-effect free; time always flows in via an explicit `now`/`nowEpochSec`
// argument (never the real clock).

import type { ThresholdStop } from './types'

/** Math.trunc, clamped to [0,100]; null/undefined → 0. Matches the user's
 *  script (`// 0 | floor` / `int(float(x))` / `Math.trunc`). */
export function truncPct(x: number | null | undefined): number {
  if (x == null || Number.isNaN(x)) return 0
  const t = Math.trunc(x)
  if (t < 0) return 0
  if (t > 100) return 100
  return t
}

/** Filled-cell count for a bar of width `w` at percentage `p`.
 *  `min(trunc(p*w/100), w)`, but any non-zero metric lights at least the first
 *  cell, so 1% never looks identical to 0%. Empty means truly zero. */
export function barFill(p: number, w: number): number {
  const f = Math.min(Math.trunc((p * w) / 100), w)
  return p > 0 && f === 0 && w > 0 ? 1 : f
}

/** Render a bar string: `filled` glyphs then `empty` glyphs to width `w`. */
export function barString(
  p: number,
  w: number,
  filled: string,
  empty: string,
): string {
  const f = barFill(p, w)
  return filled.repeat(f) + empty.repeat(w - f)
}

/** Countdown string `${h}h${m}m` (h>0) or `${m}m`, EMPTY when target ≤ now.
 *  h=trunc(secs/3600), m=trunc((secs%3600)/60). Exactly the script's format. */
export function timeUntil(target: number, now: number): string {
  const secs = target - now
  if (secs <= 0) return ''
  const h = Math.trunc(secs / 3600)
  const m = Math.trunc((secs % 3600) / 60)
  return h > 0 ? `${h}h${m}m` : `${m}m`
}

/** Format a duration given in milliseconds: `${h}h${m}m` / `${m}m${s}s` / `${s}s`. */
export function fmtDuration(ms: number): string {
  const secs = Math.trunc(ms / 1000)
  const h = Math.trunc(secs / 3600)
  const m = Math.trunc((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}

/**
 * Format a USD cost: `$` + 2 decimals, with C-`printf '%.2f'` rounding.
 *
 * CANONICAL RULE — ALL targets MUST produce C-printf `%.2f` semantics:
 *   - bash:   `LC_NUMERIC=C printf '%.2f' <x>`
 *   - python: `'%.2f' % <x>`
 *   - node:   MUST mirror THIS function (round-half-to-EVEN on the EXACT IEEE
 *             double value) — NOT `toFixed` (decimal half-up: 0.125→'0.13' ✗)
 *             and NOT `Intl.NumberFormat({roundingMode:'halfEven'})` (rounds the
 *             decimal LITERAL, so 2.675→'2.68' ✗ where printf yields '2.67').
 *
 * printf rounds the binary double, so e.g. 2.675 is really 2.67499…824 → 2.67.
 * We reproduce that by taking the decimal expansion of the double via
 * `toFixed(30)` — NOT the full expansion (true expansions run 40-60 fractional
 * digits), but its ~1e-30 rounding error sits far below any digit that can
 * influence the 2nd-decimal rounding decision for bounded cost values, and it
 * cannot fabricate or destroy an exact …5000…0 tie (ties only occur for
 * dyadic doubles whose expansions terminate well before 30 places). Then we
 * round at the 2nd decimal ties-to-even. Verified byte-identical to `LC_NUMERIC=C
 * printf '%.2f'` across 0.125/0.135/2.675/2.685/0.005/0.015/0.025/0.035/1.005/
 * 12.875/0.999/1.999/99.995/0.42/0.
 */
export function fmtCost(usd: number): string {
  if (!Number.isFinite(usd)) usd = 0
  const neg = usd < 0
  const abs = Math.abs(usd)

  // Decimal digits of the double to 30 places — deep enough that the
  // 2nd-decimal rounding decision is unaffected (see docstring).
  const exact = abs.toFixed(30)
  const dot = exact.indexOf('.')
  const intPart = exact.slice(0, dot)
  const frac = exact.slice(dot + 1)
  const keep = frac.slice(0, 2) // first 2 decimal digits
  const rest = frac.slice(2) // remainder, drives the tie-break

  let cents = BigInt(intPart) * 100n + BigInt(keep)
  const firstRest = rest.charAt(0)
  if (firstRest !== '') {
    const d = Number(firstRest)
    if (d > 5) {
      cents += 1n
    } else if (d === 5) {
      const tail = rest.slice(1).replace(/0+$/, '')
      if (tail.length > 0) cents += 1n // strictly > .5 → round up
      else if (cents % 2n === 1n) cents += 1n // exactly .5 → ties to even
    }
  }

  const sign = neg && cents !== 0n ? '-' : ''
  const whole = cents / 100n
  const c = (cents % 100n).toString().padStart(2, '0')
  return `${sign}$${whole.toString()}.${c}`
}

/** First stop (sorted DESCENDING by `at`) whose `at <= pct` wins; null if none.
 *  The preview AND each generator (bash/python/node) MUST mirror this exact
 *  tie-break: first stop, sorted descending by `at`, with `pct >= at`. */
export function resolveThreshold(
  stops: ThresholdStop[],
  pct: number,
): ThresholdStop | null {
  const sorted = [...stops].sort((a, b) => b.at - a.at)
  for (const stop of sorted) {
    if (pct >= stop.at) return stop
  }
  return null
}

