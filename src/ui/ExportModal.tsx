// ExportModal — full-screen export. Language tabs (BASH +jq · PYTHON 3 · NODE.JS)
// → generate() output, shiki-highlighted via a lazy chunk. COPY + DOWNLOAD per
// language, an install-instructions rail (IBM Plex Sans prose) with the
// settings.json snippet, a jq dependency note, and a footer explaining the
// embedded re-import marker.

import { useEffect, useMemo, useState, type JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { generate, scriptFileName, LANGUAGES, type Lang } from '../generators'
import { useToast } from './Toast'
import { IconClose, IconCopy, IconDownload } from './icons'
import { highlightCode, highlightJson } from './lib/highlight'
import { settingsSnippet, installSteps, dependencyNote } from './lib/install'

const LANG_LABEL: Record<Lang, string> = {
  bash: 'BASH (+jq)',
  python: 'PYTHON 3',
  node: 'NODE.JS',
}

function useHighlighted(code: string, lang: Lang, isJson = false): string | null {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setHtml(null)
    const run = isJson ? highlightJson(code) : highlightCode(code, lang)
    run.then((h) => alive && setHtml(h)).catch(() => alive && setHtml(null))
    return () => {
      alive = false
    }
  }, [code, lang, isJson])
  return html
}

function CodeView({ code, lang, isJson = false }: { code: string; lang: Lang; isJson?: boolean }): JSX.Element {
  const html = useHighlighted(code, lang, isJson)
  if (html) {
    return (
      <div
        className="shiki-host"
        style={{ overflow: 'auto', maxHeight: '100%', fontSize: 'var(--fs-13)' }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
  // Fallback (also shown briefly while the chunk loads).
  return (
    <pre
      className="well"
      style={{ margin: 0, padding: 12, overflow: 'auto', maxHeight: '100%', fontSize: 'var(--fs-13)' }}
    >
      {code}
    </pre>
  )
}

export function ExportModal({ onClose }: { onClose: () => void }): JSX.Element {
  const config = useConfigStore((s) => s.config)
  const setLanguage = useConfigStore((s) => s.setLanguage)
  const { toast } = useToast()
  const [lang, setLang] = useState<Lang>(config.language)

  const script = useMemo(() => generate({ ...config, language: lang }, lang), [config, lang])
  const snippet = useMemo(() => settingsSnippet(config, lang), [config, lang])
  const steps = installSteps(lang)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(label)
    } catch {
      toast('clipboard unavailable', 'warn')
    }
  }

  const download = () => {
    const blob = new Blob([script], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = scriptFileName(lang)
    a.click()
    URL.revokeObjectURL(url)
    toast(`downloaded ${scriptFileName(lang)}`)
    // Persist the chosen language back to the config.
    setLanguage(lang)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-label="Export"
        aria-modal="true"
        style={{ width: 'min(1100px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread">
          <h2 className="section-head">Export — choose your shell</h2>
          <button type="button" className="icon-btn" aria-label="close export" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="segmented" role="tablist" aria-label="export language">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lang === l}
              onClick={() => setLang(l)}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>

        <span className="comment" style={{ color: lang === 'bash' ? 'var(--warn)' : undefined }}>
          {dependencyNote(lang)}
        </span>

        <div className="export-grid">
          {/* Code */}
          <div className="stack" style={{ minHeight: 0 }}>
            <div className="well" style={{ minHeight: 0, maxHeight: '52vh', overflow: 'hidden' }}>
              <CodeView code={script} lang={lang} />
            </div>
            <div className="row-flex">
              <button type="button" className="btn btn-primary" onClick={() => copy(script, 'copied to clipboard')}>
                <IconCopy />
                Copy
              </button>
              <button type="button" className="btn" onClick={download}>
                <IconDownload />
                Download
              </button>
            </div>
          </div>

          {/* Install rail */}
          <div className="stack scroll-y" style={{ maxHeight: '60vh' }}>
            <span className="label">install</span>
            <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--fs-14)', lineHeight: 1.6 }}>
              {steps.map((step, i) => (
                <li key={i}>
                  {step.text}
                  {step.cmd && (
                    <pre className="well mono" style={{ margin: '6px 0 0', padding: '6px 8px', fontSize: 'var(--fs-12)' }}>
                      {step.cmd}
                    </pre>
                  )}
                </li>
              ))}
            </ol>

            <span className="label">~/.claude/settings.json</span>
            <div className="well" style={{ maxHeight: 220, overflow: 'auto' }}>
              <CodeView code={snippet} lang={lang} isJson />
            </div>
            <button type="button" className="btn" onClick={() => copy(snippet, 'copied settings.json to clipboard')}>
              <IconCopy />
              Copy settings.json
            </button>
          </div>
        </div>

        <hr className="divider" />
        <span className="comment">
          Line 2 of the script carries a <strong>pimp-my-statusline:v1:</strong> marker — paste the script
          back via Import to resume editing this exact config.
        </span>
      </div>
    </div>
  )
}
