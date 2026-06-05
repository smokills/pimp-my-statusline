// Shared types for the code generators. A language `Emitter` supplies every
// language-specific primitive the assembler needs; assemble.ts is the single
// orchestration that walks the config in a straight line (no runtime loops over
// segments — the config is baked at GENERATE time).

import type { HelperId } from '../model/segments'
import type { Segment, StatuslineConfig, ThresholdStop } from '../model/types'

export type Lang = 'bash' | 'python' | 'node'

/** A `color(p)` / `color2(p)` runtime helper, one per unique stops-signature. */
export interface ColorFn {
  name: string // 'color', 'color2', ...
  stops: ThresholdStop[]
}

/** Maps a stops-signature (JSON) → the deterministic color function name. */
export type ColorFnMap = Map<string, ColorFn>

/** Everything a segment emitter needs to produce its block. */
export interface SegmentEmitCtx {
  config: StatuslineConfig
  /** The variable name to assign the rendered segment into (e.g. `SEG_session`). */
  varName: string
  /** Resolve the runtime color-fn name for a given threshold stops list. */
  colorFnName(stops: ThresholdStop[]): string
}

/** Language emitter: the full set of primitives assemble.ts composes. */
export interface Emitter {
  lang: Lang

  // ----- File scaffolding -----
  /** Shebang line (no trailing newline). */
  shebang(): string
  /** Lines of the preamble: stdin read + JSON parse + NOW + COLUMNS, etc.
   *  `needsGit` enables the git-branch env-override note where relevant. */
  preamble(config: StatuslineConfig): string[]

  // ----- Helpers -----
  /** Base helpers always needed by styled output (e.g. the span wrapper). Only
   *  emitted when threshold colors are present (passed `true`). */
  baseHelpers(needsThreshold: boolean): string[]
  /** Emit one threshold `color`/`colorN` function. */
  colorFn(fn: ColorFn): string[]
  /** Emit a single helper by id (bar, time_until, peak, fmt_cost, ...). */
  helper(id: HelperId, config: StatuslineConfig): string[]
  /** Pet runtime: mood-selection + frame tables + composition helpers. The
   *  frame literals are colorized at generate time (parity by construction). */
  petBlock(config: StatuslineConfig): string[]

  // ----- Segments -----
  /** Emit the commented variable-assignment block for one segment. */
  segment(seg: Segment, ctx: SegmentEmitCtx): string[]

  // ----- Assembly -----
  /** Build the row-assembly + output (and pet composition) tail. `rowVars` are
   *  the per-segment variable names per row, in order. */
  assembleRows(config: StatuslineConfig, rows: RowPlan[]): string[]
}

/** One enabled segment within a planned row. */
export interface PlannedSegment {
  seg: Segment
  varName: string
}

/** A row with its enabled segments resolved to variable names. */
export interface RowPlan {
  rowIndex: number
  rowVar: string // the assembled ROW variable name
  joiner: string
  segments: PlannedSegment[]
}
