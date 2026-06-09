// StartModal — the "choose a starting point" modal shown over the (blurred)
// builder on the first visit, and reopenable later from the builder bar. It
// offers: start from scratch, the prefab builds (each a live mini terminal
// thumbnail against the current mock), or importing an existing script.
//
// Selection is a radiogroup; the build matching the current canvas (or Classic)
// is preselected. "Start building" applies the choice; Esc / backdrop / close
// dismiss WITHOUT touching the current config, so reopening it never destroys
// work by accident.

import { useEffect, useMemo, useState, type JSX } from 'react'
import { BUILDS, emptyConfig } from '../model/presets/builds'
import type { StatuslineConfig } from '../model/types'
import { renderToAnsi } from '../preview/renderToAnsi'
import { AnsiLine } from '../preview/ansiToHtml'
import { useConfigStore } from '../store/configStore'
import { useMockStore } from '../store/mockStore'
import { IconClose, IconUpload, IconArrowRight } from './icons'
import { trackEvent } from './lib/analytics'

interface StartOption {
  id: string
  name: string
  blurb: string
  make: () => StatuslineConfig
}

const SCRATCH: StartOption = {
  id: 'scratch',
  name: 'Start from scratch',
  blurb: 'An empty canvas. Add the elements you want, your way.',
  make: emptyConfig,
}

export function StartModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: () => void
}): JSX.Element {
  const config = useConfigStore((s) => s.config)
  const replaceConfig = useConfigStore((s) => s.replaceConfig)
  const mock = useMockStore((s) => s.mock)

  const options: StartOption[] = useMemo(() => [SCRATCH, ...BUILDS], [])

  // Preselect the build that matches the current canvas (language aside), else
  // Classic — so a fresh first visit lands on Classic, and reopening highlights
  // whatever you are currently on.
  const configJson = useMemo(() => JSON.stringify(config), [config])
  const activeId = useMemo(() => {
    // Match against ALL options (scratch included) so reopening on an empty
    // canvas highlights "Start from scratch", not Classic.
    const match = [SCRATCH, ...BUILDS].find(
      (o) => JSON.stringify({ ...o.make(), language: config.language }) === configJson,
    )
    return match?.id ?? 'classic'
  }, [configJson, config.language])
  const [sel, setSel] = useState(activeId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const start = () => {
    const opt = options.find((o) => o.id === sel) ?? options[0]
    // Which starting point people actually commit to (scratch included).
    trackEvent(`preset-${opt.id}`, `Preset (${opt.name})`)
    replaceConfig({ ...opt.make(), language: config.language })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card start-modal"
        role="dialog"
        aria-label="Choose a starting point"
        aria-modal="true"
        style={{ width: 'min(900px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread">
          <h2 className="section-head">Choose a starting point</h2>
          <button type="button" className="icon-btn" aria-label="close" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <span className="comment">
          Pick a prefab to tweak, begin from an empty canvas, or import a script you already have.
        </span>

        <div className="build-cards" role="radiogroup" aria-label="starting point">
          {options.map((o) => {
            const lines =
              o.id === 'scratch'
                ? null
                : renderToAnsi({ ...o.make(), language: config.language }, mock)
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={sel === o.id}
                className="build-card"
                onClick={() => setSel(o.id)}
              >
                {lines ? (
                  <pre className="build-mini" aria-hidden="true">
                    {lines.map((line, i) => (
                      <div key={i}>
                        <AnsiLine line={line} />
                      </div>
                    ))}
                  </pre>
                ) : (
                  <pre className="build-mini build-mini-empty" aria-hidden="true">
                    empty canvas
                  </pre>
                )}
                <span className="build-name">{o.name}</span>
                <span className="build-blurb">{o.blurb}</span>
              </button>
            )
          })}
        </div>

        <div className="row-flex">
          <button type="button" className="btn btn-primary" onClick={start}>
            Start building
            <IconArrowRight />
          </button>
          <button type="button" className="btn" onClick={onImport}>
            <IconUpload />
            Import a script
          </button>
        </div>
      </div>
    </div>
  )
}
