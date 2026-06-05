// TerminalPreview — presentational terminal pane. Renders the parity-exact ANSI
// output of renderToAnsi as styled HTML, one <div> per line. Minimal inline
// styling only; the PHOSPHOR theme dresses it up in the UI phase.
//
// Overflow is shown via CSS (horizontal scroll), NOT by truncating the rendered
// string — the controller's v1 decision is that neither preview nor scripts
// truncate output.

import { useMemo, type JSX } from 'react'
import type { StatuslineConfig } from '../model/types'
import type { MockData } from '../model/mock'
import { renderToAnsi } from './renderToAnsi'
import { AnsiLine } from './ansiToHtml'

export function TerminalPreview({
  config,
  mock,
}: {
  config: StatuslineConfig
  mock: MockData
}): JSX.Element {
  const lines = useMemo(() => renderToAnsi(config, mock), [config, mock])
  return (
    <pre
      className="terminal-preview"
      style={{
        margin: 0,
        padding: '0.75rem 1rem',
        background: '#090C10',
        color: '#c0c0c0',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: '0.875rem',
        lineHeight: 1.4,
        whiteSpace: 'pre',
        overflowX: 'auto',
      }}
    >
      {lines.map((line, i) => (
        <div key={i}>
          <AnsiLine line={line} />
        </div>
      ))}
    </pre>
  )
}
