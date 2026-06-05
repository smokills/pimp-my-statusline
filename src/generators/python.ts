// Python emitter. python3 stdlib only; json.load(sys.stdin); NOW from PMSL_NOW;
// percent int(float(x or 0)) then clamp; cost '%.2f' % x; git via subprocess
// with PMSL_GIT_BRANCH override (present-but-empty must override). Mirrors the
// bash emitter's structure and the preview's serializeSpan exactly.

import type { HelperId } from '../model/segments'
import type {
  DirectorySegment,
  LinesSegment,
  MetricSegment,
  PeakSegment,
  PrSegment,
  Segment,
  SeparatorSegment,
  SimpleSegment,
  StaticTextSegment,
  StatuslineConfig,
  TextStyle,
} from '../model/types'
import type { Emitter, RowPlan, SegmentEmitCtx } from './types'
import type { PlanSpan, TextPiece } from './spanplan'
import { concreteSpan, lit, v } from './spanplan'
import { concreteParams } from './fragments'
import { decorate, metricValueSpans, type ValueSpan } from './segments/ir'
import { pyColorFn, pyHelper, pySgrWrap } from './helpers/python'
import { SEGMENT_COMMENT } from './segments/labels'
import { emitPyPet, emitPyPetCompose } from './pets/python'

// ---------------------------------------------------------------------------
// Python literal escaping (single-quoted) and f-string body escaping
// ---------------------------------------------------------------------------

/** Escape text for a python single-quoted string literal. */
function pyStr(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** Escape literal text for embedding inside a single-quoted f-string body. */
function fbody(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\{/g, '{{')
    .replace(/\}/g, '}}')
}

function piecesToFbody(pieces: TextPiece[]): string {
  let out = ''
  for (const p of pieces) {
    if (p.kind === 'lit') out += fbody(p.text)
    else out += `{${p.name}}`
  }
  return out
}

/** Serialize one span into a python expression. */
function pySpan(span: PlanSpan): string {
  const body = piecesToFbody(span.pieces)
  if (span.threshold) {
    const { fn, pctVar, boldDim } = span.threshold
    return `sgr_wrap(${pyStr(boldDim)}, ${fn}(${pctVar}), f'${body}')`
  }
  if (span.concrete) {
    return `f'\\033[${span.concrete}m${body}\\033[0m'`
  }
  return `f'${body}'`
}

/** Assign a list of value spans to outVar, honoring runtime-conditional spans. */
function assignSpans(outVar: string, spans: ValueSpan[], indent: string): string[] {
  const lines: string[] = []
  const staticParts: string[] = []
  const conditionals: { whenVar: string; parts: string[] }[] = []
  let i = 0
  while (i < spans.length) {
    const s = spans[i]
    if (!s.whenVar) {
      staticParts.push(pySpan(s.span))
      i++
    } else {
      const when = s.whenVar
      const group: string[] = []
      while (i < spans.length && spans[i].whenVar === when) {
        group.push(pySpan(spans[i].span))
        i++
      }
      conditionals.push({ whenVar: when, parts: group })
    }
  }
  lines.push(`${indent}${outVar} = ${staticParts.length ? staticParts.join(' + ') : "''"}`)
  for (const c of conditionals) {
    lines.push(`${indent}if ${c.whenVar}: ${outVar} += ${c.parts.join(' + ')}`)
  }
  return lines
}

// ---------------------------------------------------------------------------
// Extraction helpers (python)
// ---------------------------------------------------------------------------

/** Safe nested get expression yielding the leaf value or None. */
function getExpr(path: string[]): string {
  let expr = 'data'
  for (const key of path) expr = `(${expr} or {}).get(${pyStr(key)})`
  return expr
}

// ---------------------------------------------------------------------------
// Per-segment emit
// ---------------------------------------------------------------------------

function emitSimple(seg: SimpleSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const tmp = `_${seg.type}`
  const g = ctx.config.global.emoji
  const lines: string[] = [`# --- ${SEGMENT_COMMENT[seg.type]} ---`]

  if (seg.type === 'gitBranch') {
    lines.push(
      `${tmp} = os.environ['PMSL_GIT_BRANCH'] if 'PMSL_GIT_BRANCH' in os.environ else _git_branch(_dir_cwd)`,
    )
    lines.push(...guard(tmp, out, seg, g, [v(tmp)], seg.style))
    return lines
  }
  if (seg.type === 'cost') {
    lines.push(`if 'cost' in data:`)
    lines.push(`    ${tmp} = fmt_cost(float((data.get('cost') or {}).get('total_cost_usd') or 0))`)
    lines.push(...assignSpansDecorated(out, seg, g, [v(tmp)], seg.style, '    '))
    lines.push('else:')
    lines.push(`    ${out} = ''`)
    return lines
  }
  if (seg.type === 'duration') {
    lines.push(`if 'cost' in data:`)
    lines.push(`    ${tmp} = fmt_duration(int((data.get('cost') or {}).get('total_duration_ms') or 0))`)
    lines.push(...assignSpansDecorated(out, seg, g, [v(tmp)], seg.style, '    '))
    lines.push('else:')
    lines.push(`    ${out} = ''`)
    return lines
  }

  if (seg.type === 'thinking') {
    lines.push(`${tmp} = 'thinking' if (data.get('thinking') or {}).get('enabled') else ''`)
  } else {
    lines.push(`${tmp} = ${getExpr(simplePath(seg.type))} or ''`)
  }
  lines.push(...guard(tmp, out, seg, g, [v(tmp)], seg.style))
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

function guard(
  tmp: string,
  out: string,
  seg: Segment,
  g: boolean,
  pieces: TextPiece[],
  style: TextStyle | undefined,
): string[] {
  const lines: string[] = []
  lines.push(`if ${tmp}:`)
  lines.push(...assignSpansDecorated(out, seg, g, pieces, style, '    '))
  lines.push('else:')
  lines.push(`    ${out} = ''`)
  return lines
}

function assignSpansDecorated(
  out: string,
  seg: Segment,
  g: boolean,
  pieces: TextPiece[],
  style: TextStyle | undefined,
  indent: string,
): string[] {
  const value: ValueSpan[] = [{ span: concreteSpan(pieces, style) }]
  return assignSpans(out, decorate(seg, g, value), indent)
}

function emitDirectory(seg: DirectorySegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.directory} ---`]
  lines.push(`_dir = _dir_cwd`)
  lines.push(`_disp = _dir`)
  if (seg.dirStyle === 'basename') {
    lines.push(`_disp = (_disp.rstrip('/').rsplit('/', 1)[-1]) or _dir`)
  } else if (seg.dirStyle === 'tildeHome') {
    lines.push(`_home = os.environ.get('HOME', '')`)
    lines.push(`if _disp == _home: _disp = '~'`)
    lines.push(`elif _home and _disp.startswith(_home + '/'): _disp = '~' + _disp[len(_home):]`)
  }
  lines.push(`if _dir:`)
  lines.push(...assignSpansDecorated(out, seg, g, [v('_disp')], seg.style, '    '))
  lines.push('else:')
  lines.push(`    ${out} = ''`)
  return lines
}

function emitMetric(seg: MetricSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`# --- ${SEGMENT_COMMENT[seg.type]} ---`]
  const pVar = `_${seg.type}_p`
  const barVar = `_${seg.type}_bar`
  const pctTextVar = `_${seg.type}_pct`
  const timerVar = seg.type === 'context' ? null : `_${seg.type}_timer`

  lines.push(`if ${metricPresent(seg.type)}:`)
  lines.push(`    ${pVar} = int(float(${metricPct(seg.type)} or 0))`)
  lines.push(`    ${pVar} = 0 if ${pVar} < 0 else (100 if ${pVar} > 100 else ${pVar})`)
  if (seg.parts.includes('bar')) {
    lines.push(
      `    ${barVar} = bar(${pVar}, ${seg.barWidth}, ${pyStr(seg.barChars.filled)}, ${pyStr(seg.barChars.empty)})`,
    )
  }
  if (seg.parts.includes('percent')) {
    lines.push(`    ${pctTextVar} = f'{${pVar}}%'`)
  }
  if (timerVar && seg.parts.includes('timer')) {
    lines.push(`    _reset = ${metricReset(seg.type)}`)
    lines.push(`    ${timerVar} = time_until(int(_reset), NOW) if _reset is not None else ''`)
  }
  const valueSpans = metricValueSpans(seg, {
    pctVar: pVar,
    barVar,
    pctTextVar,
    timerVar: seg.parts.includes('timer') ? timerVar : null,
    colorFnName: ctx.colorFnName,
  })
  lines.push(...assignSpans(out, decorate(seg, g, valueSpans), '    '))
  lines.push('else:')
  lines.push(`    ${out} = ''`)
  return lines
}

function metricPresent(type: 'context' | 'session' | 'week'): string {
  if (type === 'context') return `'context_window' in data`
  const bucket = type === 'session' ? 'five_hour' : 'seven_day'
  return `'${bucket}' in (data.get('rate_limits') or {})`
}
function metricPct(type: 'context' | 'session' | 'week'): string {
  if (type === 'context') return `(data.get('context_window') or {}).get('used_percentage')`
  const bucket = type === 'session' ? 'five_hour' : 'seven_day'
  return `((data.get('rate_limits') or {}).get('${bucket}') or {}).get('used_percentage')`
}
function metricReset(type: 'context' | 'session' | 'week'): string {
  const bucket = type === 'session' ? 'five_hour' : 'seven_day'
  return `((data.get('rate_limits') or {}).get('${bucket}') or {}).get('resets_at')`
}

function emitPeak(seg: PeakSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.peak} ---`]
  lines.push('# Peak: decompose NOW under tz, then pure epoch arithmetic. DST seam +-1h accepted.')
  lines.push(`_pk_dow, _pk_h, _pk_m, _pk_s = peak_decompose(NOW, ${pyStr(seg.tz)})`)
  lines.push('_pk_mid = NOW - (_pk_h*3600 + _pk_m*60 + _pk_s)')
  lines.push(`_pk_today_start = _pk_mid + ${seg.startHour}*3600`)
  lines.push(`_pk_today_end = _pk_mid + ${seg.endHour}*3600`)
  lines.push(`_pk_days = {${seg.windowDays.join(', ')}}`)
  lines.push('_pk_in = False')
  lines.push('_pk_target = 0')
  lines.push('if _pk_dow in _pk_days and _pk_today_start <= NOW < _pk_today_end:')
  lines.push('    _pk_in = True')
  lines.push('    _pk_target = _pk_today_end')
  lines.push('else:')
  lines.push('    for _pk_k in range(0, 8):')
  lines.push('        _pk_dk = (_pk_dow - 1 + _pk_k) % 7 + 1')
  lines.push('        if _pk_dk not in _pk_days: continue')
  lines.push(`        _pk_start = _pk_mid + _pk_k*86400 + ${seg.startHour}*3600`)
  lines.push('        if _pk_start > NOW:')
  lines.push('            _pk_target = _pk_start')
  lines.push('            break')
  lines.push('    if _pk_target == 0: _pk_target = _pk_today_start + 7*86400')

  const peakParams = concreteParams(seg.peakStyle)
  const offParams = concreteParams(seg.offPeakStyle)
  lines.push(`_pk_label = 'Peak' if _pk_in else 'Off-peak'`)
  lines.push(
    `_pk_lbl = (${spanLit('_pk_label', peakParams)}) if _pk_in else (${spanLit('_pk_label', offParams)})`,
  )

  const prefix = decoratePrefix(seg, g)
  const parts: string[] = prefix.map((ps) => pySpan(ps.span))
  parts.push('_pk_lbl')
  lines.push(`${out} = ${parts.length ? parts.join(' + ') : "''"}`)
  if (seg.showCountdown) {
    lines.push('_pk_cd = time_until(_pk_target, NOW)')
    const sep = pySpan(concreteSpan([lit(' ')], undefined))
    const cd = pySpan(concreteSpan([lit('('), v('_pk_cd'), lit(')')], { dim: true }))
    lines.push(`if _pk_cd: ${out} += ${sep} + ${cd}`)
  }
  if (seg.suffix) {
    lines.push(`${out} += ${pySpan(concreteSpan([lit(seg.suffix)], undefined))}`)
  }
  return lines
}

function spanLit(varName: string, params: string | null): string {
  if (params) return `f'\\033[${params}m{${varName}}\\033[0m'`
  return `${varName}`
}

function decoratePrefix(seg: Segment, g: boolean): ValueSpan[] {
  const out: ValueSpan[] = []
  if (g && seg.emoji?.show && seg.emoji.glyph) {
    out.push({ span: concreteSpan([lit(seg.emoji.glyph + ' ')], undefined) })
  }
  if (seg.label?.show && seg.label.text) {
    out.push({ span: concreteSpan([lit(seg.label.text + ' ')], seg.label.style) })
  }
  if (seg.prefix) out.push({ span: concreteSpan([lit(seg.prefix)], undefined) })
  return out
}

function emitLines(seg: LinesSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.lines} ---`]
  lines.push(`if 'cost' in data:`)
  lines.push(`    _ln_add = (data.get('cost') or {}).get('total_lines_added') or 0`)
  lines.push(`    _ln_rem = (data.get('cost') or {}).get('total_lines_removed') or 0`)
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
  lines.push(...assignSpans(out, decorate(seg, g, value), '    '))
  lines.push('else:')
  lines.push(`    ${out} = ''`)
  return lines
}

function emitPr(seg: PrSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.pr} ---`]
  lines.push(`if 'pr' in data:`)
  lines.push(`    _pr_num = (data.get('pr') or {}).get('number')`)
  lines.push(`    _pr_num = '' if _pr_num is None else str(_pr_num)`)
  lines.push(`    _pr_state = (data.get('pr') or {}).get('review_state') or ''`)
  const value: ValueSpan[] = [{ span: concreteSpan([lit('#'), v('_pr_num')], seg.style) }]
  if (seg.showState) {
    value.push({ span: concreteSpan([lit(' ')], undefined), whenVar: '_pr_state' })
    value.push({ span: concreteSpan([v('_pr_state')], seg.style), whenVar: '_pr_state' })
  }
  lines.push(...assignSpans(out, decorate(seg, g, value), '    '))
  lines.push('else:')
  lines.push(`    ${out} = ''`)
  return lines
}

function emitSeparator(seg: SeparatorSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.separator} ---`]
  if (seg.width === 'full') {
    lines.push(`_sep_w = int(os.environ.get('COLUMNS') or 80)`)
  } else {
    lines.push(`_sep_w = ${seg.width}`)
  }
  lines.push(`if _sep_w > 0 and ${pyStr(seg.fill)}:`)
  lines.push(`    _sep = ${pyStr(seg.fill)} * _sep_w`)
  lines.push(...assignSpansDecorated(out, seg, g, [v('_sep')], seg.style, '    '))
  lines.push('else:')
  lines.push(`    ${out} = ''`)
  return lines
}

function emitStaticText(seg: StaticTextSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.staticText} ---`]
  if (seg.text === '') {
    lines.push(`${out} = ''`)
    return lines
  }
  lines.push(
    ...assignSpans(out, decorate(seg, g, [{ span: concreteSpan([lit(seg.text)], seg.style) }]), ''),
  )
  return lines
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

function needsGit(config: StatuslineConfig): boolean {
  return config.rows.some((r) => r.segments.some((s) => s.enabled && s.type === 'gitBranch'))
}

export const pythonEmitter: Emitter = {
  lang: 'python',

  shebang() {
    return '#!/usr/bin/env python3'
  },

  preamble(config) {
    const lines = [
      '# Generated by pimp-my-statusline. Hand-editable; the marker line above is',
      '# the source of truth for re-import (edits to the body are not round-tripped).',
      'import json, os, sys, time',
    ]
    if (needsGit(config)) lines.push('import subprocess')
    lines.push('')
    lines.push('data = json.load(sys.stdin)')
    lines.push('# Injectable clock (PMSL_NOW) so output is reproducible/testable.')
    lines.push(
      "NOW = int(os.environ['PMSL_NOW']) if os.environ.get('PMSL_NOW') else int(time.time())",
    )
    lines.push("_dir_cwd = data.get('cwd') or (data.get('workspace') or {}).get('current_dir') or ''")
    if (needsGit(config)) {
      lines.push('')
      lines.push('def _git_branch(cwd):')
      lines.push('    # PMSL_GIT_BRANCH (even when empty) overrides at the call site.')
      lines.push('    try:')
      lines.push("        r = subprocess.run(['git', '-C', cwd, 'branch', '--show-current'],")
      lines.push('                           capture_output=True, text=True)')
      lines.push('        return r.stdout.strip()')
      lines.push('    except Exception:')
      lines.push("        return ''")
    }
    return lines
  },

  baseHelpers(needsThreshold) {
    return needsThreshold ? pySgrWrap() : []
  },

  colorFn(fn) {
    return pyColorFn(fn)
  },

  helper(id: HelperId, config) {
    return pyHelper(id, config)
  },

  petBlock(config) {
    return emitPyPet(config)
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
    lines.push('# A dropped (empty) segment contributes nothing, including its join.')
    for (const plan of rows) {
      lines.push(`${plan.rowVar} = ''`)
      for (let i = 0; i < plan.segments.length; i++) {
        const ps = plan.segments[i]
        const join = ps.seg.joinBefore ?? plan.joiner
        if (i === 0) {
          lines.push(`if ${ps.varName}: ${plan.rowVar} = ${ps.varName}`)
        } else {
          lines.push(`if ${ps.varName}:`)
          lines.push(`    if ${plan.rowVar}: ${plan.rowVar} += ${pyStr(join)}`)
          lines.push(`    ${plan.rowVar} += ${ps.varName}`)
        }
      }
    }
    lines.push('')
    if (config.pet.enabled) {
      lines.push(...emitPyPetCompose(config, rows))
    } else {
      lines.push('# --- Output: one line per configured row ---')
      for (const plan of rows) {
        lines.push(`print(${plan.rowVar})`)
      }
    }
    return lines
  },
}
