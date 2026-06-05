import { describe, expect, it } from 'vitest'
import { evaluateSegment, SEGMENTS } from '../segments'
import { buildMock } from '../mock'
import type {
  DirectorySegment,
  MetricSegment,
  PeakSegment,
  RenderCtx,
  Segment,
  SeparatorSegment,
  SimpleSegment,
} from '../types'

const ctx: RenderCtx = { emoji: false }

/** Concatenate all span texts of a render (for plain-text assertions). */
function text(seg: Segment, mock = buildMock()): string {
  return evaluateSegment(seg, mock, ctx)
    .spans.map((s) => s.text)
    .join('')
}

describe('model / effort absence', () => {
  const model: SimpleSegment = { id: 'm', type: 'model', enabled: true }
  const effort: SimpleSegment = { id: 'e', type: 'effort', enabled: true }

  it('model renders display_name', () => {
    expect(text(model, buildMock({ model: { id: 'x', display_name: 'Opus' } }))).toBe(
      'Opus',
    )
  })
  it('effort dropped when absent', () => {
    expect(evaluateSegment(effort, buildMock(), ctx).spans).toEqual([])
  })
  it('effort rendered when present', () => {
    expect(text(effort, buildMock({ effort: { level: 'high' } }))).toBe('high')
  })
})

describe('metric absence vs null', () => {
  const session = SEGMENTS.session.defaults() as Omit<MetricSegment, 'id'>
  const sessionSeg: MetricSegment = { ...session, id: 's' }
  const context = SEGMENTS.context.defaults() as Omit<MetricSegment, 'id'>
  const contextSeg: MetricSegment = { ...context, id: 'c' }

  it('rate_limits absent → session dropped', () => {
    expect(evaluateSegment(sessionSeg, buildMock(), ctx).spans).toEqual([])
  })
  it('context_window absent → context dropped', () => {
    expect(evaluateSegment(contextSeg, buildMock(), ctx).spans).toEqual([])
  })
  it('context present with null used_percentage → 0%', () => {
    const mock = buildMock({
      context_window: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        context_window_size: 200000,
        used_percentage: null,
        remaining_percentage: null,
        current_usage: null,
      },
    })
    expect(text(contextSeg, mock)).toBe('Context 0%')
  })
})

describe('metric timer semantics', () => {
  const session = SEGMENTS.session.defaults() as Omit<MetricSegment, 'id'>
  const sessionSeg: MetricSegment = { ...session, id: 's' }

  it('timer only when resets_at present and countdown non-empty', () => {
    const now = 1000
    const mock = buildMock({
      _now: now,
      rate_limits: {
        five_hour: { used_percentage: 40, resets_at: now + 7320 }, // 2h2m
      },
    })
    expect(text(sessionSeg, mock)).toBe('Session ██░░░ 40% (2h2m)')
  })

  it('timer omitted when countdown is empty (reset in the past)', () => {
    const now = 1000
    const mock = buildMock({
      _now: now,
      rate_limits: {
        five_hour: { used_percentage: 40, resets_at: now - 5 },
      },
    })
    expect(text(sessionSeg, mock)).toBe('Session ██░░░ 40%')
  })

  it('context never renders a timer part', () => {
    const ctxDef = SEGMENTS.context.defaults() as Omit<MetricSegment, 'id'>
    const seg: MetricSegment = { ...ctxDef, id: 'c', parts: ['percent', 'timer'] }
    const mock = buildMock({
      context_window: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        context_window_size: 200000,
        used_percentage: 34,
        remaining_percentage: 66,
        current_usage: null,
      },
    })
    expect(text(seg, mock)).toBe('Context 34%')
  })
})

describe('directory tildeHome', () => {
  const base: DirectorySegment = {
    id: 'd',
    type: 'directory',
    enabled: true,
    dirStyle: 'tildeHome',
  }
  it('replaces leading $HOME with ~', () => {
    const mock = buildMock({ cwd: '/home/vito/dev/x', _home: '/home/vito' })
    expect(text(base, mock)).toBe('~/dev/x')
  })
  it('exact home → ~', () => {
    const mock = buildMock({ cwd: '/home/vito', _home: '/home/vito' })
    expect(text(base, mock)).toBe('~')
  })
  it('basename style', () => {
    const seg: DirectorySegment = { ...base, dirStyle: 'basename' }
    const mock = buildMock({ cwd: '/home/vito/dev/proj' })
    expect(text(seg, mock)).toBe('proj')
  })
  it('full style', () => {
    const seg: DirectorySegment = { ...base, dirStyle: 'full' }
    const mock = buildMock({ cwd: '/home/vito/dev/proj' })
    expect(text(seg, mock)).toBe('/home/vito/dev/proj')
  })
})

describe('separator width', () => {
  const base: SeparatorSegment = {
    id: 'sep',
    type: 'separator',
    enabled: true,
    fill: '─',
    width: 'full',
  }
  it('full clamps to _columns', () => {
    expect(text(base, buildMock({ _columns: 10 }))).toBe('─'.repeat(10))
  })
  it('fixed width', () => {
    const seg: SeparatorSegment = { ...base, width: 74 }
    expect(text(seg, buildMock({ _columns: 200 }))).toBe('─'.repeat(74))
  })
})

describe('peak segment', () => {
  const base: PeakSegment = {
    id: 'p',
    type: 'peak',
    enabled: true,
    showCountdown: true,
    tz: 'America/Los_Angeles',
    windowDays: [1, 2, 3, 4, 5],
    startHour: 5,
    endHour: 11,
  }
  it('inside window → Peak + countdown', () => {
    const mock = buildMock({ _now: 1769707200 }) // Thu 09:20 PST, end 11:00
    expect(text(base, mock)).toBe('Peak (1h40m)')
  })
  it('off-peak → Off-peak + countdown', () => {
    const mock = buildMock({ _now: 1769684400 }) // Thu 03:00, start 05:00 (2h)
    expect(text(base, mock)).toBe('Off-peak (2h0m)')
  })
  it('no countdown when showCountdown false', () => {
    const seg: PeakSegment = { ...base, showCountdown: false }
    const mock = buildMock({ _now: 1769707200 })
    expect(text(seg, mock)).toBe('Peak')
  })
})

describe('cost / duration / lines / pr / thinking', () => {
  const mock = buildMock({
    cost: {
      total_cost_usd: 0.42,
      total_duration_ms: 23 * 60 * 1000,
      total_api_duration_ms: 0,
      total_lines_added: 12,
      total_lines_removed: 3,
    },
    pr: { number: 99, url: 'https://x', review_state: 'approved' },
    thinking: { enabled: true },
  })

  it('cost', () => {
    expect(text({ id: 'c', type: 'cost', enabled: true }, mock)).toBe('$0.42')
  })
  it('duration', () => {
    expect(text({ id: 'd', type: 'duration', enabled: true }, mock)).toBe('23m0s')
  })
  it('lines combined', () => {
    const seg: Segment = {
      id: 'l',
      type: 'lines',
      enabled: true,
      linesStyle: 'combined',
    }
    expect(text(seg, mock)).toBe('+12 -3')
  })
  it('lines addedOnly', () => {
    const seg: Segment = {
      id: 'l',
      type: 'lines',
      enabled: true,
      linesStyle: 'addedOnly',
    }
    expect(text(seg, mock)).toBe('+12')
  })
  it('cost dropped when cost absent', () => {
    expect(
      evaluateSegment({ id: 'c', type: 'cost', enabled: true }, buildMock(), ctx)
        .spans,
    ).toEqual([])
  })
  it('pr with state', () => {
    const seg: Segment = { id: 'p', type: 'pr', enabled: true, showState: true }
    expect(text(seg, mock)).toBe('#99 approved')
  })
  it('pr without state', () => {
    const seg: Segment = { id: 'p', type: 'pr', enabled: true, showState: false }
    expect(text(seg, mock)).toBe('#99')
  })
  it('thinking enabled', () => {
    expect(text({ id: 't', type: 'thinking', enabled: true }, mock)).toBe('thinking')
  })
  it('thinking dropped when disabled', () => {
    expect(
      evaluateSegment(
        { id: 't', type: 'thinking', enabled: true },
        buildMock({ thinking: { enabled: false } }),
        ctx,
      ).spans,
    ).toEqual([])
  })
})

describe('label and emoji decoration', () => {
  const seg: SimpleSegment = {
    id: 'm',
    type: 'model',
    enabled: true,
    label: { text: 'Model', show: true },
    emoji: { glyph: '🤖', show: true },
  }
  const mock = buildMock({ model: { id: 'x', display_name: 'Opus' } })

  it('label prepended when shown; emoji gated by ctx.emoji', () => {
    expect(text(seg, mock)).toBe('Model Opus') // ctx.emoji false → no emoji
    const withEmoji = evaluateSegment(seg, mock, { emoji: true })
      .spans.map((s) => s.text)
      .join('')
    expect(withEmoji).toBe('🤖 Model Opus')
  })

  it('prefix/suffix wrap the value', () => {
    const s: SimpleSegment = { ...seg, label: undefined, prefix: '[', suffix: ']' }
    expect(text(s, mock)).toBe('[Opus]')
  })
})
