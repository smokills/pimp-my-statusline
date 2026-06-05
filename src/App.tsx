// App — the routed shell. '/' renders the marketing Landing page; '#/build'
// renders the full-screen Builder. Routing is the tiny hash-based useHashRoute
// (no router lib). The Builder hosts the sticky TerminalMockup preview, the
// BuildStrip (prefab builds + the config-wide Pet / Settings / Preview
// expanders) and the editor zone (rows canvas + sidebar). The sidebar is
// strictly element-scoped: the library, swapped for the docked, non-modal
// element inspector while a chip is selected, so the preview stays live during
// editing. It also owns the export/import modals, the skip link and the toast
// provider.

import { useEffect, useRef, useState, type JSX } from 'react'
import { ToastProvider, useToast } from './ui/Toast'
import { useHashRoute } from './ui/useHashRoute'
import { useOsPref } from './ui/useOsPref'
import { BuilderBar } from './ui/BuilderBar'
import { TerminalMockup } from './ui/TerminalMockup'
import { AnsiPreview } from './ui/AnsiPreview'
import { BuildStrip } from './ui/BuildStrip'
import { ElementLibrary } from './ui/ElementLibrary'
import { RowCanvas } from './ui/RowCanvas'
import { InspectorPanel } from './ui/InspectorPanel'
import { PlacedSegmentPicker } from './ui/PlacedSegmentPicker'
import { ExportModal } from './ui/ExportModal'
import { ImportModal } from './ui/ImportModal'
import { Landing } from './ui/landing/Landing'
import { useConfigStore, onRehydrateWarning } from './store/configStore'
import { useMockStore } from './store/mockStore'

type MobileTab = 'build' | 'style'

// PickerCard — the placed-element picker wrapped in a sidebar card. Shown only
// on mobile (the canvas is hidden on the Style tab, so this is how an element
// gets selected there); hidden on desktop, where the canvas chips are visible.
function PickerCard(): JSX.Element {
  return (
    <section className="side-card mobile-only" aria-label="Elements">
      <span className="section-head">Elements</span>
      <PlacedSegmentPicker />
    </section>
  )
}

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
  const selectedSegmentId = useConfigStore((s) => s.selectedSegmentId)
  // Derive selection from whether the id resolves to a placed segment so a stale
  // id (e.g. a removed segment) falls back to the element library.
  const selected = useConfigStore(
    (s) =>
      s.selectedSegmentId != null &&
      s.config.rows.some((r) => r.segments.some((x) => x.id === s.selectedSegmentId)),
  )

  // Surface the persist rehydrate-fallback as a toast.
  useEffect(() => {
    onRehydrateWarning((msg) => toast(msg, 'warn'))
    return () => onRehydrateWarning(() => {})
  }, [toast])

  const effectiveFocusRow = focusedRowId ?? firstRowId

  // Selecting an element flips to the mobile STYLE tab so the docked inspector is
  // visible there (harmless on desktop — mobile-hide only exists ≤640px).
  useEffect(() => {
    if (selectedSegmentId != null) setMobileTab('style')
  }, [selectedSegmentId])

  // Keep --mobile-hero-h synced to the hero's REAL height so the mobile tabs pin
  // exactly below the pinned preview however tall the config grows (more rows,
  // pet, …). The CSS :root value is only the no-JS/initial-paint fallback.
  const heroRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--mobile-hero-h', `${el.offsetHeight}px`)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--mobile-hero-h')
    }
  }, [])

  return (
    <div className="builder">
      <a className="skip-link" href="#canvas">
        Skip to canvas
      </a>

      <BuilderBar onImport={() => setShowImport(true)} onExport={() => setShowExport(true)} />

      {/* Sticky preview zone: OS switcher + a wide, roomy mockup. */}
      <div className="builder-hero" ref={heroRef}>
        <div className="builder-hero-inner">
          <TerminalMockup os={os} onOsChange={setOs} showSwitcher title="~ — statusline">
            <AnsiPreview config={config} mock={mock} />
          </TerminalMockup>
        </div>
      </div>

      {/* The global zone: prefab builds + the config-wide Pet / Settings /
          Preview-scenario tabs. Deliberately OUTSIDE the sticky hero so it
          scrolls away while editing. */}
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
        <div className={`editor-library ${mobileTab === 'style' ? '' : 'mobile-hide'}`}>
          {selected ? (
            // Editing an element: the docked, non-modal inspector replaces the
            // library. The preview/canvas stay live while editing. The sidebar
            // is strictly element-scoped — the config-wide controls (pet,
            // settings, preview scenario) live in the build strip under the
            // preview.
            <InspectorPanel />
          ) : (
            <>
              {/* PickerCard is the mobile-only selection path. */}
              <PickerCard />
              <ElementLibrary focusedRowId={effectiveFocusRow} />
            </>
          )}
        </div>
      </main>

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
