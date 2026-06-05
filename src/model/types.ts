// StatuslineConfig — the single declarative source of truth. ONE plain-data
// object drives BOTH the preview renderer and the three code generators
// (bash/python/node). Every field is serializable data — no functions, no
// closures — so it survives JSON round-trips for re-import and localStorage.
//
// NOTE: this file carries corrections from adversarial review that WIN over the
// design doc: ColorSpec is a 3-way union (fixed / ansi16 / threshold), and the
// pet vocabulary (PetMetric, PetThresholds) is imported from src/pets/types.ts
// — the canonical definition — never redefined here.

import type { PetMetric, PetThresholds } from '../pets/types'

// ---------------------------------------------------------------------------
// Segment kinds
// ---------------------------------------------------------------------------

// 21 segment types. NO `repo` segment (deferred, YAGNI).
export type SegmentType =
  | 'directory'
  | 'gitBranch'
  | 'model'
  | 'effort'
  | 'context'
  | 'session'
  | 'week'
  | 'cost'
  | 'duration'
  | 'lines'
  | 'outputStyle'
  | 'vimMode'
  | 'sessionName'
  | 'agent'
  | 'pr'
  | 'thinking'
  | 'version'
  | 'worktree'
  | 'separator'
  | 'staticText'

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/** Which ordered sub-parts a metric segment renders. `timer` = reset countdown. */
export type MetricPart = 'bar' | 'percent' | 'timer'
/** How a directory path is shortened. `tildeHome` replaces a leading $HOME with `~`. */
export type DirStyle = 'full' | 'basename' | 'tildeHome'
/** Which of added/removed line counts a lines segment shows. */
export type LinesStyle = 'combined' | 'addedOnly' | 'removedOnly'

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/** A single threshold stop: when `pct >= at`, emit `code`. `ansi16` flips the
 *  code's interpretation from xterm-256 index to a raw SGR code (30-37/90-97). */
export interface ThresholdStop {
  at: number
  code: number
  ansi16?: boolean
}

/** Fixed xterm-256 palette index, 0..255. */
export interface FixedColor {
  kind: 'fixed'
  code: number
}
/** Raw ANSI-16 SGR foreground code: 30-37 (normal) or 90-97 (bright). Required
 *  for byte-faithfulness to the user's current statusline (`\033[1;34m` style). */
export interface Ansi16Color {
  kind: 'ansi16'
  code: number
}
/** Threshold coloring driven by the segment's percentage. The first stop —
 *  sorted DESCENDING by `at` — whose `at <= pct` wins. */
export interface ThresholdColor {
  kind: 'threshold'
  stops: ThresholdStop[]
}
export type ColorSpec = FixedColor | Ansi16Color | ThresholdColor

export interface TextStyle {
  color?: ColorSpec
  bold?: boolean // ESC[1m
  dim?: boolean // ESC[2m
}

// ---------------------------------------------------------------------------
// Per-segment options
// ---------------------------------------------------------------------------

export interface SegmentBase {
  id: string // stable id, used for DnD + re-import
  type: SegmentType
  enabled: boolean
  label?: { text: string; show: boolean; style?: TextStyle }
  emoji?: { glyph: string; show: boolean }
  prefix?: string // literal text before the value
  suffix?: string // literal text after the value
  // Overrides the row's joiner for the join IMMEDIATELY BEFORE this segment.
  // Approved mechanism for byte-faithful spacing: the default preset's row 3
  // joins major groups with two spaces but joins model→effort→context with a
  // single space. Carried here so both the preview row-join (later phase) and
  // the generators honour it. Absent ⇒ use Row.joiner.
  joinBefore?: string
}

export interface MetricSegment extends SegmentBase {
  type: 'context' | 'session' | 'week'
  parts: MetricPart[] // ordered, e.g. ['bar','percent','timer']
  barWidth: number // default 5
  barChars: { filled: string; empty: string } // default █ / ░
  valueStyle?: TextStyle // typically a ThresholdColor
  barStyle?: TextStyle
  timerStyle?: TextStyle // dim, parenthesized
}

export interface DirectorySegment extends SegmentBase {
  type: 'directory'
  dirStyle: DirStyle // default 'tildeHome'
  style?: TextStyle
}

export interface LinesSegment extends SegmentBase {
  type: 'lines'
  linesStyle: LinesStyle
  addedStyle?: TextStyle
  removedStyle?: TextStyle
}

export interface PrSegment extends SegmentBase {
  type: 'pr'
  showState: boolean
  style?: TextStyle
}

export interface SeparatorSegment extends SegmentBase {
  type: 'separator'
  fill: string // '─'
  width: 'full' | number // 'full' = clamp to COLUMNS at runtime
  style?: TextStyle // dim white
}

export interface StaticTextSegment extends SegmentBase {
  type: 'staticText'
  text: string
  style?: TextStyle
}

/** Plain segments (model, effort, gitBranch, cost, duration, outputStyle,
 *  vimMode, sessionName, agent, thinking, version, worktree). */
export interface SimpleSegment extends SegmentBase {
  type:
    | 'gitBranch'
    | 'model'
    | 'effort'
    | 'cost'
    | 'duration'
    | 'outputStyle'
    | 'vimMode'
    | 'sessionName'
    | 'agent'
    | 'thinking'
    | 'version'
    | 'worktree'
  style?: TextStyle
}

export type Segment =
  | MetricSegment
  | DirectorySegment
  | LinesSegment
  | PrSegment
  | SeparatorSegment
  | StaticTextSegment
  | SimpleSegment

// ---------------------------------------------------------------------------
// Rows / layout
// ---------------------------------------------------------------------------

export interface Row {
  id: string
  segments: Segment[] // ordered left→right
  joiner: string // text between segments, default "  " (two spaces)
}

// ---------------------------------------------------------------------------
// Pet
// ---------------------------------------------------------------------------

export interface PetConfig {
  enabled: boolean
  petId: string // key into the pet roster
  metric: PetMetric // 'context' | 'session_5h' | 'week_7d'
  // The pet is ALWAYS drawn at the left of the statusline; rows follow.
  gap: number // 0-3 spaces between pet column and rows
  thresholds: PetThresholds
}

// ---------------------------------------------------------------------------
// Global
// ---------------------------------------------------------------------------

export interface GlobalOptions {
  defaultThresholds: ThresholdStop[] // applied to new metric segments
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface StatuslineConfig {
  version: 1 // schema version for re-import migration
  language: 'bash' | 'python' | 'node'
  rows: Row[]
  pet: PetConfig
  global: GlobalOptions
}

// ---------------------------------------------------------------------------
// Render intermediate (shared between evaluate() and the preview)
// ---------------------------------------------------------------------------

/** The styled output of evaluating one segment. EMPTY spans ⇒ the segment is
 *  dropped from the row join entirely (no dangling joiner).
 *
 *  Span styles always carry CONCRETE colors (fixed/ansi16): evaluate() is the
 *  only place that knows a metric's percentage, so threshold ColorSpecs are
 *  resolved there. The threshold spec itself stays in the config, where the
 *  generators read it to emit a runtime `color(pct)` helper. */
export interface SegmentRender {
  spans: { text: string; style?: TextStyle }[]
}

