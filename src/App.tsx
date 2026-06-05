// App — the routed shell. '/' renders the marketing Landing page; '#/build'
// renders the full-screen Builder. Routing is the tiny hash-based useHashRoute
// (no router lib). The Builder hosts the sticky TerminalMockup preview, the
// prefab BuildStrip (with the sample-data expander), the editor zone (rows
// canvas + element library), the inspector overlay, the export/import modals,
// the skip link and the toast provider.

import { useEffect, useState, type JSX } from 'react'
import { ToastProvider, useToast } from './ui/Toast'
import { useHashRoute } from './ui/useHashRoute'
import { useOsPref } from './ui/useOsPref'
import { BuilderBar } from './ui/BuilderBar'
import { TerminalMockup } from './ui/TerminalMockup'
import { AnsiPreview } from './ui/AnsiPreview'
import { BuildStrip } from './ui/BuildStrip'
import { ElementLibrary } from './ui/ElementLibrary'
import { PetCard } from './ui/PetCard'
import { SettingsCard } from './ui/SettingsCard'
import { RowCanvas } from './ui/RowCanvas'
import { InspectorOverlay } from './ui/InspectorOverlay'
import { ExportModal } from './ui/ExportModal'
import { ImportModal } from './ui/ImportModal'
import { Landing } from './ui/landing/Landing'
import { useConfigStore, onRehydrateWarning } from './store/configStore'
import { useMockStore } from './store/mockStore'

type MobileTab = 'build' | 'style'

function Builder(): JSX.Element {
  const { toast } = useToast()
  const { os, setOs } = useOsPref()
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('build')

  const config = useConfigStore((s) => s.config)
  const mock = useMockStore((s) => s.mock)
  const firstRowId = useConfigStore((s) => s.config.rows[0]?.id ?? null)
  const openDrawer = useConfigStore((s) => s.openDrawer)

  // Surface the persist rehydrate-fallback as a toast.
  useEffect(() => {
    onRehydrateWarning((msg) => toast(msg, 'warn'))
    return () => onRehydrateWarning(() => {})
  }, [toast])

  const effectiveFocusRow = focusedRowId ?? firstRowId

  // Mobile STYLE tab → open the element inspector (picker when no selection).
  useEffect(() => {
    if (mobileTab === 'style') openDrawer()
  }, [mobileTab, openDrawer])

  return (
    <div className="builder">
      <a className="skip-link" href="#canvas">
        Skip to canvas
      </a>

      <BuilderBar onImport={() => setShowImport(true)} onExport={() => setShowExport(true)} />

      {/* Sticky preview zone: OS switcher + a wide, roomy mockup. */}
      <div className="builder-hero">
        <div className="builder-hero-inner">
          <TerminalMockup os={os} onOsChange={setOs} showSwitcher title="~ — statusline">
            <AnsiPreview config={config} mock={mock} />
          </TerminalMockup>
        </div>
      </div>

      {/* Prefab builds (one-click starting configs) + sample-data expander.
          Deliberately OUTSIDE the sticky hero so it scrolls away while editing. */}
      <div className="build-zone">
        <BuildStrip />
      </div>

      {/* Mobile segmented tabs (hidden on desktop). */}
      <nav className="mobile-tabs" aria-label="sections">
        {(['build', 'style'] as MobileTab[]).map((t) => (
          <div key={t} className="segmented seg" style={{ flex: 1 }}>
            <button
              type="button"
              style={{ width: '100%' }}
              aria-pressed={mobileTab === t}
              onClick={() => setMobileTab(t)}
            >
              {t === 'build' ? 'Build' : 'Style'}
            </button>
          </div>
        ))}
      </nav>

      <main className="editor">
        <div className={`editor-canvas ${mobileTab === 'build' ? '' : 'mobile-hide'}`}>
          <RowCanvas focusedRowId={effectiveFocusRow} onFocusRow={setFocusedRowId} />
        </div>
        <div className={`editor-library ${mobileTab === 'build' ? '' : 'mobile-hide'}`}>
          {/* The pet and the global settings are standalone, config-wide cards
              — deliberately OUTSIDE the per-element inspector. */}
          <PetCard />
          <SettingsCard />
          <ElementLibrary focusedRowId={effectiveFocusRow} />
        </div>
      </main>

      <InspectorOverlay />

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

function Router(): JSX.Element {
  const route = useHashRoute()
  // Scroll to top when entering the builder so the sticky preview is in view.
  useEffect(() => {
    if (route === 'build') window.scrollTo(0, 0)
  }, [route])
  return route === 'build' ? <Builder /> : <Landing />
}

export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <Router />
    </ToastProvider>
  )
}
