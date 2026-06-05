// AnsiPreview — renders a config + mock as the terminal preview lines (the
// content that goes INSIDE a TerminalMockup). Mirrors TerminalPreview but uses
// the themed `.terminal-preview` class and handles the empty-config case. Also
// provides a visually-hidden aria-live mirror for screen readers.

import { useMemo, type JSX } from 'react'
import type { StatuslineConfig } from '../model/types'
import type { MockData } from '../model/mock'
import { renderToAnsi } from '../preview/renderToAnsi'
import { AnsiLine } from '../preview/ansiToHtml'
import { stripAnsi } from '../pets/runtime'

export function AnsiPreview({
  config,
  mock,
  emptyMessage = 'Your statusline is empty. Add an element to get started.',
  ariaLabel = 'Live statusline preview',
}: {
  config: StatuslineConfig
  mock: MockData
  emptyMessage?: string
  ariaLabel?: string
}): JSX.Element {
  const lines = useMemo(() => renderToAnsi(config, mock), [config, mock])
  const empty = config.rows.every((r) => r.segments.length === 0)
  const mirror = useMemo(() => lines.map((l) => stripAnsi(l)).join('\n'), [lines])

  return (
    <>
      <pre className="terminal-preview">
        {empty ? (
          <span className="terminal-empty">{emptyMessage}</span>
        ) : (
          lines.map((line, i) => (
            <div key={i}>
              <AnsiLine line={line} />
            </div>
          ))
        )}
      </pre>
      <div className="sr-only" aria-live="polite" aria-label={ariaLabel}>
        {mirror}
      </div>
    </>
  )
}
