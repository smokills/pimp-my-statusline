// Single source of truth for the JSON-stdin paths each segment reads. The three
// emitters consume these arrays and own ONLY their language access syntax (jq
// `.a.b`, python `(data.get('a') or {}).get('b')`, node `data.a?.b`). Keeping
// the path knowledge here means a schema change is a one-line edit, not three.

import type { SimpleSegment } from '../../model/types'

/** Object-access path for a SimpleSegment's value leaf (e.g. model →
 *  ['model','display_name']). `thinking` is special-cased by the emitters (it
 *  maps a boolean to a literal label), so it is not listed here. */
export function simplePath(
  type: Exclude<SimpleSegment['type'], 'thinking' | 'cost' | 'duration' | 'gitBranch'>,
): string[] {
  switch (type) {
    case 'model':
      return ['model', 'display_name']
    case 'effort':
      return ['effort', 'level']
    case 'outputStyle':
      return ['output_style', 'name']
    case 'vimMode':
      return ['vim', 'mode']
    case 'sessionName':
      return ['session_name']
    case 'agent':
      return ['agent', 'name']
    case 'version':
      return ['version']
    case 'worktree':
      return ['worktree', 'name']
  }
}

export type MetricType = 'context' | 'session' | 'week'

/** Path to the SOURCE OBJECT whose presence decides whether the metric renders.
 *  For context that's `context_window`; for session/week the rate-limit bucket
 *  (the bucket key under `rate_limits`). */
export function metricSourcePath(type: MetricType): string[] {
  if (type === 'context') return ['context_window']
  return ['rate_limits', type === 'session' ? 'five_hour' : 'seven_day']
}

/** Path to the metric's `used_percentage` leaf. */
export function metricPctPath(type: MetricType): string[] {
  return [...metricSourcePath(type), 'used_percentage']
}

/** Path to a session/week bucket's `resets_at` leaf (context has no reset). */
export function metricResetPath(type: MetricType): string[] {
  return [...metricSourcePath(type), 'resets_at']
}

// Cost-backed fields (cost object presence gates cost/duration/lines).
export const COST_TOTAL_USD = ['cost', 'total_cost_usd']
export const COST_DURATION_MS = ['cost', 'total_duration_ms']
export const COST_LINES_ADDED = ['cost', 'total_lines_added']
export const COST_LINES_REMOVED = ['cost', 'total_lines_removed']

// Pull-request fields.
export const PR_NUMBER = ['pr', 'number']
export const PR_REVIEW_STATE = ['pr', 'review_state']

// Directory source (cwd, then workspace.current_dir).
export const DIR_CWD = ['cwd']
export const DIR_WORKSPACE = ['workspace', 'current_dir']
