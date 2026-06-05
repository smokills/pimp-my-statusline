// needsRefreshInterval — pure helper deciding whether the generated
// settings.json should carry "refreshInterval": 10. The statusline only needs
// periodic re-execution when it shows TIME-BASED output: any metric segment
// that renders a reset `timer` part (its countdown ticks). Anything else is
// static between Claude Code render triggers.

import type { StatuslineConfig } from '../../model/types'

export function needsRefreshInterval(config: StatuslineConfig): boolean {
  for (const row of config.rows) {
    for (const seg of row.segments) {
      if (!seg.enabled) continue
      if (
        (seg.type === 'context' || seg.type === 'session' || seg.type === 'week') &&
        seg.parts.includes('timer')
      ) {
        return true
      }
    }
  }
  return false
}
