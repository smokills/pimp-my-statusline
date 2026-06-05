// InspectorDrawer — bottom slide-up drawer with tabs ELEMENT · PET · DISPLAY.
// Opens when a chip is selected; Esc and click-away close it. The ELEMENT tab is
// only meaningful with a selection; PET and DISPLAY are always reachable.

import { useEffect, useRef, type JSX } from 'react'
import { useConfigStore, type DrawerTab } from '../store/configStore'
import { ElementInspector } from './ElementInspector'
import { PetTab } from './PetTab'
import { DisplayTab } from './DisplayTab'
import { PlacedSegmentPicker } from './PlacedSegmentPicker'

const TABS: { value: DrawerTab; label: string }[] = [
  { value: 'element', label: 'ELEMENT' },
  { value: 'pet', label: 'PET' },
  { value: 'display', label: 'DISPLAY' },
]

export function InspectorDrawer({
  fx,
  onToggleFx,
}: {
  fx: boolean
  onToggleFx: () => void
}): JSX.Element | null {
  const open = useConfigStore((s) => s.drawerOpen)
  const tab = useConfigStore((s) => s.drawerTab)
  const setTab = useConfigStore((s) => s.setDrawerTab)
  const close = useConfigStore((s) => s.closeDrawer)
  const selectSegment = useConfigStore((s) => s.selectSegment)
  const selectedId = useConfigStore((s) => s.selectedSegmentId)
  const seg = useConfigStore((s) =>
    s.config.rows.flatMap((r) => r.segments).find((x) => x.id === s.selectedSegmentId),
  )
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        selectSegment(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close, selectSegment])

  // Delete/Backspace removes the selected segment (when focus is not in a field).
  const removeSegment = useConfigStore((s) => s.removeSegment)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const el = document.activeElement
      const tag = el?.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (selectedId) {
        e.preventDefault()
        removeSegment(selectedId)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedId, removeSegment])

  // Click-away: close when a pointerdown lands outside the drawer AND outside the
  // canvas (clicking a chip on the canvas re-selects rather than closes). This
  // keeps the rest of the workbench fully interactive while the drawer is open —
  // a full-viewport catcher would block the mock scrubber and library.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (ref.current?.contains(target)) return
      const canvas = document.getElementById('canvas')
      if (canvas?.contains(target)) return
      close()
      selectSegment(null)
    }
    // Defer so the opening click doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('pointerdown', onDown), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, close, selectSegment])

  if (!open) return null

  return (
    <div
      ref={ref}
      className="drawer panel-pad"
      role="dialog"
      aria-label="Element inspector"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 200,
        maxHeight: '46vh',
        overflowY: 'auto',
      }}
    >
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="segmented" role="tablist" aria-label="inspector tabs">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-icon"
            aria-label="close inspector"
            title="close (Esc)"
            onClick={() => {
              close()
              selectSegment(null)
            }}
          >
            ✕
          </button>
        </div>

        {tab === 'element' && (seg ? <ElementInspector seg={seg} /> : <PlacedSegmentPicker />)}
        {tab === 'pet' && <PetTab />}
        {tab === 'display' && <DisplayTab fx={fx} onToggleFx={onToggleFx} />}
    </div>
  )
}
