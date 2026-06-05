// PreviewBezel — the CRT frame + power LED wrapping the EXISTING TerminalPreview
// (fed by the config + mock stores). PreviewAriaMirror provides a visually-hidden
// aria-live plain-text mirror of the rendered output for screen readers.

import { useMemo, type JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { useMockStore } from '../store/mockStore'
import { TerminalPreview } from '../preview/TerminalPreview'
import { renderToAnsi } from '../preview/renderToAnsi'
import { stripAnsi } from '../pets/runtime'

function PreviewAriaMirror(): JSX.Element {
  const config = useConfigStore((s) => s.config)
  const mock = useMockStore((s) => s.mock)
  const text = useMemo(
    () =>
      renderToAnsi(config, mock)
        .map((l) => stripAnsi(l))
        .join('\n'),
    [config, mock],
  )
  return (
    <div className="sr-only" aria-live="polite" aria-label="Live statusline preview">
      {text}
    </div>
  )
}

export function PreviewBezel(): JSX.Element {
  const config = useConfigStore((s) => s.config)
  const mock = useMockStore((s) => s.mock)
  const empty = config.rows.every((r) => r.segments.length === 0)

  return (
    <div className="crt-bezel" aria-label="Live preview">
      <div className="crt-screen">
        {empty ? (
          <pre
            className="terminal-preview"
            style={{
              margin: 0,
              padding: '0.75rem 1rem',
              color: 'var(--fg-faint)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
            }}
          >
            (your statusline is currently a void. add something.)
          </pre>
        ) : (
          <TerminalPreview config={config} mock={mock} />
        )}
      </div>
      <span className="crt-led" aria-hidden="true">
        <span className="dot" />
        live
      </span>
      <PreviewAriaMirror />
    </div>
  )
}
