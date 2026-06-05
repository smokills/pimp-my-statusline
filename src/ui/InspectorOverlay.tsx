// InspectorOverlay — the ELEMENT inspector as a centered dialog-like card with
// a backdrop. Opens when a chip is selected; Esc and click-outside close it.
// The card is anchored toward the bottom of the viewport so the sticky preview
// stays visible above it on desktop.
//
// This inspector is strictly per-element: the pet and the global display
// settings live in their own standalone sidebar cards (PetCard / SettingsCard).

import { useEffect, useRef, type JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { ElementInspector } from './ElementInspector'
import { PlacedSegmentPicker } from './PlacedSegmentPicker'
import { IconClose } from './icons'

export function InspectorOverlay(): JSX.Element | null {
  const open = useConfigStore((s) => s.drawerOpen)
  const close = useConfigStore((s) => s.closeDrawer)
  const selectSegment = useConfigStore((s) => s.selectSegment)
  const selectedId = useConfigStore((s) => s.selectedSegmentId)
  const seg = useConfigStore((s) =>
    s.config.rows.flatMap((r) => r.segments).find((x) => x.id === s.selectedSegmentId),
  )
  const ref = useRef<HTMLDivElement>(null)
  // The element that had focus before the dialog opened — restored on close so
  // keyboard users land back on the chip that triggered the inspector.
  const restoreRef = useRef<HTMLElement | null>(null)

  const dismiss = () => {
    close()
    selectSegment(null)
  }

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

  // Focus management: move focus into the dialog on open, restore it on close.
  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null
      // Focus the card itself (tabIndex -1) so Esc/tab start from the dialog.
      ref.current?.focus()
      return () => {
        restoreRef.current?.focus?.()
        restoreRef.current = null
      }
    }
  }, [open])

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

  if (!open) return null

  return (
    <div
      className="overlay-backdrop"
      onPointerDown={(e) => {
        // Click on the backdrop (outside the card) closes.
        if (!ref.current?.contains(e.target as Node)) dismiss()
      }}
    >
      <div
        ref={ref}
        className="inspector-card"
        role="dialog"
        aria-label="Element inspector"
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="inspector-head">
          <span className="section-head">Element</span>
          <button type="button" className="icon-btn" aria-label="close inspector" title="close (Esc)" onClick={dismiss}>
            <IconClose />
          </button>
        </div>

        <div className="inspector-body">
          {seg ? <ElementInspector seg={seg} /> : <PlacedSegmentPicker />}
        </div>
      </div>
    </div>
  )
}
