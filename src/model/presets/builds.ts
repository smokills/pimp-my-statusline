// Prefab BUILDS — complete, ready-made statusline configs the builder offers as
// one-click starting points (the strip under the preview). Each build is a
// fresh StatuslineConfig factory: make() never shares object instances across
// calls (the editor mutates configs in place, so threshold stop arrays etc.
// must be per-instance — same rule as defaultPreset).
//
// A build replaces rows + pet + global wholesale; the user's language choice is
// an export preference and is preserved by the caller (BuildStrip).

import type {
  DirectorySegment,
  LinesSegment,
  MetricSegment,
  SeparatorSegment,
  SimpleSegment,
  StatuslineConfig,
} from '../types'
import { DEFAULT_PET_THRESHOLDS } from '../../pets/types'
import { defaultThresholdStops } from '../segments'
import { defaultConfig } from './defaultPreset'

export interface BuildPreset {
  id: string
  name: string
  /** One-liner shown on the build card. */
  blurb: string
  make(): StatuslineConfig
}

// ---------------------------------------------------------------------------
// Shared little factories (fresh instances on every call)
// ---------------------------------------------------------------------------

function dir(id: string): DirectorySegment {
  return {
    id,
    type: 'directory',
    enabled: true,
    dirStyle: 'tildeHome',
    style: { color: { kind: 'ansi16', code: 34 }, bold: true },
  }
}

function branch(id: string): SimpleSegment {
  return {
    id,
    type: 'gitBranch',
    enabled: true,
    style: { color: { kind: 'ansi16', code: 32 }, bold: true },
  }
}

function model(id: string): SimpleSegment {
  return {
    id,
    type: 'model',
    enabled: true,
    style: { color: { kind: 'ansi16', code: 37 }, bold: true },
  }
}

function metric(
  id: string,
  type: MetricSegment['type'],
  label: string,
  labelColor: number,
  parts: MetricSegment['parts'],
): MetricSegment {
  return {
    id,
    type,
    enabled: true,
    label: { text: label, show: true, style: { color: { kind: 'fixed', code: labelColor } } },
    parts,
    barWidth: 5,
    barChars: { filled: '█', empty: '░' },
    valueStyle: { color: { kind: 'threshold', stops: defaultThresholdStops() } },
    timerStyle: { color: { kind: 'ansi16', code: 37 }, dim: true },
  }
}

function petOff(): StatuslineConfig['pet'] {
  return {
    enabled: false,
    petId: 'cactus',
    metric: 'context',
    gap: 1,
    thresholds: { ...DEFAULT_PET_THRESHOLDS },
  }
}

function globals(): StatuslineConfig['global'] {
  return { defaultThresholds: defaultThresholdStops() }
}

// ---------------------------------------------------------------------------
// The builds
// ---------------------------------------------------------------------------

/** Minimal — just the essentials on one line. */
function minimal(): StatuslineConfig {
  const mdl: SimpleSegment = {
    id: 'min-model',
    type: 'model',
    enabled: true,
    style: { color: { kind: 'ansi16', code: 37 }, dim: true },
  }
  return {
    version: 1,
    language: 'bash',
    rows: [{ id: 'min-r1', segments: [dir('min-dir'), branch('min-branch'), mdl], joiner: '  ' }],
    pet: petOff(),
    global: globals(),
  }
}

/** Mission Control — every meter on deck across four rows. */
function missionControl(): StatuslineConfig {
  const effort: SimpleSegment = {
    id: 'mc-effort',
    type: 'effort',
    enabled: true,
    joinBefore: ' ',
    style: { color: { kind: 'ansi16', code: 37 }, dim: true },
  }
  const sep: SeparatorSegment = {
    id: 'mc-sep',
    type: 'separator',
    enabled: true,
    fill: '─',
    width: 'full',
    style: { color: { kind: 'ansi16', code: 37 }, dim: true },
  }
  const cost: SimpleSegment = {
    id: 'mc-cost',
    type: 'cost',
    enabled: true,
    style: { color: { kind: 'ansi16', code: 33 }, bold: true },
  }
  const duration: SimpleSegment = {
    id: 'mc-duration',
    type: 'duration',
    enabled: true,
    style: { color: { kind: 'ansi16', code: 37 }, dim: true },
  }
  const lines: LinesSegment = {
    id: 'mc-lines',
    type: 'lines',
    enabled: true,
    linesStyle: 'combined',
    addedStyle: { color: { kind: 'ansi16', code: 32 } },
    removedStyle: { color: { kind: 'ansi16', code: 31 } },
  }
  return {
    version: 1,
    language: 'bash',
    rows: [
      {
        id: 'mc-r1',
        segments: [dir('mc-dir'), branch('mc-branch'), model('mc-model'), effort],
        joiner: '  ',
      },
      { id: 'mc-r2', segments: [sep], joiner: '  ' },
      {
        id: 'mc-r3',
        segments: [
          metric('mc-ctx', 'context', 'Ctx', 81, ['bar', 'percent']),
          metric('mc-session', 'session', 'Session', 215, ['bar', 'percent', 'timer']),
          metric('mc-week', 'week', 'Week', 141, ['bar', 'percent']),
        ],
        joiner: '  ',
      },
      { id: 'mc-r4', segments: [cost, duration, lines], joiner: '  ' },
    ],
    pet: petOff(),
    global: globals(),
  }
}

/** Pet Companion — a reactive buddy beside a compact two-row layout. */
function petCompanion(): StatuslineConfig {
  const ctx = metric('pc-ctx', 'context', 'Ctx', 81, ['percent'])
  const session = metric('pc-session', 'session', 'Session', 215, ['bar', 'percent', 'timer'])
  return {
    version: 1,
    language: 'bash',
    rows: [
      { id: 'pc-r1', segments: [dir('pc-dir'), branch('pc-branch')], joiner: '  ' },
      { id: 'pc-r2', segments: [model('pc-model'), ctx, session], joiner: '  ' },
    ],
    pet: {
      enabled: true,
      petId: 'cat',
      metric: 'context',
      gap: 1,
      thresholds: { ...DEFAULT_PET_THRESHOLDS },
    },
    global: globals(),
  }
}

/** Cost Watcher — spend, wall-clock time and code churn at a glance. */
function costWatcher(): StatuslineConfig {
  const cost: SimpleSegment = {
    id: 'cw-cost',
    type: 'cost',
    enabled: true,
    style: { color: { kind: 'ansi16', code: 33 }, bold: true },
  }
  const duration: SimpleSegment = {
    id: 'cw-duration',
    type: 'duration',
    enabled: true,
    style: { color: { kind: 'ansi16', code: 37 }, dim: true },
  }
  const lines: LinesSegment = {
    id: 'cw-lines',
    type: 'lines',
    enabled: true,
    linesStyle: 'combined',
    addedStyle: { color: { kind: 'ansi16', code: 32 } },
    removedStyle: { color: { kind: 'ansi16', code: 31 } },
  }
  return {
    version: 1,
    language: 'bash',
    rows: [
      { id: 'cw-r1', segments: [dir('cw-dir'), branch('cw-branch')], joiner: '  ' },
      { id: 'cw-r2', segments: [model('cw-model'), cost, duration, lines], joiner: '  ' },
    ],
    pet: petOff(),
    global: globals(),
  }
}

export const BUILDS: readonly BuildPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'The original three-row layout: path, branch, model + usage meters.',
    make: defaultConfig,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Just the essentials on a single line.',
    make: minimal,
  },
  {
    id: 'mission-control',
    name: 'Mission Control',
    blurb: 'Every meter on deck: usage bars, cost, time and lines.',
    make: missionControl,
  },
  {
    id: 'pet-companion',
    name: 'Pet Companion',
    blurb: 'A reactive buddy keeps watch on your context.',
    make: petCompanion,
  },
  {
    id: 'cost-watcher',
    name: 'Cost Watcher',
    blurb: 'Track spend, session time and code churn at a glance.',
    make: costWatcher,
  },
]
