// Visible-width utilities for the preview UI (overflow indicators, layout
// measurements). SINGLE implementation: the regexes that strip ANSI/OSC8 live
// in src/pets/runtime.ts (the byte-faithful reference the generators mirror), so
// we re-export from there rather than duplicate them. `visibleWidth` is just the
// preview-side name for the pets runtime's `visibleLen`.
//
// NOTE (controller decision): v1 does NOT byte-truncate rendered output lines.
// Overflow is shown via CSS in TerminalPreview, and the generated scripts don't
// truncate either, so these utilities exist for UI measurement only — never to
// clip the parity-critical ANSI string.

import { stripAnsi, visibleLen } from '../pets/runtime'

export { stripAnsi }

/** Number of terminal cells a string occupies once ANSI/OSC8 is stripped. */
export function visibleWidth(s: string): number {
  return visibleLen(s)
}
