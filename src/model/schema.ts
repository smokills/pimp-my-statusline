// Zod v4 schema for StatuslineConfig. Used later for re-import (decode →
// migrate → validate) and localStorage hydration. parseConfig() is total:
// returns the typed config on success, null on any failure.

import { z } from 'zod'
import type { StatuslineConfig } from './types'

const thresholdStop = z.object({
  at: z.number(),
  code: z.number(),
  ansi16: z.boolean().optional(),
})

const colorSpec = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), code: z.number() }),
  z.object({ kind: z.literal('ansi16'), code: z.number() }),
  z.object({ kind: z.literal('threshold'), stops: z.array(thresholdStop) }),
])

const textStyle = z.object({
  color: colorSpec.optional(),
  bold: z.boolean().optional(),
  dim: z.boolean().optional(),
})

const labelSchema = z.object({
  text: z.string(),
  show: z.boolean(),
  style: textStyle.optional(),
})

const emojiSchema = z.object({
  glyph: z.string(),
  show: z.boolean(),
})

// Common base fields. Each segment variant extends this then narrows `type`.
const base = {
  id: z.string(),
  enabled: z.boolean(),
  label: labelSchema.optional(),
  emoji: emojiSchema.optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  joinBefore: z.string().optional(),
}

const metricSegment = z.object({
  ...base,
  type: z.enum(['context', 'session', 'week']),
  parts: z.array(z.enum(['bar', 'percent', 'timer'])),
  barWidth: z.number(),
  barChars: z.object({ filled: z.string(), empty: z.string() }),
  valueStyle: textStyle.optional(),
  barStyle: textStyle.optional(),
  timerStyle: textStyle.optional(),
})

const directorySegment = z.object({
  ...base,
  type: z.literal('directory'),
  dirStyle: z.enum(['full', 'basename', 'tildeHome']),
  style: textStyle.optional(),
})

const peakSegment = z.object({
  ...base,
  type: z.literal('peak'),
  showCountdown: z.boolean(),
  tz: z.string(),
  windowDays: z.array(z.number()),
  startHour: z.number(),
  endHour: z.number(),
  peakStyle: textStyle.optional(),
  offPeakStyle: textStyle.optional(),
})

const linesSegment = z.object({
  ...base,
  type: z.literal('lines'),
  linesStyle: z.enum(['combined', 'addedOnly', 'removedOnly']),
  addedStyle: textStyle.optional(),
  removedStyle: textStyle.optional(),
})

const prSegment = z.object({
  ...base,
  type: z.literal('pr'),
  showState: z.boolean(),
  style: textStyle.optional(),
})

const separatorSegment = z.object({
  ...base,
  type: z.literal('separator'),
  fill: z.string(),
  width: z.union([z.literal('full'), z.number()]),
  style: textStyle.optional(),
})

const staticTextSegment = z.object({
  ...base,
  type: z.literal('staticText'),
  text: z.string(),
  style: textStyle.optional(),
})

const simpleSegment = z.object({
  ...base,
  type: z.enum([
    'gitBranch',
    'model',
    'effort',
    'cost',
    'duration',
    'outputStyle',
    'vimMode',
    'sessionName',
    'agent',
    'thinking',
    'version',
    'worktree',
  ]),
  style: textStyle.optional(),
})

const segment = z.union([
  metricSegment,
  directorySegment,
  peakSegment,
  linesSegment,
  prSegment,
  separatorSegment,
  staticTextSegment,
  simpleSegment,
])

const row = z.object({
  id: z.string(),
  segments: z.array(segment),
  joiner: z.string(),
})

const petConfig = z.object({
  enabled: z.boolean(),
  petId: z.string(),
  metric: z.enum(['context', 'session_5h', 'week_7d']),
  position: z.enum(['left', 'right']),
  gap: z.number(),
  thresholds: z.object({
    idle: z.number(),
    calm: z.number(),
    wary: z.number(),
    alarmed: z.number(),
  }),
})

const globalOptions = z.object({
  emoji: z.boolean(),
  defaultThresholds: z.array(thresholdStop),
})

export const statuslineConfigSchema = z.object({
  version: z.literal(1),
  language: z.enum(['bash', 'python', 'node']),
  rows: z.array(row),
  pet: petConfig,
  global: globalOptions,
})

/** Parse unknown input into a StatuslineConfig; null on any validation failure. */
export function parseConfig(input: unknown): StatuslineConfig | null {
  const result = statuslineConfigSchema.safeParse(input)
  return result.success ? (result.data as StatuslineConfig) : null
}
