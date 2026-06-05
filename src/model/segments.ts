// Segment registry — the shared semantics layer. SEGMENTS[type].evaluate(...)
// is the canonical renderer the preview uses AND the spec the bash/python/node
// generators mirror byte-for-byte. Each entry also declares the runtime
// `helpers` it needs (so codegen emits only used helpers) and its JSON
// `sources` (docs + mock wiring).
//
// Absence semantics: when a segment's required source is absent, evaluate()
// returns `{ spans: [] }` so the row join drops it cleanly (no dangling joiner).
// "Absent" (key missing) and "null" are distinct: e.g. context_window present
// with used_percentage null ⇒ render 0%, but context_window absent ⇒ dropped.

import type {
  DirectorySegment,
  LinesSegment,
  MetricSegment,
  PeakSegment,
  PrSegment,
  Segment,
  SegmentType,
  SeparatorSegment,
  SimpleSegment,
  StaticTextSegment,
  TextStyle,
  ThresholdStop,
  RenderCtx,
  SegmentRender,
} from './types'
import type { MockData } from './mock'
import {
  barString,
  fmtCost,
  fmtDuration,
  peakState,
  resolveThreshold,
  timeUntil,
  truncPct,
} from './evaluate-helpers'

export type HelperId =
  | 'colorPct'
  | 'bar'
  | 'timeUntil'
  | 'peak'
  | 'petFrame'
  | 'pad'
  | 'truncCols'
  | 'fmtCost'
  | 'fmtDuration'
  | 'gitBranch'

export interface SegmentDef {
  type: SegmentType
  label: string // UI display name
  sources: string[] // JSON paths this segment reads
  metric: boolean // gauge-capable?
  emojiDefault?: string
  defaults: () => Omit<Segment, 'id'>
  helpers: HelperId[]
  evaluate(seg: Segment, mock: MockData, ctx: RenderCtx): SegmentRender
}

// INVARIANT: SEGMENTS is keyed by SegmentType, and SEGMENTS[t].type === t for
// every key t. Likewise every `seg` passed to SEGMENTS[seg.type].evaluate has
// `seg.type` equal to that key. This invariant is what makes the per-evaluate
// `as` narrowing casts below sound: a registry entry only ever receives a
// segment of its own discriminant. evaluateSegment() at the bottom enforces the
// dispatch side of the invariant.

// ---------------------------------------------------------------------------
// Span helpers
// ---------------------------------------------------------------------------

const EMPTY: SegmentRender = { spans: [] }

function span(text: string, style?: TextStyle) {
  return style ? { text, style } : { text }
}

/** Prepend label and/or emoji spans, then wrap value spans with prefix/suffix.
 *  Returns empty if `valueSpans` is empty (so absence cleanly drops the segment). */
function decorate(
  seg: Segment,
  ctx: RenderCtx,
  valueSpans: SegmentRender['spans'],
): SegmentRender {
  if (valueSpans.length === 0) return EMPTY
  const spans: SegmentRender['spans'] = []
  if (ctx.emoji && seg.emoji?.show && seg.emoji.glyph) {
    spans.push(span(seg.emoji.glyph + ' '))
  }
  if (seg.label?.show && seg.label.text) {
    spans.push(span(seg.label.text + ' ', seg.label.style))
  }
  if (seg.prefix) spans.push(span(seg.prefix))
  spans.push(...valueSpans)
  if (seg.suffix) spans.push(span(seg.suffix))
  return { spans }
}

/** Canonical default threshold triplet — single source of truth, imported by
 *  defaultPreset (segment value styles) and GlobalOptions.defaultThresholds.
 *  Matches the user's script color(): >=90 red(31), >=70 yellow(33), else
 *  green(32); ansi16 codes for byte-faithfulness. */
export const DEFAULT_THRESHOLD_STOPS: readonly Readonly<ThresholdStop>[] = [
  { at: 90, code: 31, ansi16: true },
  { at: 70, code: 33, ansi16: true },
  { at: 0, code: 32, ansi16: true },
]

/** Fresh deep copy for embedding into configs. Configs are edited in place by
 *  the UI; sharing one array instance across segments would make a threshold
 *  edit on one segment bleed into the others. */
export function defaultThresholdStops(): ThresholdStop[] {
  return DEFAULT_THRESHOLD_STOPS.map((s) => ({ ...s }))
}

// ---------------------------------------------------------------------------
// Metric segments (context / session / week)
// ---------------------------------------------------------------------------

/** Resolve the percentage + reset for a metric segment from the mock.
 *  Returns null when the SOURCE OBJECT is absent (⇒ segment dropped). */
function metricSource(
  type: 'context' | 'session' | 'week',
  mock: MockData,
): { pct: number; resetsAt: number | null } | null {
  if (type === 'context') {
    if (mock.context_window === undefined) return null
    // present-but-null used_percentage ⇒ 0; context has no reset timestamp.
    return { pct: truncPct(mock.context_window.used_percentage), resetsAt: null }
  }
  const bucket =
    type === 'session' ? mock.rate_limits?.five_hour : mock.rate_limits?.seven_day
  if (bucket === undefined) return null
  return { pct: truncPct(bucket.used_percentage), resetsAt: bucket.resets_at }
}

/** Resolve a possibly-threshold style into a concrete color for `pct`.
 *
 *  evaluate() is the only place that knows the segment's percentage, so
 *  threshold colors are resolved HERE and SegmentRender spans always carry
 *  concrete (fixed/ansi16) colors. The generators do the opposite: they read
 *  the threshold stops from the CONFIG and emit a runtime `color(pct)` helper
 *  that mirrors resolveThreshold's tie-break. */
function concreteStyle(
  style: TextStyle | undefined,
  pct: number,
): TextStyle | undefined {
  if (!style?.color || style.color.kind !== 'threshold') return style
  const stop = resolveThreshold(style.color.stops, pct)
  if (stop === null) return { ...style, color: undefined }
  return {
    ...style,
    color: stop.ansi16
      ? { kind: 'ansi16', code: stop.code }
      : { kind: 'fixed', code: stop.code },
  }
}

function evaluateMetric(
  seg: MetricSegment,
  mock: MockData,
  ctx: RenderCtx,
): SegmentRender {
  const src = metricSource(seg.type, mock)
  if (src === null) return EMPTY
  const { pct, resetsAt } = src

  const value: SegmentRender['spans'] = []
  for (let i = 0; i < seg.parts.length; i++) {
    const part = seg.parts[i]
    const pieces: SegmentRender['spans'] = []
    if (part === 'bar') {
      const bar = barString(
        pct,
        seg.barWidth,
        seg.barChars.filled,
        seg.barChars.empty,
      )
      pieces.push(span(bar, concreteStyle(seg.barStyle ?? seg.valueStyle, pct)))
    } else if (part === 'percent') {
      pieces.push(span(`${pct}%`, concreteStyle(seg.valueStyle, pct)))
    } else if (part === 'timer') {
      // Timer is only meaningful for session/week and only when a reset is
      // present AND the countdown is non-empty. Context renders an empty timer.
      if (resetsAt !== null) {
        const t = timeUntil(resetsAt, mock._now)
        if (t !== '') pieces.push(span(`(${t})`, seg.timerStyle))
      }
    }
    if (pieces.length === 0) continue
    // Single space between rendered parts.
    if (value.length > 0) value.push(span(' '))
    value.push(...pieces)
  }
  return decorate(seg, ctx, value)
}

// ---------------------------------------------------------------------------
// Per-type evaluators
// ---------------------------------------------------------------------------

function evaluateDirectory(
  seg: DirectorySegment,
  mock: MockData,
  ctx: RenderCtx,
): SegmentRender {
  const cwd = mock.cwd ?? mock.workspace.current_dir ?? ''
  if (cwd === '') return EMPTY
  let display = cwd
  if (seg.dirStyle === 'basename') {
    const parts = cwd.replace(/\/+$/, '').split('/')
    display = parts[parts.length - 1] || cwd
  } else if (seg.dirStyle === 'tildeHome') {
    const home = mock._home ?? '/home/vito'
    if (cwd === home) display = '~'
    else if (cwd.startsWith(home + '/')) display = '~' + cwd.slice(home.length)
  }
  return decorate(seg, ctx, [span(display, seg.style)])
}

function evaluateSimple(
  seg: SimpleSegment,
  mock: MockData,
  ctx: RenderCtx,
): SegmentRender {
  let value: string | undefined
  switch (seg.type) {
    case 'gitBranch':
      value = mock._gitBranch || undefined // empty/absent → dropped
      break
    case 'model':
      value = mock.model.display_name || undefined
      break
    case 'effort':
      value = mock.effort?.level
      break
    case 'cost':
      value = mock.cost ? fmtCost(mock.cost.total_cost_usd) : undefined
      break
    case 'duration':
      value = mock.cost ? fmtDuration(mock.cost.total_duration_ms) : undefined
      break
    case 'outputStyle':
      value = mock.output_style?.name
      break
    case 'vimMode':
      value = mock.vim?.mode
      break
    case 'sessionName':
      value = mock.session_name
      break
    case 'agent':
      value = mock.agent?.name
      break
    case 'thinking':
      value = mock.thinking?.enabled ? 'thinking' : undefined
      break
    case 'version':
      value = mock.version || undefined
      break
    case 'worktree':
      value = mock.worktree?.name
      break
    default: {
      // Exhaustiveness guard: adding a SimpleSegment `type` without a branch
      // above fails compilation here.
      const _exhaustive: never = seg.type
      return _exhaustive
    }
  }
  if (value === undefined || value === '') return EMPTY
  return decorate(seg, ctx, [span(value, seg.style)])
}

function evaluatePeak(
  seg: PeakSegment,
  mock: MockData,
  ctx: RenderCtx,
): SegmentRender {
  const { inPeak, target } = peakState(
    mock._now,
    seg.tz,
    seg.windowDays,
    seg.startHour,
    seg.endHour,
  )
  const value: SegmentRender['spans'] = []
  value.push(
    span(inPeak ? 'Peak' : 'Off-peak', inPeak ? seg.peakStyle : seg.offPeakStyle),
  )
  if (seg.showCountdown) {
    const t = timeUntil(target, mock._now)
    if (t !== '') {
      value.push(span(' '))
      value.push(span(`(${t})`, { dim: true }))
    }
  }
  return decorate(seg, ctx, value)
}

function evaluateLines(
  seg: LinesSegment,
  mock: MockData,
  ctx: RenderCtx,
): SegmentRender {
  if (mock.cost === undefined) return EMPTY
  const added = mock.cost.total_lines_added
  const removed = mock.cost.total_lines_removed
  const value: SegmentRender['spans'] = []
  if (seg.linesStyle === 'addedOnly') {
    value.push(span(`+${added}`, seg.addedStyle))
  } else if (seg.linesStyle === 'removedOnly') {
    value.push(span(`-${removed}`, seg.removedStyle))
  } else {
    value.push(span(`+${added}`, seg.addedStyle))
    value.push(span(' '))
    value.push(span(`-${removed}`, seg.removedStyle))
  }
  return decorate(seg, ctx, value)
}

function evaluatePr(
  seg: PrSegment,
  mock: MockData,
  ctx: RenderCtx,
): SegmentRender {
  if (mock.pr === undefined) return EMPTY
  const value: SegmentRender['spans'] = [span(`#${mock.pr.number}`, seg.style)]
  if (seg.showState && mock.pr.review_state) {
    value.push(span(' '))
    value.push(span(mock.pr.review_state, seg.style))
  }
  return decorate(seg, ctx, value)
}

function evaluateSeparator(
  seg: SeparatorSegment,
  mock: MockData,
  ctx: RenderCtx,
): SegmentRender {
  const count = seg.width === 'full' ? mock._columns : seg.width
  if (count <= 0 || seg.fill === '') return EMPTY
  return decorate(seg, ctx, [span(seg.fill.repeat(count), seg.style)])
}

function evaluateStaticText(
  seg: StaticTextSegment,
  _mock: MockData,
  ctx: RenderCtx,
): SegmentRender {
  if (seg.text === '') return EMPTY
  return decorate(seg, ctx, [span(seg.text, seg.style)])
}

// ---------------------------------------------------------------------------
// Default-factory helpers
//
// Each helper has an EXPLICIT concrete return type (Omit<XSegment,'id'>) so tsc
// checks field completeness at the factory definition — not via a cast at the
// call site. Adding a required field to a segment variant then surfaces as a
// type error here rather than silently producing an under-populated default.
// ---------------------------------------------------------------------------

/** Defaults shared by SimpleSegment-shaped types. */
function simpleDefaults(type: SimpleSegment['type']): Omit<SimpleSegment, 'id'> {
  return { type, enabled: true }
}

function metricDefaults(
  type: MetricSegment['type'],
  label: string,
  parts: MetricSegment['parts'],
): Omit<MetricSegment, 'id'> {
  return {
    type,
    enabled: true,
    label: { text: label, show: true },
    parts,
    barWidth: 5,
    barChars: { filled: '█', empty: '░' },
    valueStyle: { color: { kind: 'threshold', stops: defaultThresholdStops() } },
  }
}

function directoryDefaults(): Omit<DirectorySegment, 'id'> {
  return { type: 'directory', enabled: true, dirStyle: 'tildeHome' }
}

function peakDefaults(): Omit<PeakSegment, 'id'> {
  return {
    type: 'peak',
    enabled: true,
    showCountdown: true,
    tz: 'America/Los_Angeles',
    windowDays: [1, 2, 3, 4, 5],
    startHour: 5,
    endHour: 11,
  }
}

function linesDefaults(): Omit<LinesSegment, 'id'> {
  return { type: 'lines', enabled: true, linesStyle: 'combined' }
}

function prDefaults(): Omit<PrSegment, 'id'> {
  return { type: 'pr', enabled: true, showState: false }
}

function separatorDefaults(): Omit<SeparatorSegment, 'id'> {
  return { type: 'separator', enabled: true, fill: '─', width: 'full' }
}

function staticTextDefaults(): Omit<StaticTextSegment, 'id'> {
  return { type: 'staticText', enabled: true, text: '' }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SEGMENTS: Record<SegmentType, SegmentDef> = {
  directory: {
    type: 'directory',
    label: 'Directory',
    sources: ['cwd', 'workspace.current_dir'],
    metric: false,
    defaults: directoryDefaults,
    helpers: [],
    evaluate: (seg, mock, ctx) =>
      evaluateDirectory(seg as DirectorySegment, mock, ctx),
  },
  gitBranch: {
    type: 'gitBranch',
    label: 'Git branch',
    sources: ['_gitBranch'],
    metric: false,
    defaults: () => simpleDefaults('gitBranch'),
    helpers: ['gitBranch'],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  model: {
    type: 'model',
    label: 'Model',
    sources: ['model.display_name'],
    metric: false,
    defaults: () => simpleDefaults('model'),
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  effort: {
    type: 'effort',
    label: 'Effort',
    sources: ['effort.level'],
    metric: false,
    defaults: () => simpleDefaults('effort'),
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  context: {
    type: 'context',
    label: 'Context',
    sources: ['context_window.used_percentage'],
    metric: true,
    defaults: () => metricDefaults('context', 'Context', ['percent']),
    helpers: ['colorPct', 'bar'],
    evaluate: (seg, mock, ctx) => evaluateMetric(seg as MetricSegment, mock, ctx),
  },
  session: {
    type: 'session',
    label: 'Session (5h)',
    sources: [
      'rate_limits.five_hour.used_percentage',
      'rate_limits.five_hour.resets_at',
    ],
    metric: true,
    defaults: () =>
      metricDefaults('session', 'Session', ['bar', 'percent', 'timer']),
    helpers: ['colorPct', 'bar', 'timeUntil'],
    evaluate: (seg, mock, ctx) => evaluateMetric(seg as MetricSegment, mock, ctx),
  },
  week: {
    type: 'week',
    label: 'Week (7d)',
    sources: [
      'rate_limits.seven_day.used_percentage',
      'rate_limits.seven_day.resets_at',
    ],
    metric: true,
    defaults: () => metricDefaults('week', 'Week', ['bar', 'percent']),
    helpers: ['colorPct', 'bar', 'timeUntil'],
    evaluate: (seg, mock, ctx) => evaluateMetric(seg as MetricSegment, mock, ctx),
  },
  peak: {
    type: 'peak',
    label: 'Peak window',
    sources: [],
    metric: false,
    defaults: peakDefaults,
    helpers: ['peak', 'timeUntil'],
    evaluate: (seg, mock, ctx) => evaluatePeak(seg as PeakSegment, mock, ctx),
  },
  cost: {
    type: 'cost',
    label: 'Cost',
    sources: ['cost.total_cost_usd'],
    metric: false,
    defaults: () => simpleDefaults('cost'),
    helpers: ['fmtCost'],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  duration: {
    type: 'duration',
    label: 'Duration',
    sources: ['cost.total_duration_ms'],
    metric: false,
    defaults: () => simpleDefaults('duration'),
    helpers: ['fmtDuration'],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  lines: {
    type: 'lines',
    label: 'Lines changed',
    sources: ['cost.total_lines_added', 'cost.total_lines_removed'],
    metric: false,
    defaults: linesDefaults,
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateLines(seg as LinesSegment, mock, ctx),
  },
  outputStyle: {
    type: 'outputStyle',
    label: 'Output style',
    sources: ['output_style.name'],
    metric: false,
    defaults: () => simpleDefaults('outputStyle'),
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  vimMode: {
    type: 'vimMode',
    label: 'Vim mode',
    sources: ['vim.mode'],
    metric: false,
    defaults: () => simpleDefaults('vimMode'),
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  sessionName: {
    type: 'sessionName',
    label: 'Session name',
    sources: ['session_name'],
    metric: false,
    defaults: () => simpleDefaults('sessionName'),
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  agent: {
    type: 'agent',
    label: 'Agent',
    sources: ['agent.name'],
    metric: false,
    defaults: () => simpleDefaults('agent'),
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  pr: {
    type: 'pr',
    label: 'Pull request',
    sources: ['pr.number', 'pr.review_state'],
    metric: false,
    defaults: prDefaults,
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluatePr(seg as PrSegment, mock, ctx),
  },
  thinking: {
    type: 'thinking',
    label: 'Thinking',
    sources: ['thinking.enabled'],
    metric: false,
    defaults: () => simpleDefaults('thinking'),
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  version: {
    type: 'version',
    label: 'Version',
    sources: ['version'],
    metric: false,
    defaults: () => simpleDefaults('version'),
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  worktree: {
    type: 'worktree',
    label: 'Worktree',
    sources: ['worktree.name'],
    metric: false,
    defaults: () => simpleDefaults('worktree'),
    helpers: [],
    evaluate: (seg, mock, ctx) => evaluateSimple(seg as SimpleSegment, mock, ctx),
  },
  separator: {
    type: 'separator',
    label: 'Separator',
    sources: ['_columns'],
    metric: false,
    defaults: separatorDefaults,
    helpers: ['truncCols'],
    evaluate: (seg, mock, ctx) =>
      evaluateSeparator(seg as SeparatorSegment, mock, ctx),
  },
  staticText: {
    type: 'staticText',
    label: 'Static text',
    sources: [],
    metric: false,
    defaults: staticTextDefaults,
    helpers: [],
    evaluate: (seg, mock, ctx) =>
      evaluateStaticText(seg as StaticTextSegment, mock, ctx),
  },
}

/** Convenience: evaluate any segment by dispatching on its `type`. */
export function evaluateSegment(
  seg: Segment,
  mock: MockData,
  ctx: RenderCtx,
): SegmentRender {
  return SEGMENTS[seg.type].evaluate(seg, mock, ctx)
}
