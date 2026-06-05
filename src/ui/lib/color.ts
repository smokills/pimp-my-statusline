// color.ts — UI helpers around ColorSpec ↔ xterm-256, plus recents persistence
// and the suggested palette seeded with the default preset's colors. The actual
// palette values come from the preview's XTERM256 (the terminal truth).

import type { ColorSpec, TextStyle } from '../../model/types'
import { XTERM256, ANSI16_TO_XTERM } from '../../preview/xterm256'

/** Resolve any ColorSpec (or undefined) to a hex string for a UI swatch.
 *  Threshold colors surface their highest-`at` stop. ansi16 is brightened when
 *  bold is active, mirroring the preview's resolveColor. */
export function colorSpecToHex(color: ColorSpec | undefined, bold = false): string {
  if (!color) return '#3b4250'
  if (color.kind === 'fixed') return XTERM256[color.code] ?? '#3b4250'
  if (color.kind === 'ansi16') {
    const base = ANSI16_TO_XTERM[color.code]
    if (base === undefined) return '#3b4250'
    const idx = base < 8 && bold ? base + 8 : base
    return XTERM256[idx] ?? '#3b4250'
  }
  // threshold: highest at wins for the swatch
  const sorted = [...color.stops].sort((a, b) => b.at - a.at)
  const top = sorted[0]
  if (!top) return '#3b4250'
  if (top.ansi16) {
    const base = ANSI16_TO_XTERM[top.code]
    return base !== undefined ? (XTERM256[base] ?? '#3b4250') : '#3b4250'
  }
  return XTERM256[top.code] ?? '#3b4250'
}

export function styleSwatchHex(style: TextStyle | undefined): string {
  return colorSpecToHex(style?.color, style?.bold)
}

/** Human name for the 16 standard ANSI colors. */
const ANSI16_NAMES: Record<number, string> = {
  0: 'black',
  1: 'red',
  2: 'green',
  3: 'yellow',
  4: 'blue',
  5: 'magenta',
  6: 'cyan',
  7: 'white',
  8: 'bright black',
  9: 'bright red',
  10: 'bright green',
  11: 'bright yellow',
  12: 'bright blue',
  13: 'bright magenta',
  14: 'bright cyan',
  15: 'bright white',
}

/** Accessible name for an xterm-256 index. */
export function colorName(index: number): string {
  if (index < 16) return ANSI16_NAMES[index] ?? `color ${index}`
  if (index >= 232) return `gray ${index - 232}`
  return `cube ${index}`
}

// ---------------------------------------------------------------------------
// Recents (localStorage, max 8)
// ---------------------------------------------------------------------------

const RECENTS_KEY = 'pms:recents:v1'
const MAX_RECENTS = 8

export function loadRecents(): number[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n) => typeof n === 'number' && n >= 0 && n <= 255).slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

export function pushRecent(index: number): number[] {
  const cur = loadRecents().filter((n) => n !== index)
  const next = [index, ...cur].slice(0, MAX_RECENTS)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

/** Suggested swatches — the default preset's palette as xterm indices.
 *  bold-blue dir(12), bold-green branch(10), cyan(6), magenta(5), dim white(7),
 *  and the threshold trio resolved to bright red(9)/yellow(11)/green(10). */
export const SUGGESTED_COLORS: readonly number[] = [12, 10, 6, 5, 7, 9, 11, 2]
