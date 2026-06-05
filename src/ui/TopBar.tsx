// TopBar — wordmark, config language indicator, IMPORT/EXPORT, and the FX switch.

import type { JSX } from 'react'
import { useConfigStore } from '../store/configStore'

function Wordmark(): JSX.Element {
  return (
    <div className="wordmark" style={{ fontSize: 'var(--fs-20)', display: 'flex', alignItems: 'center' }}>
      <span aria-hidden="true" style={{ color: 'var(--phosphor-dim)', marginRight: 8 }}>
        ▌
      </span>
      <span>PIMP </span>
      <span style={{ color: 'var(--phosphor)', textShadow: 'var(--glow-text)' }}>MY</span>
      <span> STATUSLINE</span>
      <span className="cursor" aria-hidden="true" />
    </div>
  )
}

export function TopBar({
  fx,
  onToggleFx,
  onImport,
  onExport,
}: {
  fx: boolean
  onToggleFx: () => void
  onImport: () => void
  onExport: () => void
}): JSX.Element {
  const language = useConfigStore((s) => s.config.language)

  return (
    <header className="topbar">
      <Wordmark />
      <span className="label mobile-only-hide" aria-hidden="true">
        ~/statusline
      </span>
      <div style={{ flex: 1 }} />
      <span
        className="label mobile-only-hide"
        title="The language of the config you are editing"
        style={{ color: 'var(--phosphor-dim)' }}
      >
        lang: {language}
      </span>
      <button
        type="button"
        className="btn-bracket"
        aria-pressed={fx}
        onClick={onToggleFx}
        title="Toggle the CRT scanline overlay"
      >
        FX {fx ? 'ON' : 'OFF'}
      </button>
      <button type="button" className="btn-bracket" onClick={onImport}>
        IMPORT
      </button>
      <button type="button" className="btn-bracket" data-variant="primary" onClick={onExport}>
        EXPORT
      </button>
    </header>
  )
}
