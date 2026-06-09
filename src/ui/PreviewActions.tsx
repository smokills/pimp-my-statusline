// PreviewActions — the Builds / Import / Export cluster, docked to the right of
// the canvas "Add row" button on desktop. Export is the primary action; Builds
// and Import sit beside it as utilities. On mobile these same actions live in
// the BuilderBar (where the pinned hero leaves no room), so this cluster is
// desktop-only.

import type { JSX } from 'react'
import { IconUpload, IconDownload, IconLayout } from './icons'

export function PreviewActions({
  onBuilds,
  onImport,
  onExport,
}: {
  onBuilds: () => void
  onImport: () => void
  onExport: () => void
}): JSX.Element {
  return (
    <div className="preview-actions mobile-hide">
      <button
        type="button"
        className="btn"
        onClick={onBuilds}
        title="Choose a starting point (prefab builds, scratch, import)"
      >
        <IconLayout />
        Builds
      </button>
      <button type="button" className="btn" onClick={onImport}>
        <IconUpload />
        Import
      </button>
      <button type="button" className="btn btn-primary" onClick={onExport}>
        <IconDownload />
        Export
      </button>
    </div>
  )
}
