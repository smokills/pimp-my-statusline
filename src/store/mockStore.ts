// mockStore — the (un-persisted) mock session that drives the live preview.
// Holds one MockData object plus immutable-style setters for every scrubbable
// field, randomize() and reset(). Every mutation produces a NEW MockData object
// (and nested objects) so React re-renders cleanly.
//
// The named mock presets (typical/fresh/panic/…) remain model-level fixtures
// for the parity tests; the UI scrubs a single scenario seeded from typical().

import { create } from 'zustand'
import type {
  MockData,
  EffortLevel,
  VimMode,
  PrReviewState,
} from '../model/mock'
import { typical } from '../model/presets/mockPresets'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface MockState {
  mock: MockData

  reset(): void
  randomize(): void

  // metric percentages
  setContextPct(pct: number): void
  setSessionPct(pct: number): void
  setWeekPct(pct: number): void

  // reset offsets (minutes from now until reset) — drive the (XhYm) timers
  setSessionResetMinutes(min: number): void
  setWeekResetMinutes(min: number): void

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

  reset: () => set({ mock: typical() }),
  randomize: () => set({ mock: randomMock() }),

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
        mock: { ...st.mock, rate_limits: { ...rl, five_hour: { ...fh, used_percentage: v } } },
      }
    }),
  setWeekPct: (p) =>
    set((st) => {
      const v = pct(p)
      const rl = st.mock.rate_limits ?? {}
      const sd = rl.seven_day ?? { used_percentage: v, resets_at: st.mock._now + 3 * 86400 }
      return {
        mock: { ...st.mock, rate_limits: { ...rl, seven_day: { ...sd, used_percentage: v } } },
      }
    }),

  setSessionResetMinutes: (min) =>
    set((st) => {
      const rl = st.mock.rate_limits
      if (!rl?.five_hour) return st
      return {
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
        mock: {
          ...st.mock,
          rate_limits: { ...rl, seven_day: { ...rl.seven_day, resets_at: st.mock._now + min * 60 } },
        },
      }
    }),

  toggleRateLimits: (on) =>
    set((st) => {
      if (on) {
        const now = st.mock._now
        return {
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
      return { mock: next }
    }),
  toggleEffort: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.effort = { level: 'high' }
      else delete next.effort
      return { mock: next }
    }),
  toggleVim: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.vim = { mode: 'NORMAL' }
      else delete next.vim
      return { mock: next }
    }),
  togglePr: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.pr = { number: 142, url: 'https://example/pr/142', review_state: 'pending' }
      else delete next.pr
      return { mock: next }
    }),
  toggleSessionName: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.session_name = 'refactor-preview'
      else delete next.session_name
      return { mock: next }
    }),
  toggleThinking: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on) next.thinking = { enabled: true }
      else delete next.thinking
      return { mock: next }
    }),
  toggleWorktree: (on) =>
    set((st) => {
      const next = { ...st.mock }
      if (on)
        next.worktree = { name: 'wt-feature', path: '/tmp/wt', original_cwd: '/home/vito/dev' }
      else delete next.worktree
      return { mock: next }
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
      return { mock: next }
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
      return { mock: next }
    }),

  setModelName: (name) =>
    set((st) => ({
      mock: { ...st.mock, model: { ...st.mock.model, display_name: name } },
    })),
  setEffortLevel: (level) =>
    set((st) => ({ mock: { ...st.mock, effort: { level } } })),
  setVimMode: (mode) =>
    set((st) => ({ mock: { ...st.mock, vim: { mode } } })),
  setPrState: (state) =>
    set((st) => {
      const pr = st.mock.pr ?? { number: 142, url: 'https://example/pr/142' }
      return { mock: { ...st.mock, pr: { ...pr, review_state: state } } }
    }),
  setGitBranch: (branch) =>
    set((st) => ({ mock: { ...st.mock, _gitBranch: branch } })),
}))
