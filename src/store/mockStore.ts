// mockStore — the (un-persisted) mock session that drives the live preview.
// Holds one MockData object plus immutable-style setters for every scrubbable
// field, applyPreset(name), randomize() and reset(). Every mutation produces a
// NEW MockData object (and nested objects) so React re-renders cleanly.

import { create } from 'zustand'
import type {
  MockData,
  EffortLevel,
  VimMode,
  PrReviewState,
} from '../model/mock'
import { MOCK_PRESETS, type MockPresetName, typical } from '../model/presets/mockPresets'

// ---------------------------------------------------------------------------
// Time helpers — translate a day-of-week + time-of-day into `_now`.
// Kept simple: we anchor on UTC midnight of a known Monday and add the picked
// dow/hour/minute. Countdowns (reset timers) read `_now`, so this control just
// shifts the epoch.
// ---------------------------------------------------------------------------

// 2026-01-26 is a Monday (UTC). Anchor for the clock control.
const MONDAY_UTC = Date.UTC(2026, 0, 26, 0, 0, 0) / 1000

/** Compose an epoch (seconds) from ISO day-of-week (1=Mon..7=Sun) + hour + min,
 *  in the given timezone offset is ignored — we treat the picked time as PT wall
 *  clock by approximating with a fixed -8h (PST). Good enough for the scrubber. */
export function composeNow(dow: number, hour: number, minute: number): number {
  const dayOffset = (dow - 1) * 86400
  const todOffset = hour * 3600 + minute * 60
  const PT_OFFSET = 8 * 3600 // PST is UTC-8
  return MONDAY_UTC + dayOffset + todOffset + PT_OFFSET
}

export interface ClockParts {
  dow: number // 1..7
  hour: number // 0..23
  minute: number // 0..59
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface MockState {
  mock: MockData
  presetName: MockPresetName | 'custom'

  applyPreset(name: MockPresetName): void
  reset(): void
  randomize(): void

  // metric percentages
  setContextPct(pct: number): void
  setSessionPct(pct: number): void
  setWeekPct(pct: number): void

  // reset offsets (minutes from now until reset)
  setSessionResetMinutes(min: number): void
  setWeekResetMinutes(min: number): void

  // clock
  setClock(parts: Partial<ClockParts>): void

  // presence toggles for optional objects
  toggleRateLimits(on: boolean): void
  toggleEffort(on: boolean): void
  toggleVim(on: boolean): void
  togglePr(on: boolean): void
  toggleSessionName(on: boolean): void
  toggleThinking(on: boolean): void
  toggleWorktree(on: boolean): void
  toggleCost(on: boolean): void
  toggleContext(on: boolean): void

  // dropdowns / text
  setModelName(name: string): void
  setEffortLevel(level: EffortLevel): void
  setVimMode(mode: VimMode): void
  setPrState(state: PrReviewState): void
  setGitBranch(branch: string): void
  setColumns(cols: number): void
}

// Decompose `_now` back into PT wall-clock parts for the clock control.
export function decomposeNow(now: number): ClockParts {
  const PT_OFFSET = 8 * 3600
  const local = now - PT_OFFSET - MONDAY_UTC
  const dow = ((Math.floor(local / 86400) % 7) + 7) % 7
  const within = ((local % 86400) + 86400) % 86400
  return {
    dow: dow + 1,
    hour: Math.floor(within / 3600),
    minute: Math.floor((within % 3600) / 60),
  }
}

function pct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

// ---------------------------------------------------------------------------
// Randomizer — deterministic-shaped plausible values
// ---------------------------------------------------------------------------

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const MODELS = ['Opus', 'Sonnet', 'Haiku', 'Opus 4.8']
const EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
const BRANCHES = ['main', 'develop', 'feat/ui', 'hotfix/prod-down', 'release/1.2']

function randomMock(): MockData {
  const base = typical()
  const c = pct(Math.random() * 100)
  const s = pct(Math.random() * 100)
  const w = pct(Math.random() * 100)
  const now = base._now
  return {
    ...base,
    _gitBranch: pick(BRANCHES),
    _now: now,
    model: { id: 'claude', display_name: pick(MODELS) },
    effort: { level: pick(EFFORTS) },
    context_window: base.context_window
      ? { ...base.context_window, used_percentage: c, remaining_percentage: 100 - c }
      : base.context_window,
    rate_limits: {
      five_hour: { used_percentage: s, resets_at: now + 60 * (10 + Math.floor(Math.random() * 290)) },
      seven_day: { used_percentage: w, resets_at: now + 3600 * (1 + Math.floor(Math.random() * 120)) },
    },
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMockStore = create<MockState>()((set) => ({
  mock: typical(),
  presetName: 'typical',

  applyPreset: (name) => set({ mock: MOCK_PRESETS[name](), presetName: name }),
  reset: () => set({ mock: typical(), presetName: 'typical' }),
  randomize: () => set({ mock: randomMock(), presetName: 'custom' }),

  setContextPct: (p) =>
    set((st) => {
      const v = pct(p)
      const cw = st.mock.context_window ?? {
        total_input_tokens: 0,
        total_output_tokens: 0,
        context_window_size: 200000,
        used_percentage: v,
        remaining_percentage: 100 - v,
        current_usage: null,
      }
      return {
        presetName: 'custom',
        mock: {
          ...st.mock,
          context_window: { ...cw, used_percentage: v, remaining_percentage: 100 - v },
        },
      }
    }),
  setSessionPct: (p) =>
    set((st) => {
      const v = pct(p)
      const rl = st.mock.rate_limits ?? {}
      const fh = rl.five_hour ?? { used_percentage: v, resets_at: st.mock._now + 7200 }
      return {
        presetName: 'custom',
        mock: { ...st.mock, rate_limits: { ...rl, five_hour: { ...fh, used_percentage: v } } },
      }
    }),
  setWeekPct: (p) =>
    set((st) => {
      const v = pct(p)
      const rl = st.mock.rate_limits ?? {}
      const sd = rl.seven_day ?? { used_percentage: v, resets_at: st.mock._now + 3 * 86400 }
      return {
        presetName: 'custom',
        mock: { ...st.mock, rate_limits: { ...rl, seven_day: { ...sd, used_percentage: v } } },
      }
    }),

  setSessionResetMinutes: (min) =>
    set((st) => {
      const rl = st.mock.rate_limits
      if (!rl?.five_hour) return st
      return {
        presetName: 'custom',
        mock: {
          ...st.mock,
          rate_limits: { ...rl, five_hour: { ...rl.five_hour, resets_at: st.mock._now + min * 60 } },
        },
      }
    }),
  setWeekResetMinutes: (min) =>
    set((st) => {
      const rl = st.mock.rate_limits
      if (!rl?.seven_day) return st
      return {
        presetName: 'custom',
        mock: {
          ...st.mock,
          rate_limits: { ...rl, seven_day: { ...rl.seven_day, resets_at: st.mock._now + min * 60 } },
        },
      }
    }),

  setClock: (parts) =>
    set((st) => {
      const cur = decomposeNow(st.mock._now)
      const next = composeNow(
        parts.dow ?? cur.dow,
        parts.hour ?? cur.hour,
        parts.minute ?? cur.minute,
      )
      // Shift reset timestamps to remain relative to the new now.
      const delta = next - st.mock._now
      const rl = st.mock.rate_limits
      const shifted = rl
        ? {
            five_hour: rl.five_hour
              ? { ...rl.five_hour, resets_at: rl.five_hour.resets_at + delta }
              : undefined,
            seven_day: rl.seven_day
              ? { ...rl.seven_day, resets_at: rl.seven_day.resets_at + delta }
              : undefined,
          }
        : rl
      return { presetName: 'custom', mock: { ...st.mock, _now: next, rate_limits: shifted } }
    }),

  toggleRateLimits: (on) =>
    set((st) => {
      if (on) {
        const now = st.mock._now
        return {
          presetName: 'custom',
          mock: {
            ...st.mock,
            rate_limits: {
              five_hour: { used_percentage: 23, resets_at: now + 7200 },
              seven_day: { used_percentage: 41, resets_at: now + 3 * 86400 },
            },
          },
        }
      }
      const next = { ...st.mock }
      delete next.rate_limits
      return { presetName: 'custom', mock: next }
    }),
  toggleEffort: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.effort = { level: 'high' }
      else delete next.effort
      return { presetName: 'custom', mock: next }
    }),
  toggleVim: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.vim = { mode: 'NORMAL' }
      else delete next.vim
      return { presetName: 'custom', mock: next }
    }),
  togglePr: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.pr = { number: 142, url: 'https://example/pr/142', review_state: 'pending' }
      else delete next.pr
      return { presetName: 'custom', mock: next }
    }),
  toggleSessionName: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.session_name = 'refactor-preview'
      else delete next.session_name
      return { presetName: 'custom', mock: next }
    }),
  toggleThinking: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.thinking = { enabled: true }
      else delete next.thinking
      return { presetName: 'custom', mock: next }
    }),
  toggleWorktree: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on)
        next.worktree = { name: 'wt-feature', path: '/tmp/wt', original_cwd: '/home/vito/dev' }
      else delete next.worktree
      return { presetName: 'custom', mock: next }
    }),
  toggleCost: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on)
        next.cost = {
          total_cost_usd: 0.42,
          total_duration_ms: 23 * 60 * 1000,
          total_api_duration_ms: 8 * 60 * 1000,
          total_lines_added: 120,
          total_lines_removed: 35,
        }
      else delete next.cost
      return { presetName: 'custom', mock: next }
    }),
  toggleContext: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on)
        next.context_window = {
          total_input_tokens: 68000,
          total_output_tokens: 4200,
          context_window_size: 200000,
          used_percentage: 34,
          remaining_percentage: 66,
          current_usage: null,
        }
      else delete next.context_window
      return { presetName: 'custom', mock: next }
    }),

  setModelName: (name) =>
    set((st) => ({
      presetName: 'custom',
      mock: { ...st.mock, model: { ...st.mock.model, display_name: name } },
    })),
  setEffortLevel: (level) =>
    set((st) => ({ presetName: 'custom', mock: { ...st.mock, effort: { level } } })),
  setVimMode: (mode) =>
    set((st) => ({ presetName: 'custom', mock: { ...st.mock, vim: { mode } } })),
  setPrState: (state) =>
    set((st) => {
      const pr = st.mock.pr ?? { number: 142, url: 'https://example/pr/142' }
      return { presetName: 'custom', mock: { ...st.mock, pr: { ...pr, review_state: state } } }
    }),
  setGitBranch: (branch) =>
    set((st) => ({ presetName: 'custom', mock: { ...st.mock, _gitBranch: branch } })),
  setColumns: (cols) =>
    set((st) => ({
      presetName: 'custom',
      mock: { ...st.mock, _columns: Math.max(20, Math.min(200, Math.round(cols))) },
    })),
}))
