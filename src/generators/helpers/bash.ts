// Bash helper templates, keyed by HelperId, plus the threshold color()
// functions. Every ANSI sequence is a REAL ESC byte via $'\033[...m' literals;
// output is emitted with printf '%s\n' (NEVER echo -e / printf '%b') so runtime
// data (branch names etc.) is never reinterpreted.

import type { HelperId } from '../../model/segments'
import type { StatuslineConfig } from '../../model/types'
import type { ColorFn } from '../types'

/** color()/colorN(): echo the COLOR PARAMETER fragment for a percent, mirroring
 *  resolveThreshold (first stop sorted DESC by `at` with p >= at). ansi16 →
 *  the raw code; fixed → `38;5;N`. Prints nothing when no stop matches. */
export function bashColorFn(fn: ColorFn): string[] {
  const sorted = [...fn.stops].sort((a, b) => b.at - a.at)
  const lines: string[] = []
  lines.push(
    `# ${fn.name}(): threshold color param for a percentage (resolveThreshold tie-break:`,
  )
  lines.push('# first stop, sorted DESC by `at`, with p >= at).')
  lines.push(`${fn.name}() {`)
  lines.push('  local p=$1')
  let first = true
  for (const stop of sorted) {
    const param = stop.ansi16 ? String(stop.code) : `38;5;${stop.code}`
    const kw = first ? 'if' : 'elif'
    lines.push(`  ${kw} [ "$p" -ge ${stop.at} ]; then printf '%s' '${param}'`)
    first = false
  }
  if (!first) lines.push('  fi')
  lines.push('}')
  return lines
}

/** A runtime span wrapper: given static bold/dim params + a runtime color
 *  param, build the canonical ONE-escape span (or plain text when no params).
 *  Mirrors serializeSpan + styleToParams (bold;dim;color order). */
export function bashSgrWrap(): string[] {
  return [
    '# sgr_wrap <boldDim> <colorParams> <text>: canonical one-escape styled span',
    '# (param order bold;dim;color). Empty params => plain text, no escapes.',
    'ESC=$(printf "\\033")',
    'sgr_wrap() {',
    '  local bd="$1" col="$2" text="$3" params=""',
    '  if [ -n "$bd" ] && [ -n "$col" ]; then params="$bd;$col"',
    '  elif [ -n "$bd" ]; then params="$bd"',
    '  elif [ -n "$col" ]; then params="$col"',
    '  fi',
    '  if [ -z "$params" ]; then printf \'%s\' "$text"',
    '  else printf \'%s\' "${ESC}[${params}m${text}${ESC}[0m"; fi',
    '}',
  ]
}

const HELPER_TEMPLATES: Partial<Record<HelperId, () => string[]>> = {
  bar: () => [
    '# bar(): filled glyphs then empty glyphs to width w. filled = p*w/100',
    '# (bash integer arithmetic == Math.trunc for non-negative), clamped to w.',
    '# A non-zero p always lights at least the first cell (1% != 0%).',
    '# Guards the zero-count printf bug (printf \'X%.0s\' with no args prints ONE).',
    'bar() {',
    '  local p="$1" w="$2" filled="$3" empty="$4"',
    '  local f=$(( p * w / 100 ))',
    '  [ "$f" -gt "$w" ] && f="$w"',
    '  [ "$p" -gt 0 ] && [ "$f" -eq 0 ] && [ "$w" -gt 0 ] && f=1',
    '  local e=$(( w - f )) out=""',
    '  [ "$f" -gt 0 ] && out+=$(printf "${filled}%.0s" $(seq 1 "$f"))',
    '  [ "$e" -gt 0 ] && out+=$(printf "${empty}%.0s" $(seq 1 "$e"))',
    '  printf \'%s\' "$out"',
    '}',
  ],
  timeUntil: () => [
    '# time_until(): "${h}h${m}m" (h>0) or "${m}m"; EMPTY when target <= now.',
    'time_until() {',
    '  local target="$1" now="$2"',
    '  local secs=$(( target - now ))',
    '  [ "$secs" -le 0 ] && return 0',
    '  local h=$(( secs / 3600 )) m=$(( (secs % 3600) / 60 ))',
    '  if [ "$h" -gt 0 ]; then printf \'%sh%sm\' "$h" "$m"; else printf \'%sm\' "$m"; fi',
    '}',
  ],
  fmtDuration: () => [
    '# fmt_duration(): from milliseconds -> ${h}h${m}m / ${m}m${s}s / ${s}s.',
    'fmt_duration() {',
    '  local ms="$1"',
    '  local secs=$(( ms / 1000 ))',
    '  local h=$(( secs / 3600 )) m=$(( (secs % 3600) / 60 )) s=$(( secs % 60 ))',
    '  if [ "$h" -gt 0 ]; then printf \'%sh%sm\' "$h" "$m"',
    '  elif [ "$m" -gt 0 ]; then printf \'%sm%ss\' "$m" "$s"',
    '  else printf \'%ss\' "$s"; fi',
    '}',
  ],
  fmtCost: () => [
    '# fmt_cost(): $ + 2 decimals via C printf %.2f. LC_NUMERIC=C pins the decimal',
    '# point. NOTE: bash\'s builtin printf can disagree with glibc/python/node on',
    '# sub-ULP tie values (e.g. 2.685 whose exact double is 2.68500...0053): some',
    '# bash builds round it to 2.68 rather than 2.69. Real Claude Code costs are',
    '# many-digit sums and never land on such ties, so this is a non-issue in',
    '# practice; if you need exact agreement, format the cost upstream instead.',
    'fmt_cost() {',
    '  LC_NUMERIC=C printf \'$%.2f\' "$1"',
    '}',
  ],
  truncCols: () => [], // separator width clamp uses ${COLUMNS:-80} at the call site.
  gitBranch: () => [], // handled inline (env override) — no standalone helper.
}

export function bashHelper(id: HelperId, _config: StatuslineConfig): string[] {
  const tmpl = HELPER_TEMPLATES[id]
  if (!tmpl) return []
  return tmpl()
}
