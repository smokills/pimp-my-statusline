// Public entry point for the code generators. `generate(config, lang)` returns
// a complete, readable, hand-editable script for the chosen language. The three
// scripts are byte-equivalent in their output (cross-language parity); byte
// parity vs the preview's renderToAnsi is verified separately.

import type { StatuslineConfig } from '../model/types'
import { assemble } from './assemble'
import { bashEmitter } from './bash'
import { pythonEmitter } from './python'
import { nodeEmitter } from './node'
import type { Emitter, Lang } from './types'

export const LANGUAGES = ['bash', 'python', 'node'] as const

const EMITTERS: Record<Lang, Emitter> = {
  bash: bashEmitter,
  python: pythonEmitter,
  node: nodeEmitter,
}

/** Generate the statusline script for `config` in `lang`. */
export function generate(config: StatuslineConfig, lang: Lang): string {
  return assemble(config, EMITTERS[lang])
}

/** The conventional file name for a generated script in `lang`. */
export function scriptFileName(lang: Lang): string {
  return lang === 'bash' ? 'statusline.sh' : lang === 'python' ? 'statusline.py' : 'statusline.js'
}

export type { Lang } from './types'
