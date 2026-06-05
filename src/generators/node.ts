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
import {
  metricPctPath,
  metricResetPath,
  metricSourcePath,
  simplePath,
  type MetricType,
} from './segments/paths'
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
  const tmp = `_${ctx.uid}`
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
  const u = ctx.uid
  const dir = `_${u}_dir`
  const disp = `_${u}_disp`
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.directory} ---`]
  lines.push(`${I}const ${dir} = _dirCwd;`)
  lines.push(`${I}let ${disp} = ${dir};`)
  if (seg.dirStyle === 'basename') {
    lines.push(`${I}{ const _p = ${disp}.replace(/\\/+$/, "").split("/"); ${disp} = _p[_p.length - 1] || ${dir}; }`)
  } else if (seg.dirStyle === 'tildeHome') {
    lines.push(`${I}{ const _home = process.env.HOME || "";`)
    lines.push(`${I}  if (${disp} === _home) ${disp} = "~";`)
    lines.push(`${I}  else if (_home && ${disp}.startsWith(_home + "/")) ${disp} = "~" + ${disp}.slice(_home.length); }`)
  }
  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (${dir}) {`)
  lines.push(...assignDecorated(out, seg, g, [v(disp)], seg.style, I + '  ', true))
  lines.push(`${I}}`)
  return lines
}

function emitMetric(seg: MetricSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const u = ctx.uid
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT[seg.type]} ---`]
  const m = seg.type as MetricType
  const pVar = `_${u}_p`
  const barVar = `_${u}_bar`
  const pctTextVar = `_${u}_pct`
  const resetVar = `_${u}_reset`
  const timerVar = seg.type === 'context' ? null : `_${u}_timer`

  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (${nodeObjPresent(metricSourcePath(m))}) {`)
  lines.push(`${I}  let ${pVar} = Math.trunc(Number(${nodeAccess(metricPctPath(m))}) || 0);`)
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
    lines.push(`${I}  const ${resetVar} = ${nodeAccess(metricResetPath(m))};`)
    lines.push(
      `${I}  const ${timerVar} = (${resetVar} !== undefined && ${resetVar} !== null) ? time_until(Number(${resetVar}), NOW) : "";`,
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

/** Node optional-chain access for a path, e.g. ['rate_limits','five_hour'] →
 *  `data.rate_limits?.five_hour`. */
function nodeAccess(path: string[]): string {
  return 'data.' + path.join('?.')
}
/** Presence test: the object at `path` is not undefined. */
function nodeObjPresent(path: string[]): string {
  return `${nodeAccess(path)} !== undefined`
}

function emitPeak(seg: PeakSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const u = ctx.uid
  // Capitalized, uid-scoped peak temp names.
  const P = `_${u}Pk`
  const dow = `${P}Dow`, h = `${P}H`, mn = `${P}M`, sc = `${P}S`
  const mid = `${P}Mid`, ts = `${P}TodayStart`, te = `${P}TodayEnd`
  const days = `${P}Days`, inV = `${P}In`, target = `${P}Target`
  const k = `${P}K`, dk = `${P}Dk`, start = `${P}Start`
  const label = `${P}Label`, lbl = `${P}Lbl`, cd = `${P}Cd`
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.peak} ---`]
  lines.push(`${I}// Peak: decompose NOW under tz, then pure epoch arithmetic. DST seam +-1h accepted.`)
  lines.push(`${I}const [${dow}, ${h}, ${mn}, ${sc}] = peak_decompose(NOW, ${jsStr(seg.tz)});`)
  lines.push(`${I}const ${mid} = NOW - (${h} * 3600 + ${mn} * 60 + ${sc});`)
  lines.push(`${I}const ${ts} = ${mid} + ${seg.startHour} * 3600;`)
  lines.push(`${I}const ${te} = ${mid} + ${seg.endHour} * 3600;`)
  lines.push(`${I}const ${days} = new Set([${seg.windowDays.join(', ')}]);`)
  lines.push(`${I}let ${inV} = false, ${target} = 0;`)
  lines.push(`${I}if (${days}.has(${dow}) && NOW >= ${ts} && NOW < ${te}) {`)
  lines.push(`${I}  ${inV} = true; ${target} = ${te};`)
  lines.push(`${I}} else {`)
  lines.push(`${I}  for (let ${k} = 0; ${k} <= 7; ${k}++) {`)
  lines.push(`${I}    const ${dk} = ((${dow} - 1 + ${k}) % 7) + 1;`)
  lines.push(`${I}    if (!${days}.has(${dk})) continue;`)
  lines.push(`${I}    const ${start} = ${mid} + ${k} * 86400 + ${seg.startHour} * 3600;`)
  lines.push(`${I}    if (${start} > NOW) { ${target} = ${start}; break; }`)
  lines.push(`${I}  }`)
  lines.push(`${I}  if (${target} === 0) ${target} = ${ts} + 7 * 86400;`)
  lines.push(`${I}}`)

  const peakParams = concreteParams(seg.peakStyle)
  const offParams = concreteParams(seg.offPeakStyle)
  lines.push(`${I}const ${label} = ${inV} ? "Peak" : "Off-peak";`)
  lines.push(
    `${I}const ${lbl} = ${inV} ? (${spanLit(label, peakParams)}) : (${spanLit(label, offParams)});`,
  )

  const prefix = decoratePrefix(seg, g)
  const parts = prefix.map((ps) => nodeSpan(ps.span))
  parts.push(lbl)
  lines.push(`${I}let ${out} = ${parts.length ? parts.join(' + ') : '""'};`)
  if (seg.showCountdown) {
    lines.push(`${I}const ${cd} = time_until(${target}, NOW);`)
    const sep = nodeSpan(concreteSpan([lit(' ')], undefined))
    const cdSpan = nodeSpan(concreteSpan([lit('('), v(cd), lit(')')], { dim: true }))
    lines.push(`${I}if (${cd}) ${out} += ${sep} + ${cdSpan};`)
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
  const u = ctx.uid
  const addVar = `_${u}Add`
  const remVar = `_${u}Rem`
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.lines} ---`]
  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (data.cost !== undefined) {`)
  lines.push(`${I}  const ${addVar} = data.cost?.total_lines_added || 0;`)
  lines.push(`${I}  const ${remVar} = data.cost?.total_lines_removed || 0;`)
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
  lines.push(...assignSpansAt(out, decorate(seg, g, value), I + '  ', true))
  lines.push(`${I}}`)
  return lines
}

function emitPr(seg: PrSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const u = ctx.uid
  const numVar = `_${u}Num`
  const stateVar = `_${u}State`
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.pr} ---`]
  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (data.pr !== undefined) {`)
  lines.push(`${I}  const ${numVar} = data.pr?.number === undefined || data.pr?.number === null ? "" : String(data.pr.number);`)
  const value: ValueSpan[] = [{ span: concreteSpan([lit('#'), v(numVar)], seg.style) }]
  if (seg.showState) {
    lines.push(`${I}  const ${stateVar} = data.pr?.review_state || "";`)
    value.push({ span: concreteSpan([lit(' ')], undefined), whenVar: stateVar })
    value.push({ span: concreteSpan([v(stateVar)], seg.style), whenVar: stateVar })
  }
  lines.push(...assignSpansAt(out, decorate(seg, g, value), I + '  ', true))
  lines.push(`${I}}`)
  return lines
}

function emitSeparator(seg: SeparatorSegment, ctx: SegmentEmitCtx): string[] {
  const out = ctx.varName
  const g = ctx.config.global.emoji
  const u = ctx.uid
  const wVar = `_${u}W`
  const sepVar = `_${u}Sep`
  const lines: string[] = [`${I}// --- ${SEGMENT_COMMENT.separator} ---`]
  if (seg.width === 'full') {
    lines.push(`${I}const ${wVar} = parseInt(process.env.COLUMNS, 10) || 80;`)
  } else {
    lines.push(`${I}const ${wVar} = ${seg.width};`)
  }
  lines.push(`${I}let ${out} = "";`)
  lines.push(`${I}if (${wVar} > 0 && ${jsStr(seg.fill)}) {`)
  lines.push(`${I}  const ${sepVar} = ${jsStr(seg.fill)}.repeat(${wVar});`)
  lines.push(...assignDecorated(out, seg, g, [v(sepVar)], seg.style, I + '  ', true))
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
