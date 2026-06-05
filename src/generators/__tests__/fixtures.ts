// Test fixtures for the generator tests: a maximal config (every segment type
// enabled + pet) and a helper to serialize a MockData into the stdin JSON + env
// the generated scripts read (stripping the _-prefixed sim fields, which are
// preview-only).

import { SEGMENTS, defaultThresholdStops } from '../../model/segments'
import type { Segment, SegmentType, StatuslineConfig } from '../../model/types'
import { DEFAULT_PET_THRESHOLDS } from '../../pets/types'
import type { MockData } from '../../model/mock'

/** Every segment type enabled, spread across three rows with different joiners,
 *  plus an enabled pet (cactus) bound to session_5h. */
export function buildMaximalConfig(petEnabled: boolean): StatuslineConfig {
  const types = Object.keys(SEGMENTS) as SegmentType[]
  const segments: Segment[] = types.map((t) => ({
    ...SEGMENTS[t].defaults(),
    id: t,
  })) as Segment[]
  // Exercise styled affixes through the parity matrix: give the directory
  // segment a styled label + prefix/suffix with distinct ansi16 colors, so the
  // generated bash/python/node all bake those affix SGR params and must match
  // renderToAnsi byte-for-byte.
  const dir = segments.find((s) => s.type === 'directory')!
  dir.label = { text: 'dir', show: true, style: { color: { kind: 'ansi16', code: 36 } } }
  dir.prefix = '['
  dir.prefixStyle = { color: { kind: 'ansi16', code: 34 } }
  dir.suffix = ']'
  dir.suffixStyle = { color: { kind: 'ansi16', code: 35 }, bold: true }
  return {
    version: 1,
    language: 'bash',
    rows: [
      { id: 'r1', segments: segments.slice(0, 7), joiner: '  ' },
      { id: 'r2', segments: segments.slice(7, 14), joiner: ' | ' },
      { id: 'r3', segments: segments.slice(14), joiner: '  ' },
    ],
    pet: {
      enabled: petEnabled,
      petId: 'cactus',
      metric: 'session_5h',
      gap: 1,
      thresholds: { ...DEFAULT_PET_THRESHOLDS },
    },
    global: { defaultThresholds: defaultThresholdStops() },
  }
}

export interface SerializedMock {
  /** The stdin JSON the scripts read (no _-prefixed sim fields). */
  json: string
  /** Env to pin the clock / branch / columns / home. */
  env: {
    PMSL_NOW: string
    PMSL_GIT_BRANCH: string
    COLUMNS: string
    LC_ALL: string
    HOME: string
  }
}

/** Strip the preview-only `_`-prefixed sim fields and map them to env. */
export function serializeMock(mock: MockData): SerializedMock {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(mock)) {
    if (!k.startsWith('_')) clean[k] = v
  }
  return {
    json: JSON.stringify(clean),
    env: {
      PMSL_NOW: String(mock._now),
      PMSL_GIT_BRANCH: mock._gitBranch ?? '',
      COLUMNS: String(mock._columns),
      LC_ALL: 'C.UTF-8',
      // The scripts collapse a leading $HOME to '~' (tildeHome), and the
      // preview does the same substitution with mock._home — so the spawned
      // scripts must see THAT home, not the runner's. Unpinned, the whole
      // parity battery diverges on the directory segment whenever the real
      // $HOME differs from the mock's (e.g. /home/runner on CI).
      HOME: mock._home ?? '/home/vito',
    },
  }
}
