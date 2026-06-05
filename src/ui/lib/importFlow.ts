// importFlow — pure logic for the import modal, extracted so it is unit-testable
// in the node env. extractConfig() (model layer) is the source of truth; here we
// add the hand-edit detection: after recovering the embedded config we
// regenerate the script and compare it (normalized) against what was pasted. A
// mismatch means the user edited the script body by hand — the embedded config
// wins on import, so we warn that those edits will be lost.

import type { StatuslineConfig } from '../../model/types'
import { extractConfig } from '../../model/reimport'
import { generate } from '../../generators'

export type ImportResult =
  | { ok: false; error: string }
  | { ok: true; config: StatuslineConfig; handEdited: boolean; rows: number; elements: number }

const MARKER_LINE_RE = /pimp-my-statusline:v\d+:[A-Za-z0-9_-]+/

/** Normalize a script for comparison: drop the embedded marker line, strip
 *  trailing whitespace per line and a trailing blank-line run, and normalize
 *  CRLF → LF.
 *
 *  The marker is excluded because its base64 payload is `JSON.stringify(config)`,
 *  whose KEY ORDER differs between a hand-authored config object and the same
 *  config recovered through the zod schema (zod re-serializes keys in schema
 *  order). That re-ordering is not a hand edit to the script body, so comparing
 *  the marker would produce false positives. The script BODY is what we diff. */
export function normalizeScript(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !MARKER_LINE_RE.test(l))
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '\n')
}

function countElements(config: StatuslineConfig): number {
  return config.rows.reduce((n, r) => n + r.segments.length, 0)
}

/** Parse pasted script text into an import result. */
export function analyzeImport(text: string): ImportResult {
  const config = extractConfig(text)
  if (config === null) {
    return {
      ok: false,
      error: 'no pimp-my-statusline marker found — was this script exported by Pimp My Statusline?',
    }
  }
  const regenerated = generate(config, config.language)
  const handEdited = normalizeScript(regenerated) !== normalizeScript(text)
  return {
    ok: true,
    config,
    handEdited,
    rows: config.rows.length,
    elements: countElements(config),
  }
}
