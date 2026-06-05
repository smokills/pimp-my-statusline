// library.ts — UI-side metadata for the element library: categorization, the
// "re-addable vs single-instance" rule, and per-type absence notes. Built ON the
// SEGMENTS registry (label/metric/sources) — never re-declaring its semantics.

import type { SegmentType, StatuslineConfig, Segment, TextStyle } from '../../model/types'
import { SEGMENTS } from '../../model/segments'

export type Category = 'CONTEXT' | 'SESSION' | 'GIT' | 'META' | 'MISC'

export const CATEGORY_ORDER: readonly Category[] = ['CONTEXT', 'SESSION', 'GIT', 'META', 'MISC']

const CATEGORY_OF: Record<SegmentType, Category> = {
  directory: 'CONTEXT',
  model: 'CONTEXT',
  effort: 'CONTEXT',
  context: 'CONTEXT',

  session: 'SESSION',
  week: 'SESSION',
  cost: 'SESSION',
  duration: 'SESSION',

  gitBranch: 'GIT',
  pr: 'GIT',
  worktree: 'GIT',
  lines: 'GIT',

  outputStyle: 'META',
  vimMode: 'META',
  sessionName: 'META',
  agent: 'META',
  thinking: 'META',
  version: 'META',

  separator: 'MISC',
  staticText: 'MISC',
}

/** Types that may appear more than once in a layout. Everything else is
 *  single-instance (disabled in the library once placed). */
const RE_ADDABLE = new Set<SegmentType>(['separator', 'staticText'])

export function categoryOf(type: SegmentType): Category {
  return CATEGORY_OF[type]
}

export function isReAddable(type: SegmentType): boolean {
  return RE_ADDABLE.has(type)
}

export interface LibraryEntry {
  type: SegmentType
  label: string
  description: string
  metric: boolean
  category: Category
}

export function libraryEntries(): LibraryEntry[] {
  return (Object.keys(SEGMENTS) as SegmentType[]).map((type) => ({
    type,
    label: SEGMENTS[type].label,
    description: SEGMENTS[type].description,
    metric: SEGMENTS[type].metric,
    category: CATEGORY_OF[type],
  }))
}

/** Count placed instances per segment type across all rows. */
export function placedCounts(config: StatuslineConfig): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of config.rows) {
    for (const seg of row.segments) {
      counts[seg.type] = (counts[seg.type] ?? 0) + 1
    }
  }
  return counts
}

/** Human absence note for a segment type, derived from its sources. Returned as
 *  a terminal-comment string, or null when the segment always renders. */
export function absenceNote(type: SegmentType): string | null {
  switch (type) {
    case 'session':
    case 'week':
      return '// only present for Pro/Max subscribers (rate limits)'
    case 'gitBranch':
      return '// only inside a git repo'
    case 'pr':
      return '// only when a pull request is detected'
    case 'worktree':
      return '// only inside a git worktree'
    case 'cost':
    case 'duration':
    case 'lines':
      return '// requires cost data (absent on first render)'
    case 'context':
      return '// renders 0% before the first turn'
    case 'effort':
      return '// only when a reasoning effort level is set'
    case 'vimMode':
      return '// only when vim mode is enabled'
    case 'sessionName':
      return '// only when you have named the session'
    case 'agent':
      return '// only while a subagent is active'
    case 'thinking':
      return '// only when extended thinking is on'
    case 'outputStyle':
      return '// only when a non-default output style is set'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Color-at-a-glance — extract the primary ColorSpec from any segment so the
// chip can show a swatch. Threshold colors surface their first (highest) stop.
// ---------------------------------------------------------------------------

export function primaryStyle(seg: Segment): TextStyle | undefined {
  switch (seg.type) {
    case 'context':
    case 'session':
    case 'week':
      return seg.valueStyle ?? seg.barStyle
    case 'directory':
      return seg.style
    case 'lines':
      return seg.addedStyle ?? seg.removedStyle
    case 'separator':
    case 'staticText':
    case 'pr':
      return seg.style
    default:
      return seg.style
  }
}

/** Tiny glyph summary of a segment's variant, for the chip. */
export function variantGlyphs(seg: Segment): string {
  switch (seg.type) {
    case 'context':
    case 'session':
    case 'week': {
      const map: Record<string, string> = { bar: '▓', percent: '%', timer: '⏱' }
      return seg.parts.map((p) => map[p] ?? '').join('')
    }
    case 'directory':
      return seg.dirStyle === 'basename' ? '·/' : seg.dirStyle === 'full' ? '/…' : '~/'
    case 'separator':
      return seg.fill
    case 'lines':
      return seg.linesStyle === 'addedOnly' ? '+' : seg.linesStyle === 'removedOnly' ? '−' : '±'
    default:
      return ''
  }
}
