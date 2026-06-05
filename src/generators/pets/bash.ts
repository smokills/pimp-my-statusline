// Bash pet emitter. Frames are colorized at GENERATE time (parity by
// construction) and baked into per-mood/per-row $'...' variables with real ESC
// bytes. Mood selection ports selectMood (trunc + clamp + thresholds +
// fallbacks). Composition: left = straight-line concat (gap baked); right =
// strip_ansi/visible_len + pad loop.

import type { StatuslineConfig } from '../../model/types'
import type { RowPlan } from '../types'
import { buildPetPlan, type PetPlan } from './shared'
import { MOOD_ORDER } from '../../pets/types'

/** Convert a colorized row (JS string with \x1b ESC) to a bash $'...' literal:
 *  ESC → \033, single backslash → \\, single quote → \'. */
function bashAnsiLiteral(row: string): string {
  let out = "$'"
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

export function emitBashPet(config: StatuslineConfig): string[] {
  const plan = buildPetPlan(config)
  if (!plan) return []
  const lines: string[] = []
  lines.push(`# --- Pet: ${plan.petId} (width ${plan.width}, height ${plan.height}). ANSI pre-baked. ---`)
  lines.push('# Each PET_<mood>_<row> is exactly the pet width in visible cells (ANSI is zero-width).')
  for (const { mood, rows } of plan.moods) {
    for (let r = 0; r < rows.length; r++) {
      lines.push(`PET_${mood}_${r}=${bashAnsiLiteral(rows[r])}`)
    }
  }
  lines.push('')
  lines.push(...emitMoodSelection(plan))
  return lines
}

/** Emit pet_select: read the bound metric percent, port selectMood, set
 *  PET_0..PET_{h-1} to the chosen mood's rows. */
function emitMoodSelection(plan: PetPlan): string[] {
  const lines: string[] = []
  lines.push('# Pet mood selection (ported from selectMood: trunc + clamp + thresholds).')
  lines.push('# Bound metric absent => pct 0 (pet still renders at its lowest mood).')
  lines.push('# EX_pet_p was pulled in the single jq pass above.')
  lines.push('_pet_p="$EX_pet_p"')
  lines.push('[ "$_pet_p" -lt 0 ] && _pet_p=0; [ "$_pet_p" -gt 100 ] && _pet_p=100')

  const hasIdle = plan.moods.some((m) => m.mood === 'idle')
  const t = plan.thresholds
  // Desired mood chain, then map through resolve to actual mood.
  lines.push('_pet_mood=panic')
  // Build if/elif mirroring selectMood. idle uses <=, others <.
  const branches: string[] = []
  if (hasIdle) branches.push(`if [ "$_pet_p" -le ${t.idle} ]; then _pet_want=idle`)
  branches.push(
    `${hasIdle ? 'elif' : 'if'} [ "$_pet_p" -lt ${t.calm} ]; then _pet_want=calm`,
  )
  branches.push(`elif [ "$_pet_p" -lt ${t.wary} ]; then _pet_want=wary`)
  branches.push(`elif [ "$_pet_p" -lt ${t.alarmed} ]; then _pet_want=alarmed`)
  branches.push('else _pet_want=panic')
  lines.push(branches.join('; ') + '; fi')

  // Map desired -> actual (static resolve table) via a case.
  lines.push('case "$_pet_want" in')
  for (const want of MOOD_ORDER) {
    const actual = plan.resolve[want]
    lines.push(`  ${want}) _pet_mood=${actual} ;;`)
  }
  lines.push('esac')

  // Assign PET_0..PET_{h-1} from PET_<mood>_<r> via indirection.
  lines.push('case "$_pet_mood" in')
  for (const { mood } of plan.moods) {
    const assigns = plan.moods.find((m) => m.mood === mood)!.rows
      .map((_r, r) => `PET_${r}=$PET_${mood}_${r}`)
      .join('; ')
    lines.push(`  ${mood}) ${assigns} ;;`)
  }
  lines.push('esac')
  return lines
}

/** Composition + output. Mirrors compose(): left = petCell + gap + rowCell;
 *  right = padTo(rowCell, maxRowVisibleWidth) + gap + petCell. Output length is
 *  max(petHeight, rowCount). */
export function emitBashPetCompose(config: StatuslineConfig, rows: RowPlan[]): string[] {
  const plan = buildPetPlan(config)
  if (!plan) return []
  const lines: string[] = []
  const gapStr = ' '.repeat(plan.gap)
  const petH = plan.height
  const rowCount = rows.length
  const Lout = Math.max(petH, rowCount)
  const blank = ' '.repeat(plan.width)

  lines.push('# --- Pet composition + output ---')

  if (plan.position === 'right') {
    lines.push(...emitVisibleLen())
    // Compute maxRowVisibleWidth across the row vars.
    lines.push('_pet_maxw=0')
    for (const plan2 of rows) {
      lines.push(`_pet_vw=$(visible_len "$${plan2.rowVar}"); [ "$_pet_vw" -gt "$_pet_maxw" ] && _pet_maxw=$_pet_vw`)
    }
  }

  for (let i = 0; i < Lout; i++) {
    const petCell = i < petH ? `"$PET_${i}"` : `'${blank}'`
    const rowCell = i < rowCount ? `"$${rows[i].rowVar}"` : `''`
    if (plan.position === 'left') {
      lines.push(`printf '%s\\n' ${petCell}${gapStr.length ? `'${gapStr}'` : ''}${rowCell}`)
    } else {
      // right: pad rowCell to maxw, then gap, then pet cell.
      lines.push(`_pet_rc=$(pad_to ${rowCell} "$_pet_maxw")`)
      lines.push(`printf '%s\\n' "$_pet_rc"${gapStr.length ? `'${gapStr}'` : ''}${petCell}`)
    }
  }
  return lines
}

/** visible_len + pad_to (right-side composition only). */
function emitVisibleLen(): string[] {
  return [
    '# strip ANSI (SGR + OSC8) and measure visible length; pad to a target.',
    'strip_ansi() {',
    "  local s=\"$1\"",
    "  s=$(printf '%s' \"$s\" | sed -E $'s/\\x1b\\\\[[0-9;]*m//g; s/\\x1b\\\\]8;;[^\\x07\\x1b]*(\\x07|\\x1b\\\\\\\\)//g')",
    "  printf '%s' \"$s\"",
    '}',
    'visible_len() {',
    '  local s; s=$(strip_ansi "$1"); printf \'%s\' "${#s}"',
    '}',
    'pad_to() {',
    '  local s="$1" target="$2" vis; vis=$(visible_len "$s")',
    '  local deficit=$(( target - vis ))',
    '  if [ "$deficit" -gt 0 ]; then printf \'%s%*s\' "$s" "$deficit" \'\'; else printf \'%s\' "$s"; fi',
    '}',
  ]
}
