// Shared pet plan: resolve the configured pet, colorize its frames at GENERATE
// time (reusing the exact colorizeFrame from src/pets/runtime → parity by
// construction), and expose the mood-selection metadata the emitters port 1:1
// from selectMood. Each language emitter renders the baked frame rows and the
// selection logic.

import type { StatuslineConfig } from '../../model/types'
import { getPet } from '../../pets/pets'
import { colorizeFrame } from '../../pets/runtime'
import { MOOD_ORDER, type Mood } from '../../pets/types'

export interface PetPlan {
  petId: string
  width: number
  height: number
  gap: number
  position: 'left' | 'right'
  metric: StatuslineConfig['pet']['metric']
  thresholds: StatuslineConfig['pet']['thresholds']
  /** Available moods in MOOD_ORDER, each with its colorized (ANSI-baked) rows. */
  moods: { mood: Mood; rows: string[] }[]
  /** Resolution map: desired mood → actual mood, mirroring selectMood's
   *  resolveMood (idle→calm; otherwise walk down to nearest defined lower
   *  mood, ultimately calm). Keyed by every Mood. */
  resolve: Record<Mood, Mood>
}

/** True when the config has an enabled, resolvable pet. */
export function hasPet(config: StatuslineConfig): boolean {
  return config.pet.enabled && getPet(config.pet.petId) !== undefined
}

function resolveMood(want: Mood, available: Set<Mood>): Mood {
  if (available.has(want)) return want
  if (want === 'idle') return 'calm'
  const idx = MOOD_ORDER.indexOf(want)
  for (let i = idx - 1; i >= 0; i--) {
    const m = MOOD_ORDER[i]
    if (m !== 'idle' && available.has(m)) return m
  }
  return 'calm'
}

export function buildPetPlan(config: StatuslineConfig): PetPlan | null {
  if (!config.pet.enabled) return null
  const pet = getPet(config.pet.petId)
  if (!pet) return null

  const availableMoods = Object.keys(pet.frames) as Mood[]
  const availableSet = new Set(availableMoods)
  const moods = MOOD_ORDER.filter((m) => availableSet.has(m)).map((mood) => {
    const frame = pet.frames[mood]!
    return { mood, rows: colorizeFrame(frame, pet.bodyColor) }
  })

  const resolve = {} as Record<Mood, Mood>
  for (const want of MOOD_ORDER) resolve[want] = resolveMood(want, availableSet)

  return {
    petId: pet.id,
    width: pet.width,
    height: pet.height,
    gap: config.pet.gap,
    position: config.pet.position,
    metric: config.pet.metric,
    thresholds: config.pet.thresholds,
    moods,
    resolve,
  }
}

/** JSON path pieces for the pet's bound metric percent. */
export function petMetricPath(metric: StatuslineConfig['pet']['metric']): string[] {
  if (metric === 'context') return ['context_window', 'used_percentage']
  if (metric === 'session_5h') return ['rate_limits', 'five_hour', 'used_percentage']
  return ['rate_limits', 'seven_day', 'used_percentage']
}
