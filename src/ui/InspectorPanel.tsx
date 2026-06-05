// InspectorPanel — the ELEMENT inspector as a NON-MODAL panel docked in the
// builder's right sidebar. No backdrop, no dim, no blur, no focus trap: the
// sticky preview and the canvas stay fully visible and live while editing.
// Renders only when a chip is selected; Esc and the X button dismiss it.
//
// This inspector is strictly per-element: the pet and the global display
// settings live in the build strip under the preview (PetCard / SettingsCard).

import { useEffect, useRef, type JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { ElementInspector } from './ElementInspector'
import { IconClose } from './icons'

export function InspectorPanel(): JSX.Element | null {
  const selectSegment = useConfigStore((s) => s.selectSegment)
  const selectedId = useConfigStore((s) => s.selectedSegmentId)
  const seg = useConfigStore((s) =>
    s.config.rows.flatMap((r) => r.segments).find((x) => x.id === s.selectedSegmentId),
  )
  const ref = useRef<HTMLElement>(null)
  // The element that had focus before the panel opened — restored on dismiss so
  // keyboard users land back on the chip that triggered the inspector.
  const restoreRef = useRef<HTMLElement | null>(null)
  // Tracks whether the panel is currently considered "open" so the focus effect
  // only captures/restores on the open<->closed transition, never on a
  // chip-to-chip selection swap (which would yank focus + scroll back, line
  // findings 1 & 3). The effect keys on `open`, which stays true across swaps.
  const open = seg != null

  const dismiss = () => selectSegment(null)

  // Esc dismisses while a segment is selected.
  useEffect(() => {
    if (!seg) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectSegment(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [seg, selectSegment])

  // Focus management, gated to the open<->closed transition (NOT every
  // selectedId change). On open: capture the prior focus, move focus into the
  // panel (without scrolling the page), and bring the panel into view inside the
  // sticky sidebar — once. On close: restore focus to the captured element.
  // Keying on `open` (not `selectedId`) keeps capture/restore from re-running
  // when the user clicks a different chip while the panel is already open, which
  // would otherwise flicker focus and corrupt the restore target.
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    if (typeof ref.current?.scrollIntoView === 'function') {
      ref.current.scrollIntoView({ block: 'nearest' })
    }
    return () => {
      restoreRef.current?.focus?.()
      restoreRef.current = null
    }
  }, [open])

  // Delete/Backspace removes the selected segment — but ONLY when focus is
  // outside this panel. The panel is full of focusable buttons (256 color cells,
  // toggles, the close button) and, on open, focus lands on the panel section
  // itself (a non-input). Without this guard a single Backspace (a natural
  // "go back" reflex) while editing would silently delete the whole element.
  // Deletion is reserved for when a canvas chip / something outside the panel
  // holds focus. Inputs/textareas/selects are always exempt regardless.
  const removeSegment = useConfigStore((s) => s.removeSegment)
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      // Never delete while focus is inside the inspector itself.
      if (el && ref.current?.contains(el)) return
      e.preventDefault()
      removeSegment(selectedId)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedId, removeSegment])

  if (!seg) return null

  return (
    <section
      ref={ref}
      className="inspector-panel"
      role="region"
      aria-label="Element inspector"
      tabIndex={-1}
    >
      <div className="inspector-head">
        <span className="section-head">Element</span>
        <button type="button" className="icon-btn" aria-label="close inspector" title="close (Esc)" onClick={dismiss}>
          <IconClose />
        </button>
      </div>

      <div className="inspector-body">
        <ElementInspector seg={seg} />
      </div>
    </section>
  )
}
