// Bash emitter. Produces a readable, hand-editable POSIX-ish bash script that
// reads the Claude Code statusline JSON on stdin and prints the same bytes the
// preview's renderToAnsi produces.
//
// PERFORMANCE: all stdin fields are pulled in a SINGLE jq pass into EX_* shell
// variables (statuslines run on every prompt — one jq spawn beats a dozen). The
// extraction is NUL-separated so a field value may legitimately contain any
// byte including newlines/tabs.
//
// PORTABILITY (each rule was a real found defect — see the generated comments):
//  - shebang /usr/bin/env bash
//  - jq preflight, exit 0 (so CC never shows a broken statusline)
//  - ALL ANSI via real ESC bytes ($'\033[...m'); output via printf '%s\n' —
//    NEVER echo -e / printf '%b' (those reinterpret backslashes in runtime
//    data like branch names; with real ESC bytes %s is byte-exact and safe)
//  - NEVER date -d "<string>"; clock from PMSL_NOW
//  - percent via jq floor (never cut -d.), then clamp
//  - bar guards the zero-count printf
//  - cost via LC_NUMERIC=C printf '%.2f'
//  - git branch via PMSL_GIT_BRANCH override (- not :-, so empty overrides)

import type { HelperId } from '../model/segments'
import type {
  LinesSegment,
  MetricSegment,
  Segment,
  SeparatorSegment,
  SimpleSegment,
  StaticTextSegment,
  DirectorySegment,
  PrSegment,
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
import { bashColorFn, bashHelper, bashSgrWrap } from './helpers/bash'
import { emitBashPet, emitBashPetCompose } from './pets/bash'
import { petMetricPath, hasPet } from './pets/shared'
import { SEGMENT_COMMENT } from './segments/labels'

// ---------------------------------------------------------------------------
// Bash literal escaping
// ---------------------------------------------------------------------------

/** Escape text for a bash DOUBLE-quoted context. Backslash, $, `, " escaped.
 *  Literal newlines/tabs are fine inside "..." and round-trip as bytes. */
function dq(text: string): string {
  return text.replace(/[\\$`"]/g, (c) => '\\' + c)
}

/** Escape text for a bash SINGLE-quoted context ('...'): a single quote becomes
 *  '\'' . Everything else (incl. newlines) is literal. */
function sq(text: string): string {
  return text.replace(/'/g, `'\\''`)
}

/** A $'\033[params m' ANSI-C literal (real ESC byte). */
function esc(params: string): string {
  return `$'\\033[${params}m'`
}

/** A jq object-access path: ['model','display_name'] → `.model.display_name`. */
function jqPath(path: string[]): string {
  return '.' + path.join('.')
}

/** jq presence test for an object path (key present at each level). */
function jqHas(path: string[]): string {
  // (.a // {}) | has("b") chained: build nested has() so an absent parent is
  // safe. For a single-key path it is just `has("a")` on the root.
  if (path.length === 1) return `has("${path[0]}")`
  const parent = path.slice(0, -1)
  const key = path[path.length - 1]
  return `(${jqPath(parent)} // {}) | has("${key}")`
}

// ---------------------------------------------------------------------------
// Single-pass extraction
//
// Each enabled segment (and the pet) contributes "field specs": a jq expression
// producing one raw value, plus the EX_* variable that receives it. We emit ONE
// jq program that concatenates every field NUL-terminated, and a grouped block
// of `read -r -d ''` that fills the variables. NUL separation is the only fully
// byte-safe choice (values may contain newlines/tabs).
// ---------------------------------------------------------------------------

interface FieldSpec {
  /** EX_* variable name (without the leading $). */
  var: string
  /** jq expression yielding a string/number/flag. */
  jq: string
  /** Optional comment describing the field (for the listing). */
  note?: string
}

/** Collect the field specs needed by the enabled segments + pet, in document
 *  order. gitBranch is NOT here (it comes from $PMSL_GIT_BRANCH/git, not jq). */
function collectFields(config: StatuslineConfig, uidOf: (seg: Segment) => string): FieldSpec[] {
  const fields: FieldSpec[] = []
  const push = (varName: string, jq: string, note?: string) =>
    fields.push({ var: varName, jq, note })

  // The directory source is shared (cwd ?? workspace.current_dir); emit once.
  let dirEmitted = false
  const ensureDir = () => {
    if (dirEmitted) return
    push('EX_dir', `(${jqPath(DIR_CWD)} // ${jqPath(DIR_WORKSPACE)} // "")`, 'directory / git cwd')
    dirEmitted = true
  }
  if (hasGitSegment(config)) ensureDir()

  for (const row of config.rows) {
    for (const seg of row.segments) {
      if (!seg.enabled) continue
      const u = uidOf(seg)
      switch (seg.type) {
        case 'directory':
          ensureDir()
          break
        case 'gitBranch':
          ensureDir() // git -C needs the cwd
          break
        case 'model':
        case 'effort':
        case 'outputStyle':
        case 'vimMode':
        case 'sessionName':
        case 'agent':
        case 'version':
        case 'worktree':
          push(`EX_${u}`, `(${jqPath(simplePath(seg.type))} // "")`, SEGMENT_COMMENT[seg.type])
          break
        case 'thinking':
          push(`EX_${u}`, '(if (.thinking.enabled // false) then "thinking" else "" end)', 'Thinking')
          break
        case 'cost':
          push(`EX_${u}_has`, jqFlag(jqHas(['cost'])), 'Cost present')
          push(`EX_${u}`, `(${jqPath(COST_TOTAL_USD)} // 0)`, 'Cost USD')
          break
        case 'duration':
          push(`EX_${u}_has`, jqFlag(jqHas(['cost'])), 'Duration: cost present')
          push(`EX_${u}`, `(${jqPath(COST_DURATION_MS)} // 0)`, 'Duration ms')
          break
        case 'lines':
          push(`EX_${u}_has`, jqFlag(jqHas(['cost'])), 'Lines: cost present')
          push(`EX_${u}_add`, `(${jqPath(COST_LINES_ADDED)} // 0)`, 'Lines added')
          push(`EX_${u}_rem`, `(${jqPath(COST_LINES_REMOVED)} // 0)`, 'Lines removed')
          break
        case 'context':
        case 'session':
        case 'week': {
          const m = seg.type as MetricType
          // Only context gates on source presence; session/week always render
          // (fresh-session default: pct 0, no reset — see metricSource()). The
          // `// 0` extraction already yields 0 when rate_limits is absent.
          if (m === 'context') {
            push(`EX_${u}_has`, jqFlag(jqHas(metricSourcePath(m))), `${SEGMENT_COMMENT[m]} present`)
          }
          push(`EX_${u}_p`, `(${jqPath(metricPctPath(m))} // 0 | floor)`, `${SEGMENT_COMMENT[m]} %`)
          if (m !== 'context' && (seg as MetricSegment).parts.includes('timer')) {
            push(`EX_${u}_reset`, `(${jqPath(metricResetPath(m))} // "")`, `${SEGMENT_COMMENT[m]} reset`)
          }
          break
        }
        case 'pr':
          push(`EX_${u}_has`, jqFlag(jqHas(['pr'])), 'PR present')
          push(`EX_${u}_num`, `(${jqPath(PR_NUMBER)} // "")`, 'PR number')
          if ((seg as PrSegment).showState) {
            push(`EX_${u}_state`, `(${jqPath(PR_REVIEW_STATE)} // "")`, 'PR review state')
          }
          break
        case 'separator':
        case 'staticText':
          break // no jq fields
      }
    }
  }

  // Pet bound-metric percent (when a pet is enabled).
  if (hasPet(config)) {
    push('EX_pet_p', `(${jqPath(petMetricPath(config.pet.metric))} // 0 | floor)`, 'Pet bound metric %')
  }

  return fields
}

/** jq boolean → "1"/"0" string flag. */
function jqFlag(expr: string): string {
  return `(if (${expr}) then "1" else "0" end)`
}

function hasGitSegment(config: StatuslineConfig): boolean {
  return config.rows.some((r) => r.segments.some((s) => s.enabled && s.type === 'gitBranch'))
}

/** Emit the single-pass extraction block (or nothing if no jq fields needed).
 *  Reads from a PROCESS SUBSTITUTION (not a pipe) so the assigned variables
 *  persist in the current shell — a `jq | { read; }` pipe would run the reads
 *  in a subshell and lose them. */
function emitExtraction(fields: FieldSpec[]): string[] {
  if (fields.length === 0) return []
  const lines: string[] = []
  lines.push('# --- Extract every needed stdin field in ONE jq pass ---')
  lines.push('# NUL-separated so a value may contain any byte (newlines, tabs).')
  lines.push('# Fields, in order:')
  for (const f of fields) lines.push(`#   ${f.var} = ${f.note ?? f.jq}`)
  // The jq program: each field, then a NUL. tostring keeps numbers/flags as
  // text; raw output (-j, no trailing newline) preserves embedded bytes.
  const jqBody = fields.map((f) => `(${f.jq} | tostring), "\\u0000"`).join(',\n  ')
  lines.push('{')
  for (const f of fields) {
    lines.push(`  IFS= read -r -d '' ${f.var}`)
  }
  lines.push('} < <(jq -j \'')
  lines.push(`  ${jqBody}`)
  lines.push('\' <<<"$input")')
  return lines
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

/** Serialize one span to a bash expression fragment. */
function bashSpan(span: PlanSpan): string {
  const body = piecesToDq(span.pieces)
  if (span.threshold) {
    const { fn, pctVar, boldDim } = span.threshold
    return `"$(sgr_wrap '${boldDim}' "$(${fn} "$${pctVar}")" "${body}")"`
  }
  if (span.concrete) {
    return `${esc(span.concrete)}"${body}"${esc('0')}`
  }
  return `"${body}"`
}

/** Serialize value spans into the RHS of an assignment, honoring runtime-
 *  conditional spans (the metric timer / pr state). */
function assignSpans(outVar: string, spans: ValueSpan[]): string[] {
  const lines: string[] = []
  const staticParts: string[] = []
  const conditionals: { whenVar: string; parts: string[] }[] = []

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
// Per-segment emit. Segments read pre-extracted EX_* variables.
// ---------------------------------------------------------------------------

function emitSimple(seg: SimpleSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  const u = ctx.uid
  const tmp = `_${u}`
  lines.push(`# --- ${SEGMENT_COMMENT[seg.type]} ---`)

  if (seg.type === 'gitBranch') {
    lines.push(
      `${tmp}="\${PMSL_GIT_BRANCH-$(git -C "$EX_dir" branch --show-current 2>/dev/null)}"`,
    )
    lines.push(...guardNonEmpty(tmp, out, seg, [v(tmp)], seg.style))
    return lines
  }
  if (seg.type === 'cost') {
    lines.push(`if [ "$EX_${u}_has" = "1" ]; then`)
    lines.push(`  ${tmp}=$(fmt_cost "$EX_${u}")`)
    lines.push(...indent(assignDecorated(out, seg, [v(tmp)], seg.style)))
    lines.push('else')
    lines.push(`  ${out}=''`)
    lines.push('fi')
    return lines
  }
  if (seg.type === 'duration') {
    lines.push(`if [ "$EX_${u}_has" = "1" ]; then`)
    lines.push(`  ${tmp}=$(fmt_duration "$EX_${u}")`)
    lines.push(...indent(assignDecorated(out, seg, [v(tmp)], seg.style)))
    lines.push('else')
    lines.push(`  ${out}=''`)
    lines.push('fi')
    return lines
  }

  // String-valued simple segments (model/effort/.../thinking): EX_<uid> holds
  // the value (already "" when absent).
  lines.push(...guardNonEmpty(`EX_${u}`, out, seg, [v(`EX_${u}`)], seg.style))
  return lines
}

/** Emit an `if [ -n "$var" ]` guard wrapping a decorated assignment. */
function guardNonEmpty(
  testVar: string,
  out: string,
  seg: Segment,
  pieces: TextPiece[],
  style: TextStyle | undefined,
): string[] {
  const lines: string[] = []
  lines.push(`if [ -n "$${testVar}" ]; then`)
  lines.push(...indent(assignDecorated(out, seg, pieces, style)))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

/** Build + assign a decorated single-value segment. */
function assignDecorated(
  out: string,
  seg: Segment,
  pieces: TextPiece[],
  style: TextStyle | undefined,
): string[] {
  const valueSpans: ValueSpan[] = [{ span: concreteSpan(pieces, style) }]
  return assignSpans(out, decorate(seg, valueSpans))
}

function emitDirectory(seg: DirectorySegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  const u = ctx.uid
  const disp = `_${u}_disp`
  lines.push(`# --- ${SEGMENT_COMMENT.directory} ---`)
  lines.push(`${disp}="$EX_dir"`)
  if (seg.dirStyle === 'basename') {
    lines.push(`${disp}="\${${disp}%/}"; ${disp}="\${${disp}##*/}"`)
    lines.push(`[ -z "$${disp}" ] && ${disp}="$EX_dir"`)
  } else if (seg.dirStyle === 'tildeHome') {
    lines.push(`if [ "$${disp}" = "$HOME" ]; then ${disp}="~"`)
    lines.push(`elif [ "\${${disp}#"$HOME"/}" != "$${disp}" ]; then ${disp}="~\${${disp}#"$HOME"}"; fi`)
  }
  lines.push(`if [ -n "$EX_dir" ]; then`)
  lines.push(...indent(assignDecorated(out, seg, [v(disp)], seg.style)))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

function emitMetric(seg: MetricSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  const u = ctx.uid
  lines.push(`# --- ${SEGMENT_COMMENT[seg.type]} ---`)
  const pVar = `_${u}_p`
  const barVar = `_${u}_bar`
  const pctTextVar = `_${u}_pct`
  const timerVar = seg.type === 'context' ? null : `_${u}_timer`

  // Only context gates on source presence. session/week always render: an
  // absent rate_limits leaves EX_<u>_p at 0 (// 0) and EX_<u>_reset empty (// "")
  // ⇒ default state (bar empty, "0%", timer omitted). The body is otherwise
  // identical; gated lines just carry an extra indent.
  const gated = seg.type === 'context'
  const body: string[] = []
  body.push(`${pVar}="$EX_${u}_p"`)
  body.push(`[ "$${pVar}" -lt 0 ] && ${pVar}=0; [ "$${pVar}" -gt 100 ] && ${pVar}=100`)
  if (seg.parts.includes('bar')) {
    body.push(
      `${barVar}=$(bar "$${pVar}" ${seg.barWidth} '${sq(seg.barChars.filled)}' '${sq(seg.barChars.empty)}')`,
    )
  }
  if (seg.parts.includes('percent')) {
    body.push(`${pctTextVar}="$${pVar}%"`)
  }
  if (timerVar && seg.parts.includes('timer')) {
    body.push(`if [ -n "$EX_${u}_reset" ]; then ${timerVar}=$(time_until "$EX_${u}_reset" "$NOW"); else ${timerVar}=''; fi`)
  }

  const valueSpans = metricValueSpans(seg, {
    pctVar: pVar,
    barVar,
    pctTextVar,
    timerVar: seg.parts.includes('timer') ? timerVar : null,
    colorFnName: ctx.colorFnName,
  })
  body.push(...assignSpans(out, decorate(seg, valueSpans)))

  if (gated) {
    lines.push(`if [ "$EX_${u}_has" = "1" ]; then`)
    lines.push(...indent(body))
    lines.push('else')
    lines.push(`  ${out}=''`)
    lines.push('fi')
  } else {
    lines.push(...body)
  }
  return lines
}

function emitLines(seg: LinesSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  const u = ctx.uid
  const addVar = `_${u}_add`
  const remVar = `_${u}_rem`
  lines.push(`# --- ${SEGMENT_COMMENT.lines} ---`)
  lines.push(`if [ "$EX_${u}_has" = "1" ]; then`)
  lines.push(`  ${addVar}="$EX_${u}_add"`)
  lines.push(`  ${remVar}="$EX_${u}_rem"`)
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
  lines.push(...indent(assignSpans(out, decorate(seg, value))))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

function emitPr(seg: PrSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  const u = ctx.uid
  const numVar = `_${u}_num`
  const stateVar = `_${u}_state`
  lines.push(`# --- ${SEGMENT_COMMENT.pr} ---`)
  lines.push(`if [ "$EX_${u}_has" = "1" ]; then`)
  lines.push(`  ${numVar}="$EX_${u}_num"`)
  const value: ValueSpan[] = [{ span: concreteSpan([lit('#'), v(numVar)], seg.style) }]
  if (seg.showState) {
    lines.push(`  ${stateVar}="$EX_${u}_state"`)
    value.push({ span: concreteSpan([lit(' ')], undefined), whenVar: stateVar })
    value.push({ span: concreteSpan([v(stateVar)], seg.style), whenVar: stateVar })
  }
  lines.push(...indent(assignSpans(out, decorate(seg, value))))
  lines.push('else')
  lines.push(`  ${out}=''`)
  lines.push('fi')
  return lines
}

function emitSeparator(seg: SeparatorSegment, ctx: SegmentEmitCtx): string[] {
  const lines: string[] = []
  const out = ctx.varName
  const u = ctx.uid
  const wVar = `_${u}_w`
  const sepVar = `_${u}_sep`
  lines.push(`# --- ${SEGMENT_COMMENT.separator} ---`)
  if (seg.width === 'full') {
    lines.push(`${wVar}="\${COLUMNS:-80}"`)
  } else {
    lines.push(`${wVar}=${seg.width}`)
  }
  lines.push(`if [ "$${wVar}" -gt 0 ] && [ -n '${sq(seg.fill)}' ]; then`)
  lines.push(`  ${sepVar}=$(printf '${sq(seg.fill)}%.0s' $(seq 1 "$${wVar}"))`)
  lines.push(...indent(assignDecorated(out, seg, [v(sepVar)], seg.style)))
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
  const all = decorate(seg, [
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
    ]
  },

  extraction(config, uidOf) {
    return emitExtraction(collectFields(config, uidOf))
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
    lines.push('# A dropped (empty) segment contributes NOTHING, including its join.')
    for (const plan of rows) {
      lines.push(`${plan.rowVar}=''`)
      for (let i = 0; i < plan.segments.length; i++) {
        const ps = plan.segments[i]
        const join = ps.seg.joinBefore ?? plan.joiner
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
