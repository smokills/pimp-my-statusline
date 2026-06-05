// Bash emitter. Produces a readable, hand-editable POSIX-ish bash script that
// reads the Claude Code statusline JSON on stdin and prints the same bytes the
// preview's renderToAnsi produces.
//
// PORTABILITY (each rule was a real found defect — see the generated comments):
//  - shebang /usr/bin/env bash
//  - jq preflight, exit 0 (so CC never shows a broken statusline)
//  - ALL ANSI via real ESC bytes ($'\033[...m'); output via printf '%s\n' —
//    NEVER echo -e / printf '%b' (those reinterpret backslashes in runtime
//    data like branch names; with real ESC bytes %s is byte-exact and safe)
//  - NEVER date -d "<string>"; clock from PMSL_NOW; wall-clock via date -d @ /
//    -r fallback; peak is pure epoch arithmetic
//  - percent via jq floor (never cut -d.), then clamp
//  - bar guards the zero-count printf
//  - cost via LC_NUMERIC=C printf '%.2f'
//  - git branch via PMSL_GIT_BRANCH override (- not :-, so empty overrides)

import type { HelperId } from '../model/segments'
import type {
  LinesSegment,
  MetricSegment,
  PeakSegment,
  Segment,
  SeparatorSegment,
  SimpleSegment,
  StaticTextSegment,
  DirectorySegment,
  PrSegment,
  TextStyle,
} from '../model/types'
import type { Emitter, RowPlan, SegmentEmitCtx } from './types'
import type { PlanSpan, TextPiece } from './spanplan'
import { concreteSpan, lit, v } from './spanplan'
import { concreteParams } from './fragments'
import { decorate, metricValueSpans, type ValueSpan } from './segments/ir'
import { bashColorFn, bashHelper, bashSgrWrap } from './helpers/bash'
import { emitBashPet, emitBashPetCompose } from './pets/bash'
import { SEGMENT_COMMENT } from './segments/labels'

// ---------------------------------------------------------------------------
// Bash literal escaping
// ---------------------------------------------------------------------------

/** Escape text for a bash DOUBLE-quoted context. Backslash, $, `, " escaped. */
function dq(text: string): string {
  return text.replace(/[\\$`"]/g, (c) => '\\' + c)
}

/** Escape text for a bash SINGLE-quoted context ('...'): a single quote becomes
 *  '\'' . Everything else is literal. */
function sq(text: string): string {
  return text.replace(/'/g, `'\\''`)
}

/** A $'\033[params m' ANSI-C literal (real ESC byte). */
function esc(params: string): string {
  return `$'\\033[${params}m'`
}

// ---------------------------------------------------------------------------
// SpanPlan -> bash double-quoted concatenation expression
// ---------------------------------------------------------------------------

/** Serialize text pieces into a bash double-quoted body (no surrounding quotes
 *  added here). */
function piecesToDq(pieces: TextPiece[]): string {
  let out = ''
  for (const p of pieces) {
    if (p.kind === 'lit') out += dq(p.text)
    else out += `\${${p.name}}`
  }
  return out
}

/** Serialize one span to a bash expression fragment (concatenated with the
 *  rest via adjacency inside one double-quoted string where possible). Returns
 *  a string that is a sequence of double-quoted / $'...' / $(...) fragments. */
function bashSpan(span: PlanSpan): string {
  const body = piecesToDq(span.pieces)
  if (span.threshold) {
    const { fn, pctVar, boldDim } = span.threshold
    // sgr_wrap '<boldDim>' "$(<fn> "$<pctVar>")" "<body>"
    return `"$(sgr_wrap '${boldDim}' "$(${fn} "$${pctVar}")" "${body}")"`
  }
  if (span.concrete) {
    return `${esc(span.concrete)}"${body}"${esc('0')}`
  }
  // plain text, no escapes
  return `"${body}"`
}

/** Serialize a whole list of value spans into the RHS of an assignment, honoring
 *  runtime-conditional spans (the metric/peak timer). */
function assignSpans(outVar: string, spans: ValueSpan[]): string[] {
  // Static (always-present) spans first → one assignment; conditional groups
  // appended afterwards. We preserve ORDER: emit statics that precede a
  // conditional, then the conditional, then continue. Since conditionals only
  // ever appear at the tail (timer is last), we build the static prefix then
  // append conditionals.
  const lines: string[] = []
  const staticParts: string[] = []
  const conditionals: { whenVar: string; parts: string[] }[] = []

  // Group consecutive conditional spans sharing the same whenVar.
  let i = 0
  while (i < spans.length) {
    const s = spans[i]
    if (!s.whenVar) {
      staticParts.push(bashSpan(s.span))
      i++
    } else {
      const when = s.whenVar
      const group: string[] = []
      while (i < spans.length && spans[i].whenVar === when) {
        group.push(bashSpan(spans[i].span))
        i++
      }
      conditionals.push({ whenVar: when, parts: group })
    }
  }

  lines.push(`${outVar}=${staticParts.length > 0 ? staticParts.join('') : `''`}`)
  for (const c of conditionals) {
    lines.push(`[ -n "$${c.whenVar}" ] && ${outVar}+=${c.parts.join('')}`)
  }
  return lines
}

// ---------------------------------------------------------------------------
// Extraction helpers (bash)
// ---------------------------------------------------------------------------

/** A jq path string for an object path like ['model','display_name']. */
function jqPath(path: string[]): string {
  return '.' + path.map((k) => k).join('.')
}

// ---------------------------------------------------------------------------
// Per-segment emit
// ---------------------------------------------------------------------------

function emitSimple(seg: SimpleSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  const tmp = `_${seg.type}`
  const globalEmoji = ctx.config.global.emoji
  lines.push(`# --- ${SEGMENT_COMMENT[seg.type]} ---`)

  if (seg.type === 'gitBranch') {
    lines.push(
      `${tmp}="\${PMSL_GIT_BRANCH-$(git -C "$DIR" branch --show-current 2>/dev/null)}"`,
    )
    lines.push(...guardNonEmpty(tmp, out, seg, globalEmoji, ctx, [v(tmp)], seg.style))
    return lines
  }
  if (seg.type === 'cost') {
    lines.push(`if [ "$(jq -r 'has("cost")' <<<"$input")" = "true" ]; then`)
    lines.push(`  ${tmp}=$(jq -r '.cost.total_cost_usd // 0' <<<"$input")`)
    lines.push(`  ${tmp}=$(fmt_cost "$${tmp}")`)
    lines.push(...indent(assignDecorated(out, seg, globalEmoji, ctx, [v(tmp)], seg.style)))
    lines.push('else')
    lines.push(`  ${out}=''`)
    lines.push('fi')
    return lines
  }
  if (seg.type === 'duration') {
    lines.push(`if [ "$(jq -r 'has("cost")' <<<"$input")" = "true" ]; then`)
    lines.push(`  ${tmp}=$(jq -r '.cost.total_duration_ms // 0' <<<"$input")`)
    lines.push(`  ${tmp}=$(fmt_duration "$${tmp}")`)
    lines.push(...indent(assignDecorated(out, seg, globalEmoji, ctx, [v(tmp)], seg.style)))
    lines.push('else')
    lines.push(`  ${out}=''`)
    lines.push('fi')
    return lines
  }

  // String-valued simple segments.
  const path = simplePath(seg.type)
  if (seg.type === 'thinking') {
    lines.push(`${tmp}=$(jq -r 'if (.thinking.enabled // false) then "thinking" else empty end' <<<"$input")`)
  } else {
    lines.push(`${tmp}=$(jq -r '${jqPath(path)} // empty' <<<"$input")`)
  }
  lines.push(...guardNonEmpty(tmp, out, seg, globalEmoji, ctx, [v(tmp)], seg.style))
  return lines
}

function simplePath(type: SimpleSegment['type']): string[] {
  switch (type) {
    case 'model':
      return ['model', 'display_name']
    case 'effort':
      return ['effort', 'level']
    case 'outputStyle':
      return ['output_style', 'name']
    case 'vimMode':
      return ['vim', 'mode']
    case 'sessionName':
      return ['session_name']
    case 'agent':
      return ['agent', 'name']
    case 'version':
      return ['version']
    case 'worktree':
      return ['worktree', 'name']
    default:
      return []
  }
}

/** Emit an `if [ -n "$tmp" ]` guard wrapping a decorated assignment. */
function guardNonEmpty(
  tmp: string,
  out: string,
  seg: Segment,
  globalEmoji: boolean,
  ctx: SegmentEmitCtx,
  pieces: TextPiece[],
  style: TextStyle | undefined,
): string[] {
  const lines: string[] = []
  lines.push(`if [ -n "$${tmp}" ]; then`)
  lines.push(...indent(assignDecorated(out, seg, globalEmoji, ctx, pieces, style)))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

/** Build + assign a decorated single-value segment. */
function assignDecorated(
  out: string,
  seg: Segment,
  globalEmoji: boolean,
  _ctx: SegmentEmitCtx,
  pieces: TextPiece[],
  style: TextStyle | undefined,
): string[] {
  const valueSpans: ValueSpan[] = [{ span: concreteSpan(pieces, style) }]
  const all = decorate(seg, globalEmoji, valueSpans)
  return assignSpans(out, all)
}

function emitDirectory(seg: DirectorySegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  const tmp = '_dir'
  lines.push(`# --- ${SEGMENT_COMMENT.directory} ---`)
  // cwd ?? workspace.current_dir ?? ''
  lines.push(
    `${tmp}=$(jq -r '.cwd // .workspace.current_dir // empty' <<<"$input")`,
  )
  lines.push(`_disp="$${tmp}"`)
  if (seg.dirStyle === 'basename') {
    lines.push(`_disp="\${_disp%/}"; _disp="\${_disp##*/}"`)
    lines.push(`[ -z "$_disp" ] && _disp="$${tmp}"`)
  } else if (seg.dirStyle === 'tildeHome') {
    // $HOME at runtime; matches preview's home substitution.
    lines.push(`if [ "$_disp" = "$HOME" ]; then _disp="~"`)
    lines.push(`elif [ "\${_disp#"$HOME"/}" != "$_disp" ]; then _disp="~\${_disp#"$HOME"}"; fi`)
  }
  lines.push(`if [ -n "$${tmp}" ]; then`)
  lines.push(...indent(assignDecorated(out, seg, ctx.config.global.emoji, ctx, [v('_disp')], seg.style)))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

function emitMetric(seg: MetricSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  lines.push(`# --- ${SEGMENT_COMMENT[seg.type]} ---`)
  const pVar = `_${seg.type}_p`
  const barVar = `_${seg.type}_bar`
  const pctTextVar = `_${seg.type}_pct`
  const timerVar = seg.type === 'context' ? null : `_${seg.type}_timer`

  // Presence guard: the SOURCE OBJECT.
  const presentExpr = metricPresentExpr(seg.type)
  lines.push(`if ${presentExpr}; then`)
  // percent (floor + clamp).
  lines.push(`  ${pVar}=$(jq -r '${metricPctPath(seg.type)} // 0 | floor' <<<"$input")`)
  lines.push(`  [ "$${pVar}" -lt 0 ] && ${pVar}=0; [ "$${pVar}" -gt 100 ] && ${pVar}=100`)
  // bar string (only if a bar part exists).
  if (seg.parts.includes('bar')) {
    lines.push(
      `  ${barVar}=$(bar "$${pVar}" ${seg.barWidth} '${sq(seg.barChars.filled)}' '${sq(seg.barChars.empty)}')`,
    )
  }
  if (seg.parts.includes('percent')) {
    lines.push(`  ${pctTextVar}="$${pVar}%"`)
  }
  // timer (session/week with a timer part).
  if (timerVar && seg.parts.includes('timer')) {
    lines.push(`  ${seg.type}_reset=$(jq -r '${metricResetPath(seg.type)} // empty' <<<"$input")`)
    lines.push(`  if [ -n "$${seg.type}_reset" ]; then ${timerVar}=$(time_until "$${seg.type}_reset" "$NOW"); else ${timerVar}=''; fi`)
  }

  const valueSpans = metricValueSpans(seg, {
    pctVar: pVar,
    barVar,
    pctTextVar,
    timerVar: seg.parts.includes('timer') ? timerVar : null,
    colorFnName: ctx.colorFnName,
  })
  const all = decorate(seg, ctx.config.global.emoji, valueSpans)
  lines.push(...indent(assignSpans(out, all)))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

function metricPresentExpr(type: 'context' | 'session' | 'week'): string {
  if (type === 'context') {
    return `[ "$(jq -r 'has("context_window")' <<<"$input")" = "true" ]`
  }
  const bucket = type === 'session' ? 'five_hour' : 'seven_day'
  return `[ "$(jq -r '(.rate_limits // {}) | has("${bucket}")' <<<"$input")" = "true" ]`
}
function metricPctPath(type: 'context' | 'session' | 'week'): string {
  if (type === 'context') return '.context_window.used_percentage'
  const bucket = type === 'session' ? 'five_hour' : 'seven_day'
  return `.rate_limits.${bucket}.used_percentage`
}
function metricResetPath(type: 'context' | 'session' | 'week'): string {
  const bucket = type === 'session' ? 'five_hour' : 'seven_day'
  return `.rate_limits.${bucket}.resets_at`
}

function emitPeak(seg: PeakSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  lines.push(`# --- ${SEGMENT_COMMENT.peak} ---`)
  lines.push('# Peak window: decompose NOW under TZ, then PURE epoch arithmetic')
  lines.push('# (ptMidnight = NOW - (h*3600+m*60+s)). DST seam +-1h accepted.')
  const days = seg.windowDays.join(' ')
  lines.push(`read -r _pk_dow _pk_h _pk_m _pk_s < <(peak_decompose "$NOW" '${sq(seg.tz)}')`)
  lines.push(`_pk_mid=$(( NOW - (_pk_h*3600 + _pk_m*60 + _pk_s) ))`)
  lines.push(`_pk_today_start=$(( _pk_mid + ${seg.startHour}*3600 ))`)
  lines.push(`_pk_today_end=$(( _pk_mid + ${seg.endHour}*3600 ))`)
  lines.push(`_pk_in=0; _pk_target=0`)
  lines.push(`_pk_days=" ${days} "`)
  lines.push(
    `if [[ "$_pk_days" == *" $_pk_dow "* ]] && [ "$NOW" -ge "$_pk_today_start" ] && [ "$NOW" -lt "$_pk_today_end" ]; then`,
  )
  lines.push('  _pk_in=1; _pk_target=$_pk_today_end')
  lines.push('else')
  lines.push('  for _pk_k in 0 1 2 3 4 5 6 7; do')
  lines.push('    _pk_dk=$(( (_pk_dow - 1 + _pk_k) % 7 + 1 ))')
  lines.push('    [[ "$_pk_days" == *" $_pk_dk "* ]] || continue')
  lines.push(`    _pk_start=$(( _pk_mid + _pk_k*86400 + ${seg.startHour}*3600 ))`)
  lines.push('    if [ "$_pk_start" -gt "$NOW" ]; then _pk_target=$_pk_start; break; fi')
  lines.push('  done')
  lines.push('  [ "$_pk_target" -eq 0 ] && _pk_target=$(( _pk_today_start + 7*86400 ))')
  lines.push('fi')

  // Value spans: "Peak"/"Off-peak" styled, then optional dim countdown.
  lines.push('if [ "$_pk_in" -eq 1 ]; then _pk_label=Peak; else _pk_label=Off-peak; fi')
  const peakStyleParams = concreteParamsOf(seg.peakStyle)
  const offStyleParams = concreteParamsOf(seg.offPeakStyle)
  // Build the label span with the right style depending on in-peak (static
  // params each); choose at runtime.
  lines.push(
    `if [ "$_pk_in" -eq 1 ]; then _pk_lbl=${spanLiteral('_pk_label', peakStyleParams)}; else _pk_lbl=${spanLiteral('_pk_label', offStyleParams)}; fi`,
  )

  // Compose value: label (already styled in _pk_lbl) + optional countdown.
  const decoratedPrefix = decoratePrefixSpans(seg, ctx.config.global.emoji)
  // Assemble: out = prefixSpans + _pk_lbl + [conditional countdown]
  const parts: string[] = []
  for (const ps of decoratedPrefix) parts.push(bashSpan(ps.span))
  parts.push('"$_pk_lbl"')
  lines.push(`${out}=${parts.length ? parts.join('') : `''`}`)

  if (seg.showCountdown) {
    lines.push('_pk_cd=$(time_until "$_pk_target" "$NOW")')
    // dim parens countdown: " " + "(cd)" dim.
    const sep = bashSpan(concreteSpan([lit(' ')], undefined))
    const cd = bashSpan(concreteSpan([lit('('), v('_pk_cd'), lit(')')], { dim: true }))
    lines.push(`[ -n "$_pk_cd" ] && ${out}+=${sep}${cd}`)
  }
  // suffix
  if (seg.suffix) {
    lines.push(`${out}+=${bashSpan(concreteSpan([lit(seg.suffix)], undefined))}`)
  }
  return lines
}

/** A span literal: $'\033[params m'"${var}"$'\033[0m' or plain "${var}". */
function spanLiteral(varName: string, params: string | null): string {
  if (params) return `${esc(params)}"$${varName}"${esc('0')}`
  return `"$${varName}"`
}

function concreteParamsOf(style: TextStyle | undefined): string | null {
  return concreteParams(style)
}

/** Emoji + label + prefix decorate spans (NO value, NO suffix) for segments
 *  whose value we build manually (peak). */
function decoratePrefixSpans(seg: Segment, globalEmoji: boolean): ValueSpan[] {
  const out: ValueSpan[] = []
  if (globalEmoji && seg.emoji?.show && seg.emoji.glyph) {
    out.push({ span: concreteSpan([lit(seg.emoji.glyph + ' ')], undefined) })
  }
  if (seg.label?.show && seg.label.text) {
    out.push({ span: concreteSpan([lit(seg.label.text + ' ')], seg.label.style) })
  }
  if (seg.prefix) out.push({ span: concreteSpan([lit(seg.prefix)], undefined) })
  return out
}

function emitLines(seg: LinesSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  lines.push(`# --- ${SEGMENT_COMMENT.lines} ---`)
  lines.push(`if [ "$(jq -r 'has("cost")' <<<"$input")" = "true" ]; then`)
  lines.push(`  _ln_add=$(jq -r '.cost.total_lines_added // 0' <<<"$input")`)
  lines.push(`  _ln_rem=$(jq -r '.cost.total_lines_removed // 0' <<<"$input")`)
  const value: ValueSpan[] = []
  if (seg.linesStyle === 'addedOnly') {
    value.push({ span: concreteSpan([lit('+'), v('_ln_add')], seg.addedStyle) })
  } else if (seg.linesStyle === 'removedOnly') {
    value.push({ span: concreteSpan([lit('-'), v('_ln_rem')], seg.removedStyle) })
  } else {
    value.push({ span: concreteSpan([lit('+'), v('_ln_add')], seg.addedStyle) })
    value.push({ span: concreteSpan([lit(' ')], undefined) })
    value.push({ span: concreteSpan([lit('-'), v('_ln_rem')], seg.removedStyle) })
  }
  const all = decorate(seg, ctx.config.global.emoji, value)
  lines.push(...indent(assignSpans(out, all)))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

function emitPr(seg: PrSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  lines.push(`# --- ${SEGMENT_COMMENT.pr} ---`)
  lines.push(`if [ "$(jq -r 'has("pr")' <<<"$input")" = "true" ]; then`)
  lines.push(`  _pr_num=$(jq -r '.pr.number // empty' <<<"$input")`)
  lines.push(`  _pr_state=$(jq -r '.pr.review_state // empty' <<<"$input")`)
  const value: ValueSpan[] = [{ span: concreteSpan([lit('#'), v('_pr_num')], seg.style) }]
  if (seg.showState) {
    value.push({ span: concreteSpan([lit(' ')], undefined), whenVar: '_pr_state' })
    value.push({ span: concreteSpan([v('_pr_state')], seg.style), whenVar: '_pr_state' })
  }
  const all = decorate(seg, ctx.config.global.emoji, value)
  lines.push(...indent(assignSpans(out, all)))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

function emitSeparator(seg: SeparatorSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  lines.push(`# --- ${SEGMENT_COMMENT.separator} ---`)
  if (seg.width === 'full') {
    lines.push(`_sep_w="\${COLUMNS:-80}"`)
  } else {
    lines.push(`_sep_w=${seg.width}`)
  }
  lines.push(`if [ "$_sep_w" -gt 0 ] && [ -n '${sq(seg.fill)}' ]; then`)
  lines.push(`  _sep=$(printf '${sq(seg.fill)}%.0s' $(seq 1 "$_sep_w"))`)
  lines.push(...indent(assignDecorated(out, seg, ctx.config.global.emoji, ctx, [v('_sep')], seg.style)))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

function emitStaticText(seg: StaticTextSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  lines.push(`# --- ${SEGMENT_COMMENT.staticText} ---`)
  if (seg.text === '') {
    lines.push(`${out}=''`)
    return lines
  }
  const all = decorate(seg, ctx.config.global.emoji, [
    { span: concreteSpan([lit(seg.text)], seg.style) },
  ])
  lines.push(...assignSpans(out, all))
  return lines
}

// ---------------------------------------------------------------------------
// utilities
// ---------------------------------------------------------------------------

function indent(lines: string[]): string[] {
  return lines.map((l) => (l === '' ? l : '  ' + l))
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

export const bashEmitter: Emitter = {
  lang: 'bash',

  shebang() {
    return '#!/usr/bin/env bash'
  },

  preamble() {
    return [
      '# Generated by pimp-my-statusline. Hand-editable; the marker line above is',
      '# the source of truth for re-import (edits to the body are not round-tripped).',
      '#',
      '# Output uses real ESC bytes (via $\\047...\\047 ANSI-C quoting) printed with',
      "# the %s format. We deliberately avoid the escape-interpreting echo and printf",
      '# formats, which would reinterpret backslashes in runtime data (branch names etc.).',
      '',
      'command -v jq >/dev/null 2>&1 || { echo "statusline: jq not found (brew install jq / apt-get install jq)"; exit 0; }',
      '',
      'input=$(cat)',
      '# Injectable clock (PMSL_NOW) so output is reproducible/testable.',
      'NOW="${PMSL_NOW:-$(date +%s)}"',
      '# Working dir for git branch detection.',
      'DIR=$(jq -r \'.cwd // .workspace.current_dir // empty\' <<<"$input")',
    ]
  },

  baseHelpers(needsThreshold) {
    if (!needsThreshold) return []
    return bashSgrWrap()
  },

  colorFn(fn) {
    return bashColorFn(fn)
  },

  helper(id: HelperId, config) {
    return bashHelper(id, config)
  },

  petBlock(config) {
    return emitBashPet(config)
  },

  segment(seg: Segment, ctx: SegmentEmitCtx) {
    switch (seg.type) {
      case 'directory':
        return emitDirectory(seg as DirectorySegment, ctx)
      case 'context':
      case 'session':
      case 'week':
        return emitMetric(seg as MetricSegment, ctx)
      case 'peak':
        return emitPeak(seg as PeakSegment, ctx)
      case 'lines':
        return emitLines(seg as LinesSegment, ctx)
      case 'pr':
        return emitPr(seg as PrSegment, ctx)
      case 'separator':
        return emitSeparator(seg as SeparatorSegment, ctx)
      case 'staticText':
        return emitStaticText(seg as StaticTextSegment, ctx)
      default:
        return emitSimple(seg as SimpleSegment, ctx)
    }
  },

  assembleRows(config, rows: RowPlan[]) {
    const lines: string[] = []
    lines.push('# --- Row assembly ---')
    lines.push(
      '# A dropped (empty) segment contributes NOTHING, including its join.',
    )
    for (const plan of rows) {
      lines.push(`${plan.rowVar}=''`)
      for (let i = 0; i < plan.segments.length; i++) {
        const ps = plan.segments[i]
        const join = (ps.seg.joinBefore ?? plan.joiner)
        if (i === 0) {
          lines.push(`[ -n "$${ps.varName}" ] && ${plan.rowVar}="$${ps.varName}"`)
        } else {
          const joinLit = `"${dq(join)}"`
          lines.push(
            `[ -n "$${ps.varName}" ] && { [ -n "$${plan.rowVar}" ] && ${plan.rowVar}+=${joinLit}; ${plan.rowVar}+="$${ps.varName}"; }`,
          )
        }
      }
    }
    lines.push('')
    if (config.pet.enabled) {
      lines.push(...emitBashPetCompose(config, rows))
    } else {
      lines.push('# --- Output: one line per configured row ---')
      for (const plan of rows) {
        lines.push(`printf '%s\\n' "$${plan.rowVar}"`)
      }
    }
    return lines
  },
}
