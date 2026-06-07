// BuilderBar — the slim top bar for the builder route. Wordmark links back to
// the landing page; the right side carries IMPORT / EXPORT and a language
// indicator.

import type { JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { IconTerminal, IconUpload, IconDownload, IconLayout } from './icons'

export function BuilderBar({
  onBuilds,
  onImport,
  onExport,
}: {
  onBuilds: () => void
  onImport: () => void
  onExport: () => void
}): JSX.Element {
  const language = useConfigStore((s) => s.config.language)

  return (
    <header className="builder-bar">
      <a href="#/" className="wordmark" aria-label="Back to home">
        <span className="mark" aria-hidden="true">
          <IconTerminal />
        </span>
        <span className="mobile-hide">
          Pimp My <span className="accent">Statusline</span>
        </span>
      </a>
      {/* Same beta patch as the landing nav, outside the home link. */}
      <span className="beta-badge" title="still in beta: expect rough edges">
        beta
      </span>

      <div style={{ flex: 1 }} />

      <span className="label mobile-hide" title="The language of the config you are editing">
        lang: <span className="accent">{language}</span>
      </span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={onBuilds}
        title="Choose a starting point (prefab builds, scratch, import)"
      >
        <IconLayout />
        <span className="mobile-hide">Builds</span>
      </button>
      <button type="button" className="btn btn-sm" onClick={onImport}>
        <IconUpload />
        <span className="mobile-hide">Import</span>
      </button>
      <button type="button" className="btn btn-primary btn-sm" onClick={onExport}>
        <IconDownload />
        <span className="mobile-hide">Export</span>
      </button>
    </header>
  )
}
