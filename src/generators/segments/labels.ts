// Human-readable comment labels for each segment type, used in the generated
// `# --- <label> ---` section headers. Mirrors SEGMENTS[type].label where it
// reads well, with a couple of clarified names.

import type { SegmentType } from '../../model/types'

export const SEGMENT_COMMENT: Record<SegmentType, string> = {
  directory: 'Directory',
  gitBranch: 'Git branch',
  model: 'Model',
  effort: 'Effort',
  context: 'Context',
  session: 'Session (5h)',
  week: 'Week (7d)',
  cost: 'Cost',
  duration: 'Duration',
  lines: 'Lines changed',
  outputStyle: 'Output style',
  vimMode: 'Vim mode',
  sessionName: 'Session name',
  agent: 'Agent',
  pr: 'Pull request',
  thinking: 'Thinking',
  version: 'Version',
  worktree: 'Worktree',
  separator: 'Separator',
  staticText: 'Static text',
}
