// Lazy shiki highlighter. Everything here is loaded via DYNAMIC import so shiki
// (and its grammars/themes) lands in a separate chunk, NOT the main bundle. We
// use the fine-grained core + the JavaScript regex engine (no wasm blob) and
// only the three grammars we ship, plus the vitesse-dark theme.

import type { HighlighterCore } from 'shiki/core'
import type { Lang } from '../../generators'

type ShikiLang = 'bash' | 'python' | 'javascript' | 'json'

const LANG_MAP: Record<Lang, ShikiLang> = {
  bash: 'bash',
  python: 'python',
  node: 'javascript',
}

let highlighterPromise: Promise<HighlighterCore> | null = null

async function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterPromise) return highlighterPromise
  highlighterPromise = (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, bash, python, javascript, json, vitesse] =
      await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/python.mjs'),
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/themes/vitesse-dark.mjs'),
      ])
    return createHighlighterCore({
      themes: [vitesse.default],
      langs: [bash.default, python.default, javascript.default, json.default],
      engine: createJavaScriptRegexEngine(),
    })
  })()
  return highlighterPromise
}

/** Highlight `code` for `lang` into a shiki HTML string (vitesse-dark theme). */
export async function highlightCode(code: string, lang: Lang): Promise<string> {
  const hl = await getHighlighter()
  return hl.codeToHtml(code, { lang: LANG_MAP[lang], theme: 'vitesse-dark' })
}

/** Highlight a JSON snippet (settings.json). */
export async function highlightJson(code: string): Promise<string> {
  const hl = await getHighlighter()
  return hl.codeToHtml(code, { lang: 'json', theme: 'vitesse-dark' })
}
