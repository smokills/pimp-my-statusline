// Mock presets — deterministic fixtures exercising every render path. Time is
// always pinned via `_now` (epoch SECONDS) so countdowns are reproducible.
// Epoch constants were verified on the dev box with GNU date,
// e.g. `TZ=America/Los_Angeles date -d @<epoch> '+%u %a %Y-%m-%d %H:%M:%S %Z'`.
// (This is test-fixture work — using GNU `date -d` here is fine; it is NOT
// emitted into any generated script.)

import { buildMock, type MockData } from '../mock'

// ---------------------------------------------------------------------------
// Verified epoch constants (America/Los_Angeles wall-clock in comments)
// ---------------------------------------------------------------------------

// Thu 2026-01-29 01:05:00 PST.
export const TYPICAL_NOW = 1769677500

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** typical — mid-session, the default scrubber state. */
export function typical(): MockData {
  return buildMock({
    _now: TYPICAL_NOW,
    _gitBranch: 'main',
    model: { id: 'claude-opus-4', display_name: 'Opus' },
    effort: { level: 'high' },
    context_window: {
      total_input_tokens: 68000,
      total_output_tokens: 4200,
      context_window_size: 200000,
      used_percentage: 34,
      remaining_percentage: 66,
      current_usage: {
        input_tokens: 68000,
        output_tokens: 4200,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
    cost: {
      total_cost_usd: 0.42,
      total_duration_ms: 23 * 60 * 1000, // 23m
      total_api_duration_ms: 8 * 60 * 1000,
      total_lines_added: 120,
      total_lines_removed: 35,
    },
    rate_limits: {
      // 5h at 23.5%, resetting ~2h out (TYPICAL_NOW + 7200).
      five_hour: { used_percentage: 23.5, resets_at: TYPICAL_NOW + 7200 },
      // 7d at 41.2%, resetting ~3 days out.
      seven_day: { used_percentage: 41.2, resets_at: TYPICAL_NOW + 3 * 86400 },
    },
  })
}

/** fresh — first render: nullable context fields null, no rate_limits, zero cost. */
export function fresh(): MockData {
  return buildMock({
    _now: TYPICAL_NOW,
    _gitBranch: 'main',
    model: { id: 'claude-opus-4', display_name: 'Opus' },
    // no effort, no pr, no vim, no session_name (all absent)
    context_window: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      context_window_size: 200000,
      used_percentage: null,
      remaining_percentage: null,
      current_usage: null,
    },
    cost: {
      total_cost_usd: 0,
      total_duration_ms: 0,
      total_api_duration_ms: 0,
      total_lines_added: 0,
      total_lines_removed: 0,
    },
    // rate_limits ABSENT
  })
}

/** noRateLimits — API user: rate_limits key entirely absent. */
export function noRateLimits(): MockData {
  return buildMock({
    _now: TYPICAL_NOW,
    _gitBranch: 'main',
    model: { id: 'claude-opus-4', display_name: 'Opus' },
    effort: { level: 'medium' },
    context_window: {
      total_input_tokens: 40000,
      total_output_tokens: 2000,
      context_window_size: 200000,
      used_percentage: 28,
      remaining_percentage: 72,
      current_usage: null,
    },
    // rate_limits ABSENT — session/week render their 0% default state.
  })
}

/** panic — everything near the red threshold, reset imminent, exceeds_200k. */
export function panic(): MockData {
  return buildMock({
    _now: TYPICAL_NOW,
    _gitBranch: 'hotfix/prod-down',
    model: { id: 'claude-opus-4', display_name: 'Opus' },
    effort: { level: 'max' },
    exceeds_200k_tokens: true,
    context_window: {
      total_input_tokens: 192000,
      total_output_tokens: 7800,
      context_window_size: 200000,
      used_percentage: 96,
      remaining_percentage: 4,
      current_usage: null,
    },
    cost: {
      total_cost_usd: 12.87,
      total_duration_ms: 2 * 3600 * 1000 + 14 * 60 * 1000,
      total_api_duration_ms: 40 * 60 * 1000,
      total_lines_added: 980,
      total_lines_removed: 410,
    },
    rate_limits: {
      // 5h at 92%, reset in 8m (TYPICAL_NOW + 480).
      five_hour: { used_percentage: 92, resets_at: TYPICAL_NOW + 480 },
      seven_day: { used_percentage: 98, resets_at: TYPICAL_NOW + 2 * 86400 },
    },
  })
}

/** narrow — _columns 40, for truncation + 'full'-width separator clamping. */
export function narrow(): MockData {
  return buildMock({
    _now: TYPICAL_NOW,
    _columns: 40,
    _gitBranch: 'main',
    model: { id: 'claude-opus-4', display_name: 'Opus' },
    effort: { level: 'high' },
    context_window: {
      total_input_tokens: 60000,
      total_output_tokens: 3500,
      context_window_size: 200000,
      used_percentage: 34,
      remaining_percentage: 66,
      current_usage: null,
    },
    rate_limits: {
      five_hour: { used_percentage: 23, resets_at: TYPICAL_NOW + 7200 },
      seven_day: { used_percentage: 41, resets_at: TYPICAL_NOW + 3 * 86400 },
    },
  })
}

export const MOCK_PRESETS = {
  typical,
  fresh,
  noRateLimits,
  panic,
  narrow,
} as const

export type MockPresetName = keyof typeof MOCK_PRESETS
