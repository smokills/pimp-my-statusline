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
  PrSegment,
  Segment,
  SegmentType,
  SeparatorSegment,
  SimpleSegment,
  StaticTextSegment,
  TextStyle,
  ThresholdStop,
  SegmentRender,
} from './types'
import type { MockData } from './mock'
import {
  barString,
  fmtCost,
  fmtDuration,
  resolveThreshold,
  timeUntil,
  truncPct,
} from './evaluate-helpers'

export type HelperId =
  | 'colorPct'
  | 'bar'
  | 'timeUntil'
  | 'petFrame'
  | 'pad'
  | 'truncCols'
  | 'fmtCost'
  | 'fmtDuration'
  | 'gitBranch'

export interface SegmentDef {
  type: SegmentType
  label: string // UI display name
  description: string // one-liner: what this element shows
  sources: string[] // JSON paths this segment reads
  metric: boolean // gauge-capable?
  emojiDefault?: string
  defaults: () => Omit<Segment, 'id'>
  helpers: HelperId[]
  evaluate(seg: Segment, mock: MockData): SegmentRender
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
  valueSpans: SegmentRender['spans'],
): SegmentRender {
  if (valueSpans.length === 0) return EMPTY
  const spans: SegmentRender['spans'] = []
  if (seg.emoji?.show && seg.emoji.glyph) {
    spans.push(span(seg.emoji.glyph + ' '))
  }
  if (seg.label?.show && seg.label.text) {
    spans.push(span(seg.label.text + ' ', seg.label.style))
  }
  if (seg.prefix) spans.push(span(seg.prefix, seg.prefixStyle))
  spans.push(...valueSpans)
  if (seg.suffix) spans.push(span(seg.suffix, seg.suffixStyle))
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
  // `?? null`: a malformed bucket with no resets_at must read as "no reset"
  // (timer dropped), never as NaN reaching timeUntil.
  return { pct: truncPct(bucket.used_percentage), resetsAt: bucket.resets_at ?? null }
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
  return decorate(seg, value)
}

// ---------------------------------------------------------------------------
// Per-type evaluators
// ---------------------------------------------------------------------------

function evaluateDirectory(
  seg: DirectorySegment,
  mock: MockData,
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
  return decorate(seg, [span(display, seg.style)])
}

function evaluateSimple(
  seg: SimpleSegment,
  mock: MockData,
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
  return decorate(seg, [span(value, seg.style)])
}

function evaluateLines(
  seg: LinesSegment,
  mock: MockData,
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
  return decorate(seg, value)
}

function evaluatePr(
  seg: PrSegment,
  mock: MockData,
): SegmentRender {
  if (mock.pr === undefined) return EMPTY
  const value: SegmentRender['spans'] = [span(`#${mock.pr.number}`, seg.style)]
  if (seg.showState && mock.pr.review_state) {
    value.push(span(' '))
    value.push(span(mock.pr.review_state, seg.style))
  }
  return decorate(seg, value)
}

function evaluateSeparator(
  seg: SeparatorSegment,
  mock: MockData,
): SegmentRender {
  const count = seg.width === 'full' ? mock._columns : seg.width
  if (count <= 0 || seg.fill === '') return EMPTY
  return decorate(seg, [span(seg.fill.repeat(count), seg.style)])
}

function evaluateStaticText(
  seg: StaticTextSegment,
  _mock: MockData,
): SegmentRender {
  if (seg.text === '') return EMPTY
  return decorate(seg, [span(seg.text, seg.style)])
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
    description: 'your current working directory, shortened to taste',
    sources: ['cwd', 'workspace.current_dir'],
    metric: false,
    defaults: directoryDefaults,
    helpers: [],
    evaluate: (seg, mock) =>
      evaluateDirectory(seg as DirectorySegment, mock),
  },
  gitBranch: {
    type: 'gitBranch',
    label: 'Git branch',
    description: 'the checked-out git branch (empty outside a repo)',
    sources: ['_gitBranch'],
    metric: false,
    defaults: () => simpleDefaults('gitBranch'),
    helpers: ['gitBranch'],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  model: {
    type: 'model',
    label: 'Model',
    description: "the active Claude model's display name",
    sources: ['model.display_name'],
    metric: false,
    defaults: () => simpleDefaults('model'),
    helpers: [],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  effort: {
    type: 'effort',
    label: 'Effort',
    description: 'the reasoning-effort level, when the model reports one',
    sources: ['effort.level'],
    metric: false,
    defaults: () => simpleDefaults('effort'),
    helpers: [],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  context: {
    type: 'context',
    label: 'Context',
    description: 'how full the context window is (% of tokens used)',
    sources: ['context_window.used_percentage'],
    metric: true,
    defaults: () => metricDefaults('context', 'Context', ['percent']),
    helpers: ['colorPct', 'bar'],
    evaluate: (seg, mock) => evaluateMetric(seg as MetricSegment, mock),
  },
  session: {
    type: 'session',
    label: 'Session (5h)',
    description: '5-hour rate-limit usage, with a countdown to the reset',
    sources: [
      'rate_limits.five_hour.used_percentage',
      'rate_limits.five_hour.resets_at',
    ],
    metric: true,
    defaults: () =>
      metricDefaults('session', 'Session', ['bar', 'percent', 'timer']),
    helpers: ['colorPct', 'bar', 'timeUntil'],
    evaluate: (seg, mock) => evaluateMetric(seg as MetricSegment, mock),
  },
  week: {
    type: 'week',
    label: 'Week (7d)',
    description: '7-day rate-limit usage, with a countdown to the reset',
    sources: [
      'rate_limits.seven_day.used_percentage',
      'rate_limits.seven_day.resets_at',
    ],
    metric: true,
    defaults: () => metricDefaults('week', 'Week', ['bar', 'percent']),
    helpers: ['colorPct', 'bar', 'timeUntil'],
    evaluate: (seg, mock) => evaluateMetric(seg as MetricSegment, mock),
  },
  cost: {
    type: 'cost',
    label: 'Cost',
    description: 'what this session has cost so far, in USD',
    sources: ['cost.total_cost_usd'],
    metric: false,
    defaults: () => simpleDefaults('cost'),
    helpers: ['fmtCost'],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  duration: {
    type: 'duration',
    label: 'Duration',
    description: 'wall-clock duration of the session',
    sources: ['cost.total_duration_ms'],
    metric: false,
    defaults: () => simpleDefaults('duration'),
    helpers: ['fmtDuration'],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  lines: {
    type: 'lines',
    label: 'Lines changed',
    description: 'lines of code added / removed this session',
    sources: ['cost.total_lines_added', 'cost.total_lines_removed'],
    metric: false,
    defaults: linesDefaults,
    helpers: [],
    evaluate: (seg, mock) => evaluateLines(seg as LinesSegment, mock),
  },
  outputStyle: {
    type: 'outputStyle',
    label: 'Output style',
    description: "the active output style's name",
    sources: ['output_style.name'],
    metric: false,
    defaults: () => simpleDefaults('outputStyle'),
    helpers: [],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  vimMode: {
    type: 'vimMode',
    label: 'Vim mode',
    description: 'the current vim editing mode (when vim bindings are on)',
    sources: ['vim.mode'],
    metric: false,
    defaults: () => simpleDefaults('vimMode'),
    helpers: [],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  sessionName: {
    type: 'sessionName',
    label: 'Session name',
    description: "the session's name, when one is set",
    sources: ['session_name'],
    metric: false,
    defaults: () => simpleDefaults('sessionName'),
    helpers: [],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  agent: {
    type: 'agent',
    label: 'Agent',
    description: "the running subagent's name, when one is active",
    sources: ['agent.name'],
    metric: false,
    defaults: () => simpleDefaults('agent'),
    helpers: [],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  pr: {
    type: 'pr',
    label: 'Pull request',
    description: 'the open pull request number (and review state)',
    sources: ['pr.number', 'pr.review_state'],
    metric: false,
    defaults: prDefaults,
    helpers: [],
    evaluate: (seg, mock) => evaluatePr(seg as PrSegment, mock),
  },
  thinking: {
    type: 'thinking',
    label: 'Thinking',
    description: 'shown while extended thinking is enabled',
    sources: ['thinking.enabled'],
    metric: false,
    defaults: () => simpleDefaults('thinking'),
    helpers: [],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  version: {
    type: 'version',
    label: 'Version',
    description: 'the Claude Code version',
    sources: ['version'],
    metric: false,
    defaults: () => simpleDefaults('version'),
    helpers: [],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  worktree: {
    type: 'worktree',
    label: 'Worktree',
    description: 'the git worktree name, when working in one',
    sources: ['worktree.name'],
    metric: false,
    defaults: () => simpleDefaults('worktree'),
    helpers: [],
    evaluate: (seg, mock) => evaluateSimple(seg as SimpleSegment, mock),
  },
  separator: {
    type: 'separator',
    label: 'Separator',
    description: 'a horizontal rule between rows',
    sources: ['_columns'],
    metric: false,
    defaults: separatorDefaults,
    helpers: ['truncCols'],
    evaluate: (seg, mock) =>
      evaluateSeparator(seg as SeparatorSegment, mock),
  },
  staticText: {
    type: 'staticText',
    label: 'Static text',
    description: 'a literal text snippet of your choosing',
    sources: [],
    metric: false,
    defaults: staticTextDefaults,
    helpers: [],
    evaluate: (seg, mock) =>
      evaluateStaticText(seg as StaticTextSegment, mock),
  },
}

/** Convenience: evaluate any segment by dispatching on its `type`. */
export function evaluateSegment(
  seg: Segment,
  mock: MockData,
): SegmentRender {
  return SEGMENTS[seg.type].evaluate(seg, mock)
}
