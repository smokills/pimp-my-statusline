// Node helper templates (no deps). Strings use \x1b, double-quoted (no template
// literals in styled output). Math.trunc(Number(x)||0) + clamp; cost REPLICATES
// the model's fmtCost (toFixed(30)+BigInt ties-to-even) — toFixed alone is NOT
// acceptable. Peak via Intl.DateTimeFormat (ported verbatim from peakState).

import type { HelperId } from '../../model/segments'
import type { StatuslineConfig } from '../../model/types'
import type { ColorFn } from '../types'

export function nodeColorFn(fn: ColorFn): string[] {
  const sorted = [...fn.stops].sort((a, b) => b.at - a.at)
  const conds = sorted.map((stop) => {
    const param = stop.ansi16 ? String(stop.code) : `38;5;${stop.code}`
    return `p >= ${stop.at} ? "${param}"`
  })
  // threshold tie-break (first stop sorted DESC by at, p >= at); "" when none.
  return [
    `// ${fn.name}(): threshold color param (resolveThreshold tie-break).`,
    `const ${fn.name} = (p) => ${conds.length ? conds.join(' : ') + ' : ""' : '""'};`,
  ]
}

export function nodeSgrWrap(): string[] {
  return [
    '// canonical one-escape styled span (param order bold;dim;color);',
    '// empty params => plain text, no escapes.',
    'const sgr_wrap = (bd, col, text) => {',
    '  const params = [bd, col].filter(Boolean).join(";");',
    '  return params ? "\\x1b[" + params + "m" + text + "\\x1b[0m" : text;',
    '};',
  ]
}

const HELPER_TEMPLATES: Partial<Record<HelperId, () => string[]>> = {
  bar: () => [
    'const bar = (p, w, filled, empty) => {',
    '  const f = Math.min(Math.trunc((p * w) / 100), w);',
    '  return filled.repeat(f) + empty.repeat(w - f);',
    '};',
  ],
  timeUntil: () => [
    'const time_until = (target, now) => {',
    '  const secs = target - now;',
    '  if (secs <= 0) return "";',
    '  const h = Math.trunc(secs / 3600);',
    '  const m = Math.trunc((secs % 3600) / 60);',
    '  return h > 0 ? h + "h" + m + "m" : m + "m";',
    '};',
  ],
  fmtDuration: () => [
    'const fmt_duration = (ms) => {',
    '  const secs = Math.trunc(ms / 1000);',
    '  const h = Math.trunc(secs / 3600);',
    '  const m = Math.trunc((secs % 3600) / 60);',
    '  const s = secs % 60;',
    '  if (h > 0) return h + "h" + m + "m";',
    '  if (m > 0) return m + "m" + s + "s";',
    '  return s + "s";',
    '};',
  ],
  // Copied from src/model/evaluate-helpers.ts fmtCost (ties-to-even on the EXACT
  // IEEE double via toFixed(30) + BigInt). toFixed alone is NOT acceptable.
  fmtCost: () => [
    'const fmt_cost = (usd) => {',
    '  if (!Number.isFinite(usd)) usd = 0;',
    '  const neg = usd < 0;',
    '  const abs = Math.abs(usd);',
    '  const exact = abs.toFixed(30);',
    '  const dot = exact.indexOf(".");',
    '  const intPart = exact.slice(0, dot);',
    '  const frac = exact.slice(dot + 1);',
    '  const keep = frac.slice(0, 2);',
    '  const rest = frac.slice(2);',
    '  let cents = BigInt(intPart) * 100n + BigInt(keep);',
    '  const firstRest = rest.charAt(0);',
    '  if (firstRest !== "") {',
    '    const d = Number(firstRest);',
    '    if (d > 5) { cents += 1n; }',
    '    else if (d === 5) {',
    '      const tail = rest.slice(1).replace(/0+$/, "");',
    '      if (tail.length > 0) cents += 1n;',
    '      else if (cents % 2n === 1n) cents += 1n;',
    '    }',
    '  }',
    '  const sign = neg && cents !== 0n ? "-" : "";',
    '  const whole = cents / 100n;',
    '  const c = (cents % 100n).toString().padStart(2, "0");',
    '  return sign + "$" + whole.toString() + "." + c;',
    '};',
  ],
  truncCols: () => [], // separator width clamp uses COLUMNS at the call site.
  gitBranch: () => [], // env override handled inline.
  peak: () => [
    '// peak_decompose: wall-clock (ISO dow 1..7, h, m, s) of epoch in tz via',
    '// Intl.DateTimeFormat (ported verbatim from peakState/ptDecompose).',
    'const peak_decompose = (epoch, tz) => {',
    '  const fmt = new Intl.DateTimeFormat("en-US", {',
    '    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit",',
    '    second: "2-digit", hour12: false,',
    '  });',
    '  const parts = fmt.formatToParts(new Date(epoch * 1000));',
    '  let weekday = "", h = 0, m = 0, s = 0;',
    '  for (const p of parts) {',
    '    if (p.type === "weekday") weekday = p.value;',
    '    else if (p.type === "hour") h = Number(p.value);',
    '    else if (p.type === "minute") m = Number(p.value);',
    '    else if (p.type === "second") s = Number(p.value);',
    '  }',
    '  if (h === 24) h = 0;',
    '  const dowMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };',
    '  return [dowMap[weekday] || 1, h, m, s];',
    '};',
  ],
}

export function nodeHelper(id: HelperId, _config: StatuslineConfig): string[] {
  const tmpl = HELPER_TEMPLATES[id]
  return tmpl ? tmpl() : []
}
