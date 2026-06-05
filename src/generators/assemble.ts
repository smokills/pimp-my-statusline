// Shared assembly. Walks the config in a STRAIGHT LINE (the config is baked at
// generate time — the generated script never loops over segments) and drives a
// language Emitter to produce:
//   1) shebang
//   2) re-import marker (line 2)
//   3) preamble (stdin read, JSON parse, NOW, COLUMNS)
//   4) helper block — ONLY the helpers the enabled segments + pet need
//      (union of SEGMENTS[type].helpers, deduped, in a stable order) plus one
//      color()/colorN() per UNIQUE threshold stops-signature
//   5) one commented block per enabled segment per row
//   6) row assembly + pet composition + output

import type { HelperId } from '../model/segments'
import { SEGMENTS } from '../model/segments'
import type {
  Row,
  Segment,
  StatuslineConfig,
  TextStyle,
  ThresholdStop,
} from '../model/types'
import { embedMarker } from '../model/reimport'
import type {
  ColorFn,
  Emitter,
  PlannedSegment,
  RowPlan,
  SegmentEmitCtx,
} from './types'

// ---------------------------------------------------------------------------
// Variable naming — stable, readable, collision-free
// ---------------------------------------------------------------------------

/** A readable variable suffix for a segment, unique within the script. We use
 *  the segment type plus a per-type counter so two `model` segments become
 *  `model` and `model2`. */
function buildVarNames(config: StatuslineConfig): Map<Segment, string> {
  const counts = new Map<string, number>()
  const names = new Map<Segment, string>()
  for (const row of config.rows) {
    for (const seg of row.segments) {
      if (!seg.enabled) continue
      const n = (counts.get(seg.type) ?? 0) + 1
      counts.set(seg.type, n)
      names.set(seg, n === 1 ? seg.type : `${seg.type}${n}`)
    }
  }
  return names
}

// ---------------------------------------------------------------------------
// Helper union
// ---------------------------------------------------------------------------

// A stable emit order so output is deterministic.
const HELPER_ORDER: HelperId[] = [
  'gitBranch',
  'bar',
  'timeUntil',
  'fmtCost',
  'fmtDuration',
  'truncCols',
  'pad',
  'petFrame',
  'colorPct',
]

/** Collect the union of helpers needed by every enabled segment (+ pet right
 *  side needs pad/truncCols-style helpers, handled in the pet block). The
 *  `colorPct` helper id is consumed specially: each unique stops-signature
 *  becomes its own color function, so we don't emit a generic colorPct helper. */
function collectHelpers(config: StatuslineConfig): Set<HelperId> {
  const set = new Set<HelperId>()
  for (const row of config.rows) {
    for (const seg of row.segments) {
      if (!seg.enabled) continue
      for (const h of SEGMENTS[seg.type].helpers) set.add(h)
    }
  }
  return set
}

function orderedHelpers(set: Set<HelperId>): HelperId[] {
  return HELPER_ORDER.filter((h) => set.has(h) && h !== 'colorPct')
}

// ---------------------------------------------------------------------------
// Threshold color functions — one per unique stops-signature
// ---------------------------------------------------------------------------

/** Every threshold ColorSpec in scope, in document order (rows → segments →
 *  styles). Used to assign deterministic color-fn names. */
function collectThresholdStops(config: StatuslineConfig): ThresholdStop[][] {
  const out: ThresholdStop[][] = []
  const visitStyle = (style: TextStyle | undefined) => {
    if (style?.color?.kind === 'threshold') out.push(style.color.stops)
  }
  for (const row of config.rows) {
    for (const seg of row.segments) {
      if (!seg.enabled) continue
      // All style-bearing fields across the segment variants.
      const s = seg as unknown as Record<string, unknown>
      visitStyle(s.style as TextStyle | undefined)
      visitStyle(s.valueStyle as TextStyle | undefined)
      visitStyle(s.barStyle as TextStyle | undefined)
      visitStyle(s.timerStyle as TextStyle | undefined)
      visitStyle(s.addedStyle as TextStyle | undefined)
      visitStyle(s.removedStyle as TextStyle | undefined)
      visitStyle(seg.label?.style)
    }
  }
  return out
}

/** Canonical signature for a stops list: sorted DESC by `at` (matching
 *  resolveThreshold), serialized to JSON. Two stops lists that resolve
 *  identically share one generated color function. */
function stopsSignature(stops: ThresholdStop[]): string {
  const sorted = [...stops].sort((a, b) => b.at - a.at)
  return JSON.stringify(
    sorted.map((s) => ({ at: s.at, code: s.code, ansi16: s.ansi16 ?? false })),
  )
}

function buildColorFns(config: StatuslineConfig): {
  fns: ColorFn[]
  nameOf: (stops: ThresholdStop[]) => string
} {
  const bySig = new Map<string, ColorFn>()
  const fns: ColorFn[] = []
  for (const stops of collectThresholdStops(config)) {
    const sig = stopsSignature(stops)
    if (bySig.has(sig)) continue
    const name = fns.length === 0 ? 'color' : `color${fns.length + 1}`
    const fn: ColorFn = { name, stops }
    bySig.set(sig, fn)
    fns.push(fn)
  }
  const nameOf = (stops: ThresholdStop[]) => {
    const fn = bySig.get(stopsSignature(stops))
    if (!fn) throw new Error('color fn not registered for stops')
    return fn.name
  }
  return { fns, nameOf }
}

// ---------------------------------------------------------------------------
// Row plan
// ---------------------------------------------------------------------------

function planRow(
  row: Row,
  rowIndex: number,
  names: Map<Segment, string>,
  emitter: Emitter,
): RowPlan {
  const segments: PlannedSegment[] = []
  for (const seg of row.segments) {
    if (!seg.enabled) continue
    const uid = names.get(seg)!
    segments.push({ seg, varName: segVar(emitter, uid), uid })
  }
  return {
    rowIndex,
    rowVar: rowVarName(emitter, rowIndex),
    joiner: row.joiner,
    segments,
  }
}

/** Per-language casing for the SEG_/seg_ variable prefix. */
export function segVar(emitter: Emitter, suffix: string): string {
  if (emitter.lang === 'node') return `seg_${suffix}`
  return `SEG_${suffix}`
}

export function rowVarName(emitter: Emitter, rowIndex: number): string {
  if (emitter.lang === 'node') return `row${rowIndex + 1}`
  return `ROW${rowIndex + 1}`
}

// ---------------------------------------------------------------------------
// Top-level assembly
// ---------------------------------------------------------------------------

export function assemble(config: StatuslineConfig, emitter: Emitter): string {
  const names = buildVarNames(config)
  const helperSet = collectHelpers(config)
  const helpers = orderedHelpers(helperSet)
  const { fns, nameOf } = buildColorFns(config)
  const rows = config.rows.map((row, i) => planRow(row, i, names, emitter))

  const lines: string[] = []

  // 1) shebang + 2) marker
  lines.push(emitter.shebang())
  lines.push(embedMarker(config, emitter.lang))

  // 3) preamble
  lines.push(...emitter.preamble(config))

  // 3b) optional single-pass field extraction (bash; others access the parsed
  // object directly). uidOf yields each segment's unique-within-script suffix.
  if (emitter.extraction) {
    const uidOf = (seg: Segment) => names.get(seg)!
    const ex = emitter.extraction(config, uidOf)
    if (ex.length > 0) {
      lines.push('')
      lines.push(...ex)
    }
  }

  // 4) helper block
  const helperLines: string[] = []
  helperLines.push(...emitter.baseHelpers(fns.length > 0))
  for (const fn of fns) helperLines.push(...emitter.colorFn(fn))
  for (const id of helpers) helperLines.push(...emitter.helper(id, config))
  if (config.pet.enabled) helperLines.push(...emitter.petBlock(config))
  if (helperLines.length > 0) {
    lines.push('')
    lines.push(...helperLines)
  }

  // 5) per-segment blocks
  for (const plan of rows) {
    for (const ps of plan.segments) {
      const ctx: SegmentEmitCtx = {
        config,
        varName: ps.varName,
        uid: ps.uid,
        colorFnName: nameOf,
      }
      lines.push('')
      lines.push(...emitter.segment(ps.seg, ctx))
    }
  }

  // 6) row assembly + pet composition + output
  lines.push('')
  lines.push(...emitter.assembleRows(config, rows))

  // Single trailing newline; every line (including the last) ends with \n.
  return lines.join('\n') + '\n'
}
