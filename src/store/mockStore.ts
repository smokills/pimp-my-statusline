// mockStore — the (un-persisted) mock session that drives the live preview.
// Holds one MockData object plus immutable-style setters for every scrubbable
// field, randomize() and reset(). Every mutation produces a NEW MockData object
// (and nested objects) so React re-renders cleanly.
//
// The UI seed (uiTypical) extends the `typical` parity fixture so EVERY optional
// object is present with a plausible default — placing any segment immediately
// shows data the drawer can then scrub. The named model-level presets
// (typical/fresh/panic/…) stay byte-exact for the parity tests; only this UI
// seed is enriched, never those fixtures.

import { create } from 'zustand'
import type { MockData, EffortLevel } from '../model/mock'
import { typical } from '../model/presets/mockPresets'

// ---------------------------------------------------------------------------
// UI seed — typical + the library elements it omits (output_style, agent) so
// adding any element from the library immediately shows data the drawer can
// scrub. Only library-exposed objects are seeded; types hidden from the picker
// (vim, session_name, pr, thinking, worktree) get no UI scaffolding here.
// ---------------------------------------------------------------------------

function uiTypical(): MockData {
  return {
    ...typical(),
    output_style: { name: 'Explanatory' },
    agent: { name: 'general-purpose' },
  }
}

// Default skeletons used when a setter runs while its object is somehow absent
// (so editing always lands a valid object).
const COST_DEFAULT = {
  total_cost_usd: 0,
  total_duration_ms: 0,
  total_api_duration_ms: 0,
  total_lines_added: 0,
  total_lines_removed: 0,
}

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

  // session facts
  setModelName(name: string): void
  setEffortLevel(level: EffortLevel): void
  setOutputStyle(name: string): void
  setAgentName(name: string): void
  setVersion(v: string): void

  // workspace
  setDirectory(path: string): void
  setGitBranch(branch: string): void

  // cost / activity
  setCostUsd(usd: number): void
  setDurationMinutes(min: number): void
  setLinesAdded(n: number): void
  setLinesRemoved(n: number): void
}

function pct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function nonNeg(n: number): number {
  return Math.max(0, Math.round(n))
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
  const base = uiTypical()
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
  mock: uiTypical(),

  reset: () => set({ mock: uiTypical() }),
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

  setModelName: (name) =>
    set((st) => ({ mock: { ...st.mock, model: { ...st.mock.model, display_name: name } } })),
  setEffortLevel: (level) => set((st) => ({ mock: { ...st.mock, effort: { level } } })),
  setOutputStyle: (name) => set((st) => ({ mock: { ...st.mock, output_style: { name } } })),
  setAgentName: (name) => set((st) => ({ mock: { ...st.mock, agent: { name } } })),
  setVersion: (v) => set((st) => ({ mock: { ...st.mock, version: v } })),

  setDirectory: (path) =>
    set((st) => ({
      mock: { ...st.mock, cwd: path, workspace: { ...st.mock.workspace, current_dir: path } },
    })),
  setGitBranch: (branch) => set((st) => ({ mock: { ...st.mock, _gitBranch: branch } })),

  setCostUsd: (usd) =>
    set((st) => {
      const cost = st.mock.cost ?? COST_DEFAULT
      return { mock: { ...st.mock, cost: { ...cost, total_cost_usd: Math.max(0, usd) } } }
    }),
  setDurationMinutes: (min) =>
    set((st) => {
      const cost = st.mock.cost ?? COST_DEFAULT
      return { mock: { ...st.mock, cost: { ...cost, total_duration_ms: nonNeg(min) * 60000 } } }
    }),
  setLinesAdded: (n) =>
    set((st) => {
      const cost = st.mock.cost ?? COST_DEFAULT
      return { mock: { ...st.mock, cost: { ...cost, total_lines_added: nonNeg(n) } } }
    }),
  setLinesRemoved: (n) =>
    set((st) => {
      const cost = st.mock.cost ?? COST_DEFAULT
      return { mock: { ...st.mock, cost: { ...cost, total_lines_removed: nonNeg(n) } } }
    }),
}))
