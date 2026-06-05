// MockData — mirrors the Claude Code statusline stdin JSON schema, plus a few
// sim-only fields (prefixed `_`) used by the preview. Optional fields are
// GENUINELY optional so we can model "key absent" distinctly from "key null":
// the design's edge-cases hinge on this (rate_limits absent ⇒ session/week
// render their 0% default state, fresh-session friendly; used_percentage null
// but the object present ⇒ 0%).

export interface MockModel {
  id: string
  display_name: string
}

export interface MockWorkspace {
  current_dir: string
  project_dir: string
  added_dirs: string[]
  git_worktree?: string
  repo?: { host: string; owner: string; name: string }
}

export interface MockCost {
  total_cost_usd: number
  total_duration_ms: number
  total_api_duration_ms: number
  total_lines_added: number
  total_lines_removed: number
}

export interface MockCurrentUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export interface MockContextWindow {
  total_input_tokens: number
  total_output_tokens: number
  context_window_size: number
  // Nullable per the schema: null on the very first render.
  used_percentage: number | null
  remaining_percentage: number | null
  current_usage: MockCurrentUsage | null
}

export interface MockRateLimitBucket {
  used_percentage: number
  resets_at: number // epoch seconds
}

export interface MockRateLimits {
  five_hour?: MockRateLimitBucket
  seven_day?: MockRateLimitBucket
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'VISUAL LINE'
export type PrReviewState = 'approved' | 'pending' | 'changes_requested' | 'draft'

export interface MockPr {
  number: number
  url: string
  review_state?: PrReviewState
}

export interface MockWorktree {
  name: string
  path: string
  branch?: string
  original_cwd: string
  original_branch?: string
}

export interface MockData {
  // --- stdin schema ---
  cwd?: string
  session_id: string
  session_name?: string // absent unless the user set one
  transcript_path: string
  model: MockModel
  workspace: MockWorkspace
  version: string
  output_style?: { name: string }
  cost?: MockCost
  context_window?: MockContextWindow
  exceeds_200k_tokens?: boolean
  effort?: { level: EffortLevel }
  thinking?: { enabled: boolean }
  rate_limits?: MockRateLimits
  vim?: { mode: VimMode }
  agent?: { name: string }
  pr?: MockPr
  worktree?: MockWorktree

  // --- sim-only fields (never present in real stdin) ---
  _gitBranch?: string // simulates `git -C "$CWD" branch --show-current`
  _now: number // epoch SECONDS; ALL time-derived rendering uses this, never the real clock
  _columns: number // COLUMNS env, for truncation + 'full'-width separators
  _home?: string // $HOME for tildeHome directory style; defaults '/home/vito'
}

/** A minimal-but-complete baseline. Required (non-optional) fields are always
 *  present; genuinely-optional fields are LEFT OUT so the baseline exercises the
 *  "absent" path by default. Spread `overrides` last to set/replace any field. */
export function buildMock(overrides: Partial<MockData> = {}): MockData {
  const base: MockData = {
    session_id: 'mock-session',
    transcript_path: '/home/vito/.claude/projects/mock/transcript.jsonl',
    cwd: '/home/vito/dev/pimp-my-statusline',
    model: { id: 'claude-opus-4', display_name: 'Opus' },
    workspace: {
      current_dir: '/home/vito/dev/pimp-my-statusline',
      project_dir: '/home/vito/dev/pimp-my-statusline',
      added_dirs: [],
    },
    version: '2.1.153',
    _now: 1769677500, // Thu 2026-01-29 01:05:00 PST (verified; see mockPresets.ts)
    _columns: 120,
    _home: '/home/vito',
  }
  return { ...base, ...overrides }
}
