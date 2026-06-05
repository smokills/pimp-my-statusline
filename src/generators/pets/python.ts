// Python pet emitter. Frames colorized at generate time, baked into a dict of
// mood -> list[str] with \033 escapes. Mood selection ports selectMood;
// composition mirrors compose().

import type { StatuslineConfig } from '../../model/types'
import type { RowPlan } from '../types'
import { buildPetPlan, petMetricPath, type PetPlan } from './shared'
import { MOOD_ORDER } from '../../pets/types'

/** A colorized row (with \x1b ESC) -> python single-quoted string literal with
 *  \033 escapes. */
function pyAnsiLiteral(row: string): string {
  let out = "'"
  for (const ch of row) {
    const code = ch.codePointAt(0)!
    if (code === 0x1b) out += '\\033'
    else if (ch === '\\') out += '\\\\'
    else if (ch === "'") out += "\\'"
    else out += ch
  }
  out += "'"
  return out
}

export function emitPyPet(config: StatuslineConfig): string[] {
  const plan = buildPetPlan(config)
  if (!plan) return []
  const lines: string[] = []
  lines.push(`# --- Pet: ${plan.petId} (width ${plan.width}, height ${plan.height}). ANSI pre-baked. ---`)
  lines.push('PET_FRAMES = {')
  for (const { mood, rows } of plan.moods) {
    lines.push(`    '${mood}': [${rows.map(pyAnsiLiteral).join(', ')}],`)
  }
  lines.push('}')
  lines.push(...emitMoodSelection(plan))
  return lines
}

function emitMoodSelection(plan: PetPlan): string[] {
  const lines: string[] = []
  const path = petMetricPath(plan.metric)
  let expr = 'data'
  for (const key of path) expr = `(${expr} or {}).get('${key}')`
  lines.push('# Pet mood selection (ported from selectMood). Metric absent => 0.')
  lines.push(`_pet_p = int(float(${expr} or 0))`)
  lines.push('_pet_p = 0 if _pet_p < 0 else (100 if _pet_p > 100 else _pet_p)')
  const hasIdle = plan.moods.some((m) => m.mood === 'idle')
  const t = plan.thresholds
  if (hasIdle) {
    lines.push(`if _pet_p <= ${t.idle}: _pet_want = 'idle'`)
    lines.push(`elif _pet_p < ${t.calm}: _pet_want = 'calm'`)
  } else {
    lines.push(`if _pet_p < ${t.calm}: _pet_want = 'calm'`)
  }
  lines.push(`elif _pet_p < ${t.wary}: _pet_want = 'wary'`)
  lines.push(`elif _pet_p < ${t.alarmed}: _pet_want = 'alarmed'`)
  lines.push(`else: _pet_want = 'panic'`)
  // resolve map (desired -> actual).
  const pairs = MOOD_ORDER.map((m) => `'${m}': '${plan.resolve[m]}'`).join(', ')
  lines.push(`_pet_resolve = {${pairs}}`)
  lines.push('_pet_mood = _pet_resolve[_pet_want]')
  lines.push('_pet_rows = PET_FRAMES[_pet_mood]')
  return lines
}

export function emitPyPetCompose(config: StatuslineConfig, rows: RowPlan[]): string[] {
  const plan = buildPetPlan(config)
  if (!plan) return []
  const lines: string[] = []
  lines.push('# --- Pet composition + output (pet column left, rows follow) ---')
  lines.push(`_rows = [${rows.map((r) => r.rowVar).join(', ')}]`)
  lines.push(`_pet_w = ${plan.width}`)
  lines.push(`_gap = ${plan.gap}`)
  lines.push('_lout = max(len(_pet_rows), len(_rows))')
  lines.push("_blank = ' ' * _pet_w")
  lines.push('for _i in range(_lout):')
  lines.push('    _pc = _pet_rows[_i] if _i < len(_pet_rows) else _blank')
  lines.push("    _rc = _rows[_i] if _i < len(_rows) else ''")
  lines.push("    print(_pc + (' ' * _gap) + _rc)")
  return lines
}
