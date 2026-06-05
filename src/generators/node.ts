// Node emitter. #!/usr/bin/env node; accumulate stdin then JSON.parse. Percent
// Math.trunc(Number(x)||0) + clamp; cost replicates the model fmtCost; peak via
// Intl.DateTimeFormat; PMSL_GIT_BRANCH via ('PMSL_GIT_BRANCH' in process.env).
// Strings use \x1b, double-quoted (no template literals / backticks in styled
// output). The whole body runs inside the stdin 'end' handler.

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
import { nodeColorFn, nodeHelper, nodeSgrWrap } from './helpers/node'
import { SEGMENT_COMMENT } from './segments/labels'
import { emitNodePet, emitNodePetCompose } from './pets/node'

// ---------------------------------------------------------------------------
// JS double-quoted string escaping
// ---------------------------------------------------------------------------

/** Escape text for a JS double-quoted string literal. */
function jsStr(text: string): string {
  return (
    '"' +
    text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r') +
    '"'
  )
}

/** Serialize text pieces into a JS string expression (concatenation). */
function piecesToExpr(pieces: TextPiece[]): string {
  const parts: string[] = []
  for (const p of pieces) {
    if (p.kind === 'lit') parts.push(jsStr(p.text))
    else parts.push(p.name)
  }
  return parts.length ? parts.join(' + ') : '""'
}

function nodeSpan(span: PlanSpan): string {
  const body = piecesToExpr(span.pieces)
  if (span.threshold) {
    const { fn, pctVar, boldDim } = span.threshold
    return `sgr_wrap(${jsStr(boldDim)}, ${fn}(${pctVar}), ${body})`
  }
  if (span.concrete) {
    return `"\\x1b[${span.concrete}m" + ${body} + "\\x1b[0m"`
  }
  return body
}

// ---------------------------------------------------------------------------
// Extraction helpers (node, optional chaining)
// ---------------------------------------------------------------------------

function optChain(path: string[]): string {
  return 'data?.' + path.join('?.')
}

// ---------------------------------------------------------------------------
// Per-segment emit (all bodies are indented inside the stdin 'end' handler)
// ---------------------------------------------------------------------------

const I = '  ' // base indent inside the handler

function emitSimple(seg: SimpleSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const tmp = `_${seg.type}`
  const g = ctx.config.global.emoji
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT[seg.type]} ---`]

  if (seg.type === 'gitBranch') {
    lines.push(
      `${I}const ${tmp} = ("PMSL_GIT_BRANCH" in process.env) ? process.env.PMSL_GIT_BRANCH : _gitBranchFn(_dirCwd);`,
    )
    lines.push(...guard(tmp, out, seg, g, [v(tmp)], seg.style))
    return lines
  }
  if (seg.type === 'cost') {
    lines.push(`${I}let ${out} = "";`)
    lines.push(`${I}if (data.cost !== undefined) {`)
    lines.push(`${I}  const ${tmp} = fmt_cost(Number(data.cost?.total_cost_usd) || 0);`)
    lines.push(...assignDecorated(out, seg, g, [v(tmp)], seg.style, I + '  ', true))
    lines.push(`${I}}`)
    return lines
  }
  if (seg.type === 'duration') {
    lines.push(`${I}let ${out} = "";`)
    lines.push(`${I}if (data.cost !== undefined) {`)
    lines.push(`${I}  const ${tmp} = fmt_duration(Number(data.cost?.total_duration_ms) || 0);`)
    lines.push(...assignDecorated(out, seg, g, [v(tmp)], seg.style, I + '  ', true))
    lines.push(`${I}}`)
    return lines
  }

  if (seg.type === 'thinking') {
    lines.push(`${I}const ${tmp} = data.thinking?.enabled ? "thinking" : "";`)
  } else {
    lines.push(`${I}const ${tmp} = ${optChain(simplePath(seg.type))} || "";`)
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
  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (${tmp}) {`)
  lines.push(...assignDecorated(out, seg, g, pieces, style, I + '  ', true))
  lines.push(`${I}}`)
  return lines
}

/** Decorated assignment. `reassign` => emit `outVar = ...` (already declared);
 *  otherwise `let outVar = ...`. */
function assignDecorated(
  out: string,
  seg: Segment,
  g: boolean,
  pieces: TextPiece[],
  style: TextStyle | undefined,
  indent: string,
  reassign: boolean,
): string[] {
  const value: ValueSpan[] = [{ span: concreteSpan(pieces, style) }]
  return assignSpansAt(out, decorate(seg, g, value), indent, reassign)
}

/** Like assignSpans but lets the caller choose let vs reassignment. */
function assignSpansAt(
  outVar: string,
  spans: ValueSpan[],
  indent: string,
  reassign: boolean,
): string[] {
  const lines: string[] = []
  const staticParts: string[] = []
  const conditionals: { whenVar: string; parts: string[] }[] = []
  let i = 0
  while (i < spans.length) {
    const s = spans[i]
    if (!s.whenVar) {
      staticParts.push(nodeSpan(s.span))
      i++
    } else {
      const when = s.whenVar
      const group: string[] = []
      while (i < spans.length && spans[i].whenVar === when) {
        group.push(nodeSpan(spans[i].span))
        i++
      }
      conditionals.push({ whenVar: when, parts: group })
    }
  }
  const decl = reassign ? '' : 'let '
  lines.push(`${indent}${decl}${outVar} = ${staticParts.length ? staticParts.join(' + ') : '""'};`)
  for (const c of conditionals) {
    lines.push(`${indent}if (${c.whenVar}) ${outVar} += ${c.parts.join(' + ')};`)
  }
  return lines
}

function emitDirectory(seg: DirectorySegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.directory} ---`]
  lines.push(`${I}const _dir = _dirCwd;`)
  lines.push(`${I}let _disp = _dir;`)
  if (seg.dirStyle === 'basename') {
    lines.push(`${I}{ const _p = _disp.replace(/\\/+$/, "").split("/"); _disp = _p[_p.length - 1] || _dir; }`)
  } else if (seg.dirStyle === 'tildeHome') {
    lines.push(`${I}{ const _home = process.env.HOME || "";`)
    lines.push(`${I}  if (_disp === _home) _disp = "~";`)
    lines.push(`${I}  else if (_home && _disp.startsWith(_home + "/")) _disp = "~" + _disp.slice(_home.length); }`)
  }
  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (_dir) {`)
  lines.push(...assignDecorated(out, seg, g, [v('_disp')], seg.style, I + '  ', true))
  lines.push(`${I}}`)
  return lines
}

function emitMetric(seg: MetricSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT[seg.type]} ---`]
  const pVar = `_${seg.type}_p`
  const barVar = `_${seg.type}_bar`
  const pctTextVar = `_${seg.type}_pct`
  const timerVar = seg.type === 'context' ? null : `_${seg.type}_timer`

  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (${metricPresent(seg.type)}) {`)
  lines.push(`${I}  let ${pVar} = Math.trunc(Number(${metricPct(seg.type)}) || 0);`)
  lines.push(`${I}  ${pVar} = ${pVar} < 0 ? 0 : (${pVar} > 100 ? 100 : ${pVar});`)
  if (seg.parts.includes('bar')) {
    lines.push(
      `${I}  const ${barVar} = bar(${pVar}, ${seg.barWidth}, ${jsStr(seg.barChars.filled)}, ${jsStr(seg.barChars.empty)});`,
    )
  }
  if (seg.parts.includes('percent')) {
    lines.push(`${I}  const ${pctTextVar} = ${pVar} + "%";`)
  }
  if (timerVar && seg.parts.includes('timer')) {
    lines.push(`${I}  const _reset = ${metricReset(seg.type)};`)
    lines.push(
      `${I}  const ${timerVar} = (_reset !== undefined && _reset !== null) ? time_until(Number(_reset), NOW) : "";`,
    )
  }
  const valueSpans = metricValueSpans(seg, {
    pctVar: pVar,
    barVar,
    pctTextVar,
    timerVar: seg.parts.includes('timer') ? timerVar : null,
    colorFnName: ctx.colorFnName,
  })
  lines.push(...assignSpansAt(out, decorate(seg, g, valueSpans), I + '  ', true))
  lines.push(`${I}}`)
  return lines
}

function metricPresent(type: 'context' | 'session' | 'week'): string {
  if (type === 'context') return `data.context_window !== undefined`
  const bucket = type === 'session' ? 'five_hour' : 'seven_day'
  return `data.rate_limits?.${bucket} !== undefined`
}
function metricPct(type: 'context' | 'session' | 'week'): string {
  if (type === 'context') return `data.context_window?.used_percentage`
  const bucket = type === 'session' ? 'five_hour' : 'seven_day'
  return `data.rate_limits?.${bucket}?.used_percentage`
}
function metricReset(type: 'context' | 'session' | 'week'): string {
  const bucket = type === 'session' ? 'five_hour' : 'seven_day'
  return `data.rate_limits?.${bucket}?.resets_at`
}

function emitPeak(seg: PeakSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.peak} ---`]
  lines.push(`${I}// Peak: decompose NOW under tz, then pure epoch arithmetic. DST seam +-1h accepted.`)
  lines.push(`${I}const [_pkDow, _pkH, _pkM, _pkS] = peak_decompose(NOW, ${jsStr(seg.tz)});`)
  lines.push(`${I}const _pkMid = NOW - (_pkH * 3600 + _pkM * 60 + _pkS);`)
  lines.push(`${I}const _pkTodayStart = _pkMid + ${seg.startHour} * 3600;`)
  lines.push(`${I}const _pkTodayEnd = _pkMid + ${seg.endHour} * 3600;`)
  lines.push(`${I}const _pkDays = new Set([${seg.windowDays.join(', ')}]);`)
  lines.push(`${I}let _pkIn = false, _pkTarget = 0;`)
  lines.push(`${I}if (_pkDays.has(_pkDow) && NOW >= _pkTodayStart && NOW < _pkTodayEnd) {`)
  lines.push(`${I}  _pkIn = true; _pkTarget = _pkTodayEnd;`)
  lines.push(`${I}} else {`)
  lines.push(`${I}  for (let _pkK = 0; _pkK <= 7; _pkK++) {`)
  lines.push(`${I}    const _pkDk = ((_pkDow - 1 + _pkK) % 7) + 1;`)
  lines.push(`${I}    if (!_pkDays.has(_pkDk)) continue;`)
  lines.push(`${I}    const _pkStart = _pkMid + _pkK * 86400 + ${seg.startHour} * 3600;`)
  lines.push(`${I}    if (_pkStart > NOW) { _pkTarget = _pkStart; break; }`)
  lines.push(`${I}  }`)
  lines.push(`${I}  if (_pkTarget === 0) _pkTarget = _pkTodayStart + 7 * 86400;`)
  lines.push(`${I}}`)

  const peakParams = concreteParams(seg.peakStyle)
  const offParams = concreteParams(seg.offPeakStyle)
  lines.push(`${I}const _pkLabel = _pkIn ? "Peak" : "Off-peak";`)
  lines.push(
    `${I}const _pkLbl = _pkIn ? (${spanLit('_pkLabel', peakParams)}) : (${spanLit('_pkLabel', offParams)});`,
  )

  const prefix = decoratePrefix(seg, g)
  const parts = prefix.map((ps) => nodeSpan(ps.span))
  parts.push('_pkLbl')
  lines.push(`${I}let ${out} = ${parts.length ? parts.join(' + ') : '""'};`)
  if (seg.showCountdown) {
    lines.push(`${I}const _pkCd = time_until(_pkTarget, NOW);`)
    const sep = nodeSpan(concreteSpan([lit(' ')], undefined))
    const cd = nodeSpan(concreteSpan([lit('('), v('_pkCd'), lit(')')], { dim: true }))
    lines.push(`${I}if (_pkCd) ${out} += ${sep} + ${cd};`)
  }
  if (seg.suffix) {
    lines.push(`${I}${out} += ${nodeSpan(concreteSpan([lit(seg.suffix)], undefined))};`)
  }
  return lines
}

function spanLit(varName: string, params: string | null): string {
  if (params) return `"\\x1b[${params}m" + ${varName} + "\\x1b[0m"`
  return varName
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
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.lines} ---`]
  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (data.cost !== undefined) {`)
  lines.push(`${I}  const _lnAdd = data.cost?.total_lines_added || 0;`)
  lines.push(`${I}  const _lnRem = data.cost?.total_lines_removed || 0;`)
  const value: ValueSpan[] = []
  if (seg.linesStyle === 'addedOnly') {
    value.push({ span: concreteSpan([lit('+'), v('_lnAdd')], seg.addedStyle) })
  } else if (seg.linesStyle === 'removedOnly') {
    value.push({ span: concreteSpan([lit('-'), v('_lnRem')], seg.removedStyle) })
  } else {
    value.push({ span: concreteSpan([lit('+'), v('_lnAdd')], seg.addedStyle) })
    value.push({ span: concreteSpan([lit(' ')], undefined) })
    value.push({ span: concreteSpan([lit('-'), v('_lnRem')], seg.removedStyle) })
  }
  lines.push(...assignSpansAt(out, decorate(seg, g, value), I + '  ', true))
  lines.push(`${I}}`)
  return lines
}

function emitPr(seg: PrSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.pr} ---`]
  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (data.pr !== undefined) {`)
  lines.push(`${I}  const _prNum = data.pr?.number === undefined || data.pr?.number === null ? "" : String(data.pr.number);`)
  lines.push(`${I}  const _prState = data.pr?.review_state || "";`)
  const value: ValueSpan[] = [{ span: concreteSpan([lit('#'), v('_prNum')], seg.style) }]
  if (seg.showState) {
    value.push({ span: concreteSpan([lit(' ')], undefined), whenVar: '_prState' })
    value.push({ span: concreteSpan([v('_prState')], seg.style), whenVar: '_prState' })
  }
  lines.push(...assignSpansAt(out, decorate(seg, g, value), I + '  ', true))
  lines.push(`${I}}`)
  return lines
}

function emitSeparator(seg: SeparatorSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.separator} ---`]
  if (seg.width === 'full') {
    lines.push(`${I}const _sepW = parseInt(process.env.COLUMNS, 10) || 80;`)
  } else {
    lines.push(`${I}const _sepW = ${seg.width};`)
  }
  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (_sepW > 0 && ${jsStr(seg.fill)}) {`)
  lines.push(`${I}  const _sep = ${jsStr(seg.fill)}.repeat(_sepW);`)
  lines.push(...assignDecorated(out, seg, g, [v('_sep')], seg.style, I + '  ', true))
  lines.push(`${I}}`)
  return lines
}

function emitStaticText(seg: StaticTextSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.staticText} ---`]
  if (seg.text === '') {
    lines.push(`${I}let ${out} = "";`)
    return lines
  }
  lines.push(
    ...assignSpansAt(out, decorate(seg, g, [{ span: concreteSpan([lit(seg.text)], seg.style) }]), I, false),
  )
  return lines
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

function needsGit(config: StatuslineConfig): boolean {
  return config.rows.some((r) => r.segments.some((s) => s.enabled && s.type === 'gitBranch'))
}

export const nodeEmitter: Emitter = {
  lang: 'node',

  shebang() {
    return '#!/usr/bin/env node'
  },

  preamble(config) {
    const lines = [
      '// Generated by pimp-my-statusline. Hand-editable; the marker line above is',
      '// the source of truth for re-import (edits to the body are not round-tripped).',
    ]
    if (needsGit(config)) lines.push('const { execFileSync } = require("child_process");')
    lines.push('let input = "";')
    lines.push('process.stdin.on("data", (c) => { input += c; });')
    lines.push('process.stdin.on("end", () => {')
    lines.push('  const data = JSON.parse(input);')
    lines.push('  // Injectable clock (PMSL_NOW) so output is reproducible/testable.')
    lines.push('  const NOW = ("PMSL_NOW" in process.env) && process.env.PMSL_NOW')
    lines.push('    ? parseInt(process.env.PMSL_NOW, 10) : Math.trunc(Date.now() / 1000);')
    lines.push('  const _dirCwd = data.cwd || data.workspace?.current_dir || "";')
    if (needsGit(config)) {
      lines.push('  const _gitBranchFn = (cwd) => {')
      lines.push('    try {')
      lines.push('      return execFileSync("git", ["-C", cwd, "branch", "--show-current"],')
      lines.push('        { encoding: "utf8" }).trim();')
      lines.push('    } catch { return ""; }')
      lines.push('  };')
    }
    return lines
  },

  baseHelpers(needsThreshold) {
    return (needsThreshold ? nodeSgrWrap() : []).map((l) => (l === '' ? l : I + l))
  },

  colorFn(fn) {
    return nodeColorFn(fn).map((l) => (l === '' ? l : I + l))
  },

  helper(id: HelperId, config) {
    return nodeHelper(id, config).map((l) => (l === '' ? l : I + l))
  },

  petBlock(config) {
    return emitNodePet(config).map((l) => (l === '' ? l : I + l))
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
    lines.push(`${I}// --- Row assembly ---`)
    lines.push(`${I}// A dropped (empty) segment contributes nothing, including its join.`)
    for (const plan of rows) {
      lines.push(`${I}let ${plan.rowVar} = "";`)
      for (let i = 0; i < plan.segments.length; i++) {
        const ps = plan.segments[i]
        const join = ps.seg.joinBefore ?? plan.joiner
        if (i === 0) {
          lines.push(`${I}if (${ps.varName}) ${plan.rowVar} = ${ps.varName};`)
        } else {
          lines.push(
            `${I}if (${ps.varName}) { if (${plan.rowVar}) ${plan.rowVar} += ${jsStr(join)}; ${plan.rowVar} += ${ps.varName}; }`,
          )
        }
      }
    }
    lines.push('')
    if (config.pet.enabled) {
      lines.push(...emitNodePetCompose(config, rows))
    } else {
      lines.push(`${I}// --- Output: one line per configured row ---`)
      for (const plan of rows) {
        lines.push(`${I}console.log(${plan.rowVar});`)
      }
    }
    lines.push('});')
    return lines
  },
}
