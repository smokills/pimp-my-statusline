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
 *  `min(trunc(p*w/100), w)` — at w=5 this is exactly pct/20. */
export function barFill(p: number, w: number): number {
  return Math.min(Math.trunc((p * w) / 100), w)
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

export interface PeakResult {
  inPeak: boolean
  target: number // epoch sec: window end if inPeak, else next window start
}

interface PtWallClock {
  dow: number // ISO weekday 1..7 (Mon=1)
  h: number
  m: number
  s: number
}

/** Decompose an epoch into a timezone wall-clock (ISO weekday + h/m/s) using
 *  Intl only. NO Date-based day math — the rest of peakState is pure epoch
 *  arithmetic so it mirrors the portable bash implementation. */
function ptDecompose(nowEpochSec: number, tz: string): PtWallClock {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date(nowEpochSec * 1000))
  let weekday = ''
  let h = 0
  let m = 0
  let s = 0
  for (const p of parts) {
    if (p.type === 'weekday') weekday = p.value
    else if (p.type === 'hour') h = Number(p.value)
    else if (p.type === 'minute') m = Number(p.value)
    else if (p.type === 'second') s = Number(p.value)
  }
  // hour12:false can emit '24' at midnight in some engines — normalize to 0.
  if (h === 24) h = 0
  const dowMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  }
  return { dow: dowMap[weekday] ?? 1, h, m, s }
}

/**
 * Peak-window state. Window = `windowDays` (ISO dow) between `startHour` and
 * `endHour`, local to `tz`.
 *
 * Implementation: decompose `now` to PT wall-clock via Intl, then do pure epoch
 * arithmetic. `ptMidnight = now - (H*3600 + M*60 + S)` anchors local midnight
 * today; candidate day k = `ptMidnight + k*86400` has ISO dow
 * `((dowToday - 1 + k) % 7) + 1`. We scan k=0..7 forward for the next window
 * start, and check today for in-peak.
 *
 * The ±1h DST seam (when a window edge straddles a spring-forward / fall-back
 * transition, ptMidnight + k*86400 can be off by an hour) is ACCEPTED and not
 * corrected here — the generated scripts make the same approximation, so parity
 * holds.
 */
export function peakState(
  nowEpochSec: number,
  tz: string,
  windowDays: number[],
  startHour: number,
  endHour: number,
): PeakResult {
  const { dow, h, m, s } = ptDecompose(nowEpochSec, tz)
  const ptMidnight = nowEpochSec - (h * 3600 + m * 60 + s)
  const days = new Set(windowDays)

  const todayStart = ptMidnight + startHour * 3600
  const todayEnd = ptMidnight + endHour * 3600

  // In-peak iff today is a window day and now is within [start, end).
  if (days.has(dow) && nowEpochSec >= todayStart && nowEpochSec < todayEnd) {
    return { inPeak: true, target: todayEnd }
  }

  // Otherwise find the next window start, scanning forward (today included when
  // it is still before today's start).
  for (let k = 0; k <= 7; k++) {
    const dowK = ((dow - 1 + k) % 7) + 1
    if (!days.has(dowK)) continue
    const start = ptMidnight + k * 86400 + startHour * 3600
    if (start > nowEpochSec) {
      return { inPeak: false, target: start }
    }
  }

  // Unreachable for any non-empty windowDays, but keep total: fall back to a
  // full week ahead from today's start.
  return { inPeak: false, target: todayStart + 7 * 86400 }
}
