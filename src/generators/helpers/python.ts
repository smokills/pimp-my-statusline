// Python helper templates (stdlib only). f-strings with \033 escapes; cost via
// '%.2f' % x (CPython rounds half-even on the double — matches printf). Percent
// via int(float(x or 0)) then clamp.

import type { HelperId } from '../../model/segments'
import type { StatuslineConfig } from '../../model/types'
import type { ColorFn } from '../types'

export function pyColorFn(fn: ColorFn): string[] {
  const sorted = [...fn.stops].sort((a, b) => b.at - a.at)
  const lines: string[] = []
  lines.push(`def ${fn.name}(p):`)
  lines.push(
    `    # threshold color param (resolveThreshold: first stop sorted DESC by at, p >= at)`,
  )
  for (const stop of sorted) {
    const param = stop.ansi16 ? String(stop.code) : `38;5;${stop.code}`
    lines.push(`    if p >= ${stop.at}: return '${param}'`)
  }
  lines.push(`    return ''`)
  return lines
}

export function pySgrWrap(): string[] {
  return [
    'def sgr_wrap(bd, col, text):',
    '    # canonical one-escape styled span (param order bold;dim;color);',
    '    # empty params => plain text, no escapes.',
    "    params = ';'.join(x for x in (bd, col) if x)",
    "    return f'\\033[{params}m{text}\\033[0m' if params else text",
  ]
}

const HELPER_TEMPLATES: Partial<Record<HelperId, () => string[]>> = {
  bar: () => [
    'def bar(p, w, filled, empty):',
    '    f = min(p * w // 100, w)',
    '    return filled * f + empty * (w - f)',
  ],
  timeUntil: () => [
    'def time_until(target, now):',
    '    secs = target - now',
    "    if secs <= 0: return ''",
    '    h = secs // 3600',
    '    m = (secs % 3600) // 60',
    "    return f'{h}h{m}m' if h > 0 else f'{m}m'",
  ],
  fmtDuration: () => [
    'def fmt_duration(ms):',
    '    secs = ms // 1000',
    '    h = secs // 3600',
    '    m = (secs % 3600) // 60',
    '    s = secs % 60',
    "    if h > 0: return f'{h}h{m}m'",
    "    if m > 0: return f'{m}m{s}s'",
    "    return f'{s}s'",
  ],
  fmtCost: () => [
    'def fmt_cost(usd):',
    "    # '%.2f' % x rounds the binary double ties-to-even (matches C printf).",
    "    return '$' + ('%.2f' % usd)",
  ],
  truncCols: () => [], // separator width clamp uses COLUMNS at the call site.
  gitBranch: () => [], // env override handled inline.
}

export function pyHelper(id: HelperId, _config: StatuslineConfig): string[] {
  const tmpl = HELPER_TEMPLATES[id]
  return tmpl ? tmpl() : []
}
