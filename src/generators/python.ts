// Python emitter. python3 stdlib only; json.load(sys.stdin); NOW from PMSL_NOW;
// percent int(float(x or 0)) then clamp; cost '%.2f' % x; git via subprocess
// with PMSL_GIT_BRANCH override (present-but-empty must override). Mirrors the
// bash emitter's structure and the preview's serializeSpan exactly.

import type { HelperId } from '../model/segments'
import type {
  DirectorySegment,
  LinesSegment,
  MetricSegment,
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
import { decorate, metricValueSpans, type ValueSpan } from './segments/ir'
import {
  metricPctPath,
  metricResetPath,
  metricSourcePath,
  simplePath,
  COST_TOTAL_USD,
  COST_DURATION_MS,
  COST_LINES_ADDED,
  COST_LINES_REMOVED,
  PR_NUMBER,
  PR_REVIEW_STATE,
  DIR_CWD,
  DIR_WORKSPACE,
  type MetricType,
} from './segments/paths'
import { pyColorFn, pyHelper, pySgrWrap } from './helpers/python'
import { SEGMENT_COMMENT } from './segments/labels'
import { emitPyPet, emitPyPetCompose } from './pets/python'

// ---------------------------------------------------------------------------
// Python literal escaping (single-quoted) and f-string body escaping
// ---------------------------------------------------------------------------

/** Escape control whitespace (newline/carriage-return/tab) into their backslash
 *  forms so a user string containing them never breaks the single-line literal.
 *  Decodes back to the same bytes at runtime, matching the raw string the
 *  preview passes through. */
function escapeWhitespace(s: string): string {
  return s.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
}

/** Escape text for a python single-quoted string literal. */
function pyStr(text: string): string {
  return `'${escapeWhitespace(text.replace(/\\/g, '\\\\').replace(/'/g, "\\'"))}'`
}

/** Escape literal text for embedding inside a single-quoted f-string body. */
function fbody(text: string): string {
  return escapeWhitespace(
    text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\{/g, '{{')
      .replace(/\}/g, '}}'),
  )
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
    return `sgr_wrap(${pyStr(boldDim)}, ${fn}(${pctVar}), ${spanInner(span, body)})`
  }
  if (span.concrete) {
    return `f'\\033[${span.concrete}m${body}\\033[0m'`
  }
  // No style: a single literal piece is a plain string literal (no f-string
  // noise); everything else stays an f-string.
  return spanInner(span, body)
}

/** The inner text expression for a span (the part wrapped by SGR escapes). A
 *  lone literal becomes a plain '...'; otherwise an f-string. */
function spanInner(span: PlanSpan, body: string): string {
  if (span.pieces.length === 1 && span.pieces[0].kind === 'lit') {
    return pyStr(span.pieces[0].text)
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
  const tmp = `_${ctx.uid}`
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
    lines.push(`    ${tmp} = fmt_cost(float(${getExpr(COST_TOTAL_USD)} or 0))`)
    lines.push(...assignSpansDecorated(out, seg, g, [v(tmp)], seg.style, '    '))
    lines.push('else:')
    lines.push(`    ${out} = ''`)
    return lines
  }
  if (seg.type === 'duration') {
    lines.push(`if 'cost' in data:`)
    lines.push(`    ${tmp} = fmt_duration(int(${getExpr(COST_DURATION_MS)} or 0))`)
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
  const u = ctx.uid
  const dir = `_${u}_dir`
  const disp = `_${u}_disp`
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.directory} ---`]
  lines.push(`${dir} = _dir_cwd`)
  lines.push(`${disp} = ${dir}`)
  if (seg.dirStyle === 'basename') {
    lines.push(`${disp} = (${disp}.rstrip('/').rsplit('/', 1)[-1]) or ${dir}`)
  } else if (seg.dirStyle === 'tildeHome') {
    lines.push(`_home = os.environ.get('HOME', '')`)
    lines.push(`if ${disp} == _home: ${disp} = '~'`)
    lines.push(`elif _home and ${disp}.startswith(_home + '/'): ${disp} = '~' + ${disp}[len(_home):]`)
  }
  lines.push(`if ${dir}:`)
  lines.push(...assignSpansDecorated(out, seg, g, [v(disp)], seg.style, '    '))
  lines.push('else:')
  lines.push(`    ${out} = ''`)
  return lines
}

function emitMetric(seg: MetricSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const u = ctx.uid
  const lines: string[] = [`# --- ${SEGMENT_COMMENT[seg.type]} ---`]
  const m = seg.type as MetricType
  const pVar = `_${u}_p`
  const barVar = `_${u}_bar`
  const pctTextVar = `_${u}_pct`
  const resetVar = `_${u}_reset`
  const timerVar = seg.type === 'context' ? null : `_${u}_timer`

  lines.push(`if ${pyObjPresent(metricSourcePath(m))}:`)
  lines.push(`    ${pVar} = int(float(${getExpr(metricPctPath(m))} or 0))`)
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
    lines.push(`    ${resetVar} = ${getExpr(metricResetPath(m))}`)
    lines.push(`    ${timerVar} = time_until(int(${resetVar}), NOW) if ${resetVar} is not None else ''`)
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

/** Presence test for an object path: each key present at its level. For a
 *  single key it is `'k' in data`; nested it walks via `.get`. */
function pyObjPresent(path: string[]): string {
  if (path.length === 1) return `'${path[0]}' in data`
  const parent = getExpr(path.slice(0, -1))
  const key = path[path.length - 1]
  return `'${key}' in (${parent} or {})`
}

function emitLines(seg: LinesSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const u = ctx.uid
  const addVar = `_${u}_add`
  const remVar = `_${u}_rem`
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.lines} ---`]
  lines.push(`if 'cost' in data:`)
  lines.push(`    ${addVar} = ${getExpr(COST_LINES_ADDED)} or 0`)
  lines.push(`    ${remVar} = ${getExpr(COST_LINES_REMOVED)} or 0`)
  const value: ValueSpan[] = []
  if (seg.linesStyle === 'addedOnly') {
    value.push({ span: concreteSpan([lit('+'), v(addVar)], seg.addedStyle) })
  } else if (seg.linesStyle === 'removedOnly') {
    value.push({ span: concreteSpan([lit('-'), v(remVar)], seg.removedStyle) })
  } else {
    value.push({ span: concreteSpan([lit('+'), v(addVar)], seg.addedStyle) })
    value.push({ span: concreteSpan([lit(' ')], undefined) })
    value.push({ span: concreteSpan([lit('-'), v(remVar)], seg.removedStyle) })
  }
  lines.push(...assignSpans(out, decorate(seg, g, value), '    '))
  lines.push('else:')
  lines.push(`    ${out} = ''`)
  return lines
}

function emitPr(seg: PrSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const u = ctx.uid
  const numVar = `_${u}_num`
  const stateVar = `_${u}_state`
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.pr} ---`]
  lines.push(`if 'pr' in data:`)
  lines.push(`    ${numVar} = ${getExpr(PR_NUMBER)}`)
  lines.push(`    ${numVar} = '' if ${numVar} is None else str(${numVar})`)
  const value: ValueSpan[] = [{ span: concreteSpan([lit('#'), v(numVar)], seg.style) }]
  if (seg.showState) {
    lines.push(`    ${stateVar} = ${getExpr(PR_REVIEW_STATE)} or ''`)
    value.push({ span: concreteSpan([lit(' ')], undefined), whenVar: stateVar })
    value.push({ span: concreteSpan([v(stateVar)], seg.style), whenVar: stateVar })
  }
  lines.push(...assignSpans(out, decorate(seg, g, value), '    '))
  lines.push('else:')
  lines.push(`    ${out} = ''`)
  return lines
}

function emitSeparator(seg: SeparatorSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const u = ctx.uid
  const wVar = `_${u}_w`
  const sepVar = `_${u}_sep`
  const lines: string[] = [`# --- ${SEGMENT_COMMENT.separator} ---`]
  if (seg.width === 'full') {
    lines.push(`${wVar} = int(os.environ.get('COLUMNS') or 80)`)
  } else {
    lines.push(`${wVar} = ${seg.width}`)
  }
  lines.push(`if ${wVar} > 0 and ${pyStr(seg.fill)}:`)
  lines.push(`    ${sepVar} = ${pyStr(seg.fill)} * ${wVar}`)
  lines.push(...assignSpansDecorated(out, seg, g, [v(sepVar)], seg.style, '    '))
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
    lines.push(`_dir_cwd = ${getExpr(DIR_CWD)} or ${getExpr(DIR_WORKSPACE)} or ''`)
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
