// Zod v4 schema for StatuslineConfig. Used later for re-import (decode →
// migrate → validate) and localStorage hydration. parseConfig() is total:
// returns the typed config on success, null on any failure.

import { z } from 'zod'
import type { StatuslineConfig } from './types'

// An xterm-256 palette index.
const xterm256Code = z.number().int().min(0).max(255)
// A raw ANSI-16 SGR foreground code: 30-37 (normal) or 90-97 (bright).
const ansi16Code = z
  .number()
  .int()
  .refine((c) => (c >= 30 && c <= 37) || (c >= 90 && c <= 97), {
    message: 'ansi16 code must be 30-37 or 90-97',
  })

// A threshold stop's `code` is an xterm index by default, or an ansi16 SGR code
// when `ansi16` is true — both fit in 0..255, the `ansi16` flag disambiguates.
const thresholdStop = z.object({
  at: z.number().int().min(0).max(100),
  code: xterm256Code,
  ansi16: z.boolean().optional(),
})

const colorSpec = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), code: xterm256Code }),
  z.object({ kind: z.literal('ansi16'), code: ansi16Code }),
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
  barWidth: z.number().int().min(1).max(40),
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
  width: z.union([z.literal('full'), z.number().int().min(1)]),
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
  gap: z.number().int().min(0).max(3),
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
