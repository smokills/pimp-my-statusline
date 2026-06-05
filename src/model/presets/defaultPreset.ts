// defaultConfig() — BYTE-FAITHFUL to the user's current ~/.claude/statusline.sh.
//
// The original (abridged) produces three lines:
//   ROW1: directory (ansi16 1;34) + "  " + gitBranch (ansi16 1;32)
//   ROW2: 74× '─' dim white (2;37)
//   ROW3: MODEL_PART CTX%  SESSION  WEEK  PEAK
//         where MODEL_PART = model(1;37) ' ' effort(2;37)
//         and "MODEL_PART ${CTX}%" join is a SINGLE space, while the major
//         groups (…CTX%  SESSION  WEEK  PEAK) join with TWO spaces.
//
// The single-vs-double-space split inside row 3 is encoded with the approved
// `joinBefore` mechanism: the row joiner stays '  ' (two spaces), and effort and
// context carry joinBefore=' ' (one space) so the join immediately before each
// of them is a single space. Net join sequence on row 3:
//   model [ ' ' ] effort [ ' ' ] context [ '  ' ] session [ '  ' ] week [ '  ' ] peak
// which reproduces `${MODEL} ${EFFORT} ${CTX}%  ${SESSION}  ${WEEK}  ${PEAK}`.

import type {
  DirectorySegment,
  MetricSegment,
  PeakSegment,
  SeparatorSegment,
  SimpleSegment,
  StatuslineConfig,
} from '../types'
import { DEFAULT_PET_THRESHOLDS } from '../../pets/types'
import { defaultThresholdStops } from '../segments'

// Canonical threshold triplet (>=90 red(31) / >=70 yellow(33) / else green(32),
// ansi16) comes from the registry so it can never drift from the segment
// defaults. Each embed point gets a FRESH copy via defaultThresholdStops():
// configs are mutated in place by the UI editor, so threshold stops must never
// share an instance across segments.

export function defaultConfig(): StatuslineConfig {
  // ----- Row 1: directory + gitBranch -----
  const directory: DirectorySegment = {
    id: 'directory',
    type: 'directory',
    enabled: true,
    dirStyle: 'tildeHome',
    style: { color: { kind: 'ansi16', code: 34 }, bold: true }, // LBL_D 1;34
  }
  const gitBranch: SimpleSegment = {
    id: 'gitBranch',
    type: 'gitBranch',
    enabled: true,
    style: { color: { kind: 'ansi16', code: 32 }, bold: true }, // LBL_B 1;32
  }

  // ----- Row 2: separator -----
  const separator: SeparatorSegment = {
    id: 'separator',
    type: 'separator',
    enabled: true,
    fill: '─',
    width: 74, // exact char count from the original SEP line
    style: { color: { kind: 'ansi16', code: 37 }, dim: true }, // 2;37
  }

  // ----- Row 3: model effort context  session  week  peak -----
  const model: SimpleSegment = {
    id: 'model',
    type: 'model',
    enabled: true,
    style: { color: { kind: 'ansi16', code: 37 }, bold: true }, // LBL_M 1;37
  }
  const effort: SimpleSegment = {
    id: 'effort',
    type: 'effort',
    enabled: true,
    joinBefore: ' ', // single space: "${MODEL} ${EFFORT}"
    style: { color: { kind: 'ansi16', code: 37 }, dim: true }, // LBL_E 2;37
  }
  const context: MetricSegment = {
    id: 'context',
    type: 'context',
    enabled: true,
    joinBefore: ' ', // single space: "${MODEL_PART} ${CTX}%"
    parts: ['percent'], // percent only, NO bar
    barWidth: 5,
    barChars: { filled: '█', empty: '░' },
    valueStyle: { color: { kind: 'threshold', stops: defaultThresholdStops() } },
  }
  const session: MetricSegment = {
    id: 'session',
    type: 'session',
    enabled: true,
    label: { text: 'Session', show: true, style: { color: { kind: 'ansi16', code: 36 } } }, // LBL_S 36
    parts: ['bar', 'percent', 'timer'],
    barWidth: 5,
    barChars: { filled: '█', empty: '░' },
    valueStyle: { color: { kind: 'threshold', stops: defaultThresholdStops() } },
    timerStyle: { color: { kind: 'ansi16', code: 37 }, dim: true }, // LBL_E 2;37
  }
  const week: MetricSegment = {
    id: 'week',
    type: 'week',
    enabled: true,
    label: { text: 'Week', show: true, style: { color: { kind: 'ansi16', code: 35 } } }, // LBL_W 35
    parts: ['bar', 'percent'], // NO timer
    barWidth: 5,
    barChars: { filled: '█', empty: '░' },
    valueStyle: { color: { kind: 'threshold', stops: defaultThresholdStops() } },
  }
  const peak: PeakSegment = {
    id: 'peak',
    type: 'peak',
    enabled: true,
    showCountdown: true,
    tz: 'America/Los_Angeles',
    windowDays: [1, 2, 3, 4, 5],
    startHour: 5,
    endHour: 11,
    peakStyle: { color: { kind: 'ansi16', code: 31 }, bold: true }, // 1;31
    offPeakStyle: { color: { kind: 'ansi16', code: 32 }, bold: true }, // 1;32
  }

  return {
    version: 1,
    language: 'bash',
    rows: [
      { id: 'row1', segments: [directory, gitBranch], joiner: '  ' },
      { id: 'row2', segments: [separator], joiner: '  ' },
      {
        id: 'row3',
        segments: [model, effort, context, session, week, peak],
        joiner: '  ',
      },
    ],
    pet: {
      enabled: false,
      petId: 'cactus',
      metric: 'context',
      position: 'left',
      gap: 1,
      thresholds: { ...DEFAULT_PET_THRESHOLDS },
    },
    global: {
      emoji: false,
      defaultThresholds: defaultThresholdStops(),
    },
  }
}
