// Canonical pet vocabulary — single source of truth for moods, thresholds and
// pet data shapes. Both the statusline model (PetConfig) and the pet roster
// import from here so the vocabularies can never drift.

export type Mood = 'idle' | 'calm' | 'wary' | 'alarmed' | 'panic'

export const MOOD_ORDER: readonly Mood[] = [
  'idle',
  'calm',
  'wary',
  'alarmed',
  'panic',
] as const

/** Which session metric drives the pet's mood. */
export type PetMetric = 'context' | 'session_5h' | 'week_7d'

/**
 * Mood boundaries, in percent. Selection (see pets/runtime.ts selectMood):
 * idle uses `<=` (10% is still idle), the others use `<` (50% is wary,
 * 90% is panic). `panic` is the open-ended rest.
 */
export interface PetThresholds {
  idle: number
  calm: number
  wary: number
  alarmed: number
}

export const DEFAULT_PET_THRESHOLDS: PetThresholds = {
  idle: 10,
  calm: 50,
  wary: 80,
  alarmed: 90,
}

/**
 * Colors a contiguous run of cells within one frame row.
 * `color` is an xterm-256 index. ANSI is zero-width, so spans never affect
 * the fixed-grid width invariant.
 */
export interface Span {
  row: number
  col: number
  len: number
  color: number
}

export interface Frame {
  /** Exactly `Pet.height` rows, each space-padded to `Pet.width` visible cells. */
  rows: string[]
  /** Optional color runs; absent → whole frame renders in `Pet.bodyColor`. */
  spans?: Span[]
}

export interface Pet {
  id: string
  /** UI display name. */
  label: string
  /** One-line personality blurb for the pet picker. */
  bio: string
  /** Fixed visible width in cells; identical for every frame of this pet. */
  width: number
  /** Canonical height — v1 ships 3-row pets only. */
  height: 3
  /** Default xterm-256 color for glyphs not covered by a span. */
  bodyColor: number
  /** True when frames use printable ASCII only (no box-drawing). */
  asciiOnly: boolean
  /** `calm` is required; `idle` optional (selector falls back to calm). */
  frames: Partial<Record<Mood, Frame>>
}
