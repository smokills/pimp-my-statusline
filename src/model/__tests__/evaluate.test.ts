import { describe, expect, it } from 'vitest'
import { evaluateSegment, SEGMENTS } from '../segments'
import { buildMock } from '../mock'
import type {
  DirectorySegment,
  MetricSegment,
  Segment,
  SeparatorSegment,
  SimpleSegment,
} from '../types'

/** Concatenate all span texts of a render (for plain-text assertions). */
function text(seg: Segment, mock = buildMock()): string {
  return evaluateSegment(seg, mock)
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
    expect(evaluateSegment(effort, buildMock()).spans).toEqual([])
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

  it('rate_limits absent → session renders at 0% (fresh-session default)', () => {
    // A freshly started session has no rate-limit data yet; Session/Week must
    // still be visible. Default state: bar empty, "0%", timer omitted (no reset).
    expect(text(sessionSeg, buildMock())).toBe('Session ░░░░░ 0%')
  })
  it('rate_limits present but bucket absent → 0%, timer omitted', () => {
    // five_hour bucket missing under a present rate_limits ⇒ same default state
    // (timer omitted even though session has a timer part).
    const mock = buildMock({
      _now: 1000,
      rate_limits: { seven_day: { used_percentage: 41, resets_at: 1000 + 7200 } },
    })
    expect(text(sessionSeg, mock)).toBe('Session ░░░░░ 0%')
  })
  it('context_window absent → context dropped', () => {
    expect(evaluateSegment(contextSeg, buildMock()).spans).toEqual([])
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
      evaluateSegment({ id: 'c', type: 'cost', enabled: true }, buildMock())
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

  it('label and emoji prepended when shown (emoji is purely per-segment)', () => {
    expect(text(seg, mock)).toBe('🤖 Model Opus')
    const noEmoji: SimpleSegment = { ...seg, emoji: { glyph: '🤖', show: false } }
    expect(text(noEmoji, mock)).toBe('Model Opus')
  })

  it('prefix/suffix wrap the value', () => {
    const s: SimpleSegment = {
      ...seg,
      label: undefined,
      emoji: undefined,
      prefix: '[',
      suffix: ']',
    }
    expect(text(s, mock)).toBe('[Opus]')
  })

  it('styled prefix/suffix spans carry their style; unstyled stay escape-free', () => {
    const s: SimpleSegment = {
      ...seg,
      label: undefined,
      emoji: undefined,
      prefix: '[',
      suffix: ']',
      prefixStyle: { color: { kind: 'ansi16', code: 34 } },
      suffixStyle: { color: { kind: 'ansi16', code: 35 }, bold: true },
    }
    const spans = evaluateSegment(s, mock).spans
    const prefixSpan = spans.find((sp) => sp.text === '[')
    const suffixSpan = spans.find((sp) => sp.text === ']')
    expect(prefixSpan?.style).toEqual({ color: { kind: 'ansi16', code: 34 } })
    expect(suffixSpan?.style).toEqual({ color: { kind: 'ansi16', code: 35 }, bold: true })

    // Without affix styles the spans carry no style at all.
    const plain: SimpleSegment = { ...s, prefixStyle: undefined, suffixStyle: undefined }
    const plainSpans = evaluateSegment(plain, mock).spans
    expect(plainSpans.find((sp) => sp.text === '[')?.style).toBeUndefined()
    expect(plainSpans.find((sp) => sp.text === ']')?.style).toBeUndefined()
  })
})

describe('threshold colors resolved to concrete colors by evaluate()', () => {
  const base = SEGMENTS.context.defaults() as Omit<MetricSegment, 'id'>
  const seg: MetricSegment = {
    ...base,
    id: 'c',
    parts: ['bar', 'percent'],
    valueStyle: {
      color: {
        kind: 'threshold',
        stops: [
          { at: 90, code: 31, ansi16: true },
          { at: 70, code: 33, ansi16: true },
          { at: 0, code: 32, ansi16: true },
        ],
      },
    },
  }
  const mockAt = (pct: number) =>
    buildMock({
      context_window: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        context_window_size: 200000,
        used_percentage: pct,
        remaining_percentage: 100 - pct,
        current_usage: null,
      },
    })

  it('spans never carry a threshold ColorSpec', () => {
    for (const pct of [5, 75, 95]) {
      for (const s of evaluateSegment(seg, mockAt(pct)).spans) {
        expect(s.style?.color?.kind).not.toBe('threshold')
      }
    }
  })

  it.each([
    [5, 32],
    [75, 33],
    [89, 33],
    [90, 31],
    [95, 31],
  ])('pct %i resolves to ansi16 %i on bar and percent spans', (pct, code) => {
    const spans = evaluateSegment(seg, mockAt(pct)).spans
    const styled = spans.filter((s) => s.style?.color)
    expect(styled.length).toBeGreaterThanOrEqual(2) // bar + percent
    for (const s of styled) {
      expect(s.style?.color).toEqual({ kind: 'ansi16', code })
    }
  })
})

describe('segment registry', () => {
  it('every SEGMENTS entry has a non-empty description', () => {
    for (const def of Object.values(SEGMENTS)) {
      expect(def.description.trim().length).toBeGreaterThan(0)
    }
  })
})
