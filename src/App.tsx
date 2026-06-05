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

type MobileTab = 'build' | 'style' | 'pet' | 'export'

function Workbench(): JSX.Element {
  const { fx, toggleFx } = useFx()
  const { toast } = useToast()
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('build')

  const firstRowId = useConfigStore((s) => s.config.rows[0]?.id ?? null)
  const openDrawer = useConfigStore((s) => s.openDrawer)
  const setDrawerTab = useConfigStore((s) => s.setDrawerTab)
  const drawerOpen = useConfigStore((s) => s.drawerOpen)

  // Surface the persist rehydrate-fallback as a toast.
  useEffect(() => {
    onRehydrateWarning((msg) => toast(msg, 'warn'))
    return () => onRehydrateWarning(() => {})
  }, [toast])

  const effectiveFocusRow = focusedRowId ?? firstRowId

  // Mobile tab → open the right drawer tab.
  useEffect(() => {
    if (mobileTab === 'style') {
      setDrawerTab('element')
      openDrawer('element')
    } else if (mobileTab === 'pet') {
      setDrawerTab('pet')
      openDrawer('pet')
    }
  }, [mobileTab, openDrawer, setDrawerTab])

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
        {(['build', 'style', 'pet', 'export'] as MobileTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className="btn-bracket"
            style={{ flex: 1, justifyContent: 'center', border: 'none', borderRadius: 0 }}
            aria-pressed={mobileTab === t}
            onClick={() => {
              setMobileTab(t)
              if (t === 'export') setShowExport(true)
            }}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </nav>

      <main className="workbench" data-drawer={drawerOpen}>
        <div className={mobileTab === 'build' ? '' : 'mobile-only-hide'}>
          <ElementLibrary focusedRowId={effectiveFocusRow} />
        </div>

        <div className={mobileTab === 'build' ? '' : 'mobile-only-hide'}>
          <RowCanvas focusedRowId={effectiveFocusRow} onFocusRow={setFocusedRowId} />
        </div>

        <div className="col-preview">
          <PreviewBezel />
          <div className={mobileTab === 'build' ? '' : 'mobile-only-hide'}>
            <MockDataPanel />
          </div>
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
