// Node pet emitter. Frames colorized at generate time, baked into an object of
// mood -> array of double-quoted strings with \x1b (no backticks/template
// literals in art). Mood selection ports selectMood; composition mirrors
// compose(). All lines are emitted UNINDENTED; the node emitter indents the
// whole pet block by the handler indent.

import type { StatuslineConfig } from '../../model/types'
import type { RowPlan } from '../types'
import { buildPetPlan, petMetricPath, type PetPlan } from './shared'
import { MOOD_ORDER } from '../../pets/types'

/** A colorized row (with \x1b ESC) -> JS double-quoted literal with \x1b. */
function jsAnsiLiteral(row: string): string {
  let out = '"'
  for (const ch of row) {
    const code = ch.codePointAt(0)!
    if (code === 0x1b) out += '\\x1b'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '"') out += '\\"'
    else out += ch
  }
  out += '"'
  return out
}

export function emitNodePet(config: StatuslineConfig): string[] {
  const plan = buildPetPlan(config)
  if (!plan) return []
  const lines: string[] = []
  lines.push(`// --- Pet: ${plan.petId} (width ${plan.width}, height ${plan.height}). ANSI pre-baked. ---`)
  lines.push('const PET_FRAMES = {')
  for (const { mood, rows } of plan.moods) {
    lines.push(`  ${mood}: [${rows.map(jsAnsiLiteral).join(', ')}],`)
  }
  lines.push('};')
  lines.push(...emitMoodSelection(plan))
  return lines
}

function emitMoodSelection(plan: PetPlan): string[] {
  const lines: string[] = []
  const path = petMetricPath(plan.metric)
  const expr = 'data?.' + path.join('?.')
  lines.push('// Pet mood selection (ported from selectMood). Metric absent => 0.')
  lines.push(`let _petP = Math.trunc(Number(${expr}) || 0);`)
  lines.push('_petP = _petP < 0 ? 0 : (_petP > 100 ? 100 : _petP);')
  const hasIdle = plan.moods.some((m) => m.mood === 'idle')
  const t = plan.thresholds
  lines.push('let _petWant;')
  if (hasIdle) {
    lines.push(`if (_petP <= ${t.idle}) _petWant = "idle";`)
    lines.push(`else if (_petP < ${t.calm}) _petWant = "calm";`)
  } else {
    lines.push(`if (_petP < ${t.calm}) _petWant = "calm";`)
  }
  lines.push(`else if (_petP < ${t.wary}) _petWant = "wary";`)
  lines.push(`else if (_petP < ${t.alarmed}) _petWant = "alarmed";`)
  lines.push(`else _petWant = "panic";`)
  const pairs = MOOD_ORDER.map((m) => `${m}: "${plan.resolve[m]}"`).join(', ')
  lines.push(`const _petResolve = { ${pairs} };`)
  lines.push('const _petMood = _petResolve[_petWant];')
  lines.push('const _petRows = PET_FRAMES[_petMood];')
  return lines
}

export function emitNodePetCompose(config: StatuslineConfig, rows: RowPlan[]): string[] {
  const plan = buildPetPlan(config)
  if (!plan) return []
  const I = '  '
  const lines: string[] = []
  lines.push(`${I}// --- Pet composition + output ---`)
  lines.push(`${I}const _rows = [${rows.map((r) => r.rowVar).join(', ')}];`)
  lines.push(`${I}const _petW = ${plan.width};`)
  lines.push(`${I}const _gap = ${plan.gap};`)
  lines.push(`${I}const _ansiRe = /\\x1b\\[[0-9;]*m/g;`)
  lines.push(`${I}const _osc8Re = /\\x1b\\]8;;[^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)/g;`)
  lines.push(`${I}const _visibleLen = (s) => s.replace(_osc8Re, "").replace(_ansiRe, "").length;`)
  lines.push(`${I}const _lout = Math.max(_petRows.length, _rows.length);`)
  lines.push(`${I}const _blank = " ".repeat(_petW);`)
  if (plan.position === 'right') {
    lines.push(`${I}const _maxw = _rows.reduce((m, r) => Math.max(m, _visibleLen(r)), 0);`)
  }
  lines.push(`${I}for (let _i = 0; _i < _lout; _i++) {`)
  lines.push(`${I}  const _pc = _i < _petRows.length ? _petRows[_i] : _blank;`)
  lines.push(`${I}  let _rc = _i < _rows.length ? _rows[_i] : "";`)
  if (plan.position === 'left') {
    lines.push(`${I}  console.log(_pc + " ".repeat(_gap) + _rc);`)
  } else {
    lines.push(`${I}  const _deficit = _maxw - _visibleLen(_rc);`)
    lines.push(`${I}  if (_deficit > 0) _rc = _rc + " ".repeat(_deficit);`)
    lines.push(`${I}  console.log(_rc + " ".repeat(_gap) + _pc);`)
  }
  lines.push(`${I}}`)
  return lines
}
