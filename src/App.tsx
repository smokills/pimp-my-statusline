// App — the PHOSPHOR workbench shell. Three-zone desktop layout (library /
// canvas / sticky preview+mock); a tabbed single-column layout on mobile. Hosts
// the inspector drawer, export/import modals, the scanline FX overlay, the skip
// link, and the toast provider.

import { useEffect, useState, type JSX } from 'react'
import { ToastProvider, useToast } from './ui/Toast'
import { useFx } from './ui/useFx'
import { TopBar } from './ui/TopBar'
import { ElementLibrary } from './ui/ElementLibrary'
import { RowCanvas } from './ui/RowCanvas'
import { PreviewBezel } from './ui/PreviewBezel'
import { MockDataPanel } from './ui/MockDataPanel'
import { InspectorDrawer } from './ui/InspectorDrawer'
import { ExportModal } from './ui/ExportModal'
import { ImportModal } from './ui/ImportModal'
import { useConfigStore, onRehydrateWarning } from './store/configStore'

type MobileTab = 'build' | 'style' | 'pet' | 'import' | 'export'

function Workbench(): JSX.Element {
  const { fx, toggleFx } = useFx()
  const { toast } = useToast()
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('build')
  // The mock scrubber is an accordion: open on desktop, collapsed on mobile so
  // the editor stays reachable directly under the sticky mini-preview.
  const [mockOpen] = useState<boolean>(
    () => typeof matchMedia === 'undefined' || !matchMedia('(max-width: 760px)').matches,
  )

  const firstRowId = useConfigStore((s) => s.config.rows[0]?.id ?? null)
  const openDrawer = useConfigStore((s) => s.openDrawer)
  const drawerOpen = useConfigStore((s) => s.drawerOpen)

  // Surface the persist rehydrate-fallback as a toast.
  useEffect(() => {
    onRehydrateWarning((msg) => toast(msg, 'warn'))
    return () => onRehydrateWarning(() => {})
  }, [toast])

  const effectiveFocusRow = focusedRowId ?? firstRowId

  // Mobile tab → open the drawer on the right tab (openDrawer sets drawerTab).
  useEffect(() => {
    if (mobileTab === 'style') openDrawer('element')
    else if (mobileTab === 'pet') openDrawer('pet')
  }, [mobileTab, openDrawer])

  return (
    <div className="app">
      {fx && <div className="scanlines" aria-hidden="true" />}
      <a className="skip-link" href="#canvas">
        skip to canvas
      </a>

      <TopBar
        fx={fx}
        onToggleFx={toggleFx}
        onImport={() => setShowImport(true)}
        onExport={() => setShowExport(true)}
      />

      {/* Mobile segmented tabs */}
      <nav className="mobile-tabs" aria-label="sections">
        {(['build', 'style', 'pet', 'import', 'export'] as MobileTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className="btn-bracket mobile-tab"
            aria-pressed={mobileTab === t}
            onClick={() => {
              if (t === 'export') {
                setMobileTab('build')
                setShowExport(true)
                return
              }
              if (t === 'import') {
                setMobileTab('build')
                setShowImport(true)
                return
              }
              setMobileTab(t)
            }}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </nav>

      <main className="workbench" data-drawer={drawerOpen} data-tab={mobileTab}>
        {/* Mini-preview: sticky at top on mobile (order:-1), in the right column
            on desktop. The mock scrubber lives below it as an accordion. */}
        <div className="col-preview">
          <div className="mini-preview">
            <PreviewBezel />
          </div>
          <details className="mock-accordion" open={mockOpen}>
            <summary className="label mock-accordion-summary">mock session</summary>
            <MockDataPanel />
          </details>
        </div>

        <div className={`col-library ${mobileTab === 'build' ? '' : 'mobile-only-hide'}`}>
          <ElementLibrary focusedRowId={effectiveFocusRow} />
        </div>

        <div className={`col-canvas ${mobileTab === 'build' ? '' : 'mobile-only-hide'}`}>
          <RowCanvas focusedRowId={effectiveFocusRow} onFocusRow={setFocusedRowId} />
        </div>
      </main>

      <InspectorDrawer fx={fx} onToggleFx={toggleFx} />

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <Workbench />
    </ToastProvider>
  )
}
