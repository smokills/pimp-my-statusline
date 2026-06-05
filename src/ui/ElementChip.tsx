// ElementChip — a placed segment inside a row. Sortable (dnd-kit), selectable,
// removable. Shows the type label, a tiny swatch of its current color, and
// variant glyphs.

import type { JSX } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Segment } from '../model/types'
import { SEGMENTS } from '../model/segments'
import { IconClose } from './icons'
import { primaryStyle, variantGlyphs } from './lib/library'
import { styleSwatchHex } from './lib/color'

export function ElementChip({
  seg,
  selected,
  onSelect,
  onRemove,
}: {
  seg: Segment
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: seg.id,
    data: { segmentId: seg.id },
  })
  const glyphs = variantGlyphs(seg)
  const swatch = styleSwatchHex(primaryStyle(seg))
  const label = SEGMENTS[seg.type].label

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="chip"
      data-selected={selected}
      data-dragging={isDragging}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : seg.enabled ? 1 : 0.5,
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label}${seg.enabled ? '' : ' (disabled)'} — press space to grab, enter to edit`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <span className="swatch" style={{ background: swatch }} aria-hidden="true" />
      <span>{label}</span>
      {glyphs && (
        <span className="glyphs" aria-hidden="true">
          {glyphs}
        </span>
      )}
      <button
        type="button"
        className="icon-btn"
        data-variant="danger"
        style={{ width: 22, height: 22, marginLeft: 2 }}
        aria-label={`remove ${label}`}
        title={`remove ${label}`}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        // Prevent the drag listeners (on the parent) from hijacking the click.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <IconClose style={{ width: 13, height: 13 }} />
      </button>
    </div>
  )
}
