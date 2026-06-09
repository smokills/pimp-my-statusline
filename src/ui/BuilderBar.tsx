// BuilderBar — the slim top bar for the builder route. Wordmark links back to
// the landing page; the right side carries BUILDS / IMPORT / EXPORT.

import type { JSX } from 'react'
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

      {/* On desktop these move to the PreviewActions toolbar under the preview;
          here they stay for mobile, where the pinned hero has no room for them. */}
      <div className="bar-actions mobile-only">
        <button
          type="button"
          className="btn btn-sm"
          onClick={onBuilds}
          aria-label="Builds"
          title="Choose a starting point (prefab builds, scratch, import)"
        >
          <IconLayout />
        </button>
        <button type="button" className="btn btn-sm" onClick={onImport} aria-label="Import">
          <IconUpload />
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onExport} aria-label="Export">
          <IconDownload />
        </button>
      </div>
    </header>
  )
}
