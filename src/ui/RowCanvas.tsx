// RowCanvas — the center workbench. One DndContext spans the whole canvas so
// chips can cross rows; each row is a horizontal SortableContext. Rows
// themselves reorder via a ⋮⋮ handle (a separate vertical sortable list of row
// ids). Library items drag in as new segments. Keyboard DnD is wired through
// KeyboardSensor + sortableKeyboardCoordinates, with an aria-live announcer.

import { useCallback, useMemo, useRef, useState, type JSX } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type Announcements,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useConfigStore } from '../store/configStore'
import type { Row, Segment, SegmentType } from '../model/types'
import { SEGMENTS } from '../model/segments'
import { ElementChip } from './ElementChip'
import { isLibraryDragId, libraryDragType } from './ElementLibrary'
import { useToast } from './Toast'

const ROW_PREFIX = 'rowsort:'

function findRowOfSegment(rows: Row[], segId: string): Row | undefined {
  return rows.find((r) => r.segments.some((s) => s.id === segId))
}

// ---------------------------------------------------------------------------
// A sortable row shell (the ⋮⋮ handle drives vertical row reordering).
// ---------------------------------------------------------------------------

function RowShell({
  row,
  index,
  total,
  focused,
  onFocusRow,
}: {
  row: Row
  index: number
  total: number
  focused: boolean
  onFocusRow: (id: string) => void
}): JSX.Element {
  const addSegment = useConfigStore((s) => s.addSegment)
  const removeSegment = useConfigStore((s) => s.removeSegment)
  const removeRow = useConfigStore((s) => s.removeRow)
  const selectedSegmentId = useConfigStore((s) => s.selectedSegmentId)
  const selectSegment = useConfigStore((s) => s.selectSegment)
  const { toast } = useToast()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    setActivatorNodeRef,
  } = useSortable({ id: ROW_PREFIX + row.id, data: { rowReorderId: row.id } })

  const onAddHere = () => {
    addSegment('staticText', row.id)
    toast('added → static text')
  }

  return (
    <div
      ref={setNodeRef}
      className="row-shell panel-pad stack-2"
      data-over={focused}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      onClick={() => onFocusRow(row.id)}
    >
      <div className="spread">
        <div className="row-flex" style={{ gap: 8 }}>
          <button
            type="button"
            className="row-handle"
            ref={setActivatorNodeRef}
            aria-label={`reorder row ${index + 1} of ${total}`}
            title="drag to reorder this row"
            {...listeners}
            {...attributes}
          >
            ⋮⋮
          </button>
          <span className="label">row {index + 1}</span>
        </div>
        <div className="row-flex" style={{ gap: 4 }}>
          <button
            type="button"
            className="btn-icon"
            aria-label={`add element to row ${index + 1}`}
            title="add element"
            onClick={(e) => {
              e.stopPropagation()
              onAddHere()
            }}
          >
            +
          </button>
          <button
            type="button"
            className="btn-icon"
            data-variant="danger"
            aria-label={`delete row ${index + 1}`}
            title="delete row"
            onClick={(e) => {
              e.stopPropagation()
              removeRow(row.id)
              toast(`removed → row ${index + 1}`, 'warn')
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <SortableContext
        items={row.segments.map((s) => s.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="row-flex" style={{ minHeight: 40, alignItems: 'center' }} data-row-id={row.id}>
          {row.segments.length === 0 ? (
            <div className="empty-well" style={{ flex: 1 }}>
              // drop an element here, or hit [ + ]
            </div>
          ) : (
            row.segments.map((seg: Segment) => (
              <ElementChip
                key={seg.id}
                seg={seg}
                selected={selectedSegmentId === seg.id}
                onSelect={() => {
                  onFocusRow(row.id)
                  selectSegment(seg.id)
                }}
                onRemove={() => {
                  removeSegment(seg.id)
                  toast(`removed → ${SEGMENTS[seg.type].label.toLowerCase()}`, 'warn')
                }}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export function RowCanvas({
  focusedRowId,
  onFocusRow,
}: {
  focusedRowId: string | null
  onFocusRow: (id: string) => void
}): JSX.Element {
  const config = useConfigStore((s) => s.config)
  const addRow = useConfigStore((s) => s.addRow)
  const moveSegment = useConfigStore((s) => s.moveSegment)
  const reorderRows = useConfigStore((s) => s.reorderRows)
  const addSegment = useConfigStore((s) => s.addSegment)
  const selectSegment = useConfigStore((s) => s.selectSegment)
  const { toast } = useToast()

  const [activeSeg, setActiveSeg] = useState<Segment | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const draggingRowRef = useRef<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const rows = config.rows

  // Resolve where to drop a segment given the drag-over target id.
  const resolveTarget = useCallback(
    (overId: string): { rowId: string; index: number } | null => {
      // Over another segment?
      const overRow = findRowOfSegment(rows, overId)
      if (overRow) {
        const idx = overRow.segments.findIndex((s) => s.id === overId)
        return { rowId: overRow.id, index: idx }
      }
      // Over a row container (we tag the row's flex with data-row-id; dnd-kit
      // reports the row sortable id when hovering empty space — strip prefix).
      if (overId.startsWith(ROW_PREFIX)) {
        const rowId = overId.slice(ROW_PREFIX.length)
        const r = rows.find((x) => x.id === rowId)
        if (r) return { rowId, index: r.segments.length }
      }
      // Over a row id directly (empty row droppable registered as the row id).
      const r = rows.find((x) => x.id === overId)
      if (r) return { rowId: r.id, index: r.segments.length }
      return null
    },
    [rows],
  )

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    if (id.startsWith(ROW_PREFIX)) {
      draggingRowRef.current = id.slice(ROW_PREFIX.length)
      return
    }
    if (isLibraryDragId(id)) {
      setActiveSeg(null)
      return
    }
    const seg = rows.flatMap((r) => r.segments).find((s) => s.id === id) ?? null
    setActiveSeg(seg)
  }

  const onDragOver = (_e: DragOverEvent) => {
    // Live reordering across rows is handled on drop to keep the store simple
    // and deterministic; the overlay provides the visual feedback.
  }

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    setActiveSeg(null)

    // Row reorder.
    if (activeId.startsWith(ROW_PREFIX)) {
      draggingRowRef.current = null
      if (!overId || !overId.startsWith(ROW_PREFIX)) return
      const from = rows.findIndex((r) => ROW_PREFIX + r.id === activeId)
      const to = rows.findIndex((r) => ROW_PREFIX + r.id === overId)
      if (from !== -1 && to !== -1 && from !== to) {
        reorderRows(from, to)
        setAnnouncement(`row moved to position ${to + 1} of ${rows.length}`)
      }
      return
    }

    if (!overId) return

    // Library → new segment.
    if (isLibraryDragId(activeId)) {
      const type = libraryDragType(activeId) as SegmentType
      const target = resolveTarget(overId)
      const rowId = target?.rowId ?? focusedRowId ?? rows[0]?.id
      const id = addSegment(type, rowId)
      // If we know an exact index, move it there.
      if (target && rowId) moveSegment(id, rowId, target.index)
      selectSegment(id)
      toast(`added → ${SEGMENTS[type].label.toLowerCase()}`)
      return
    }

    // Existing segment move (within / between rows).
    const target = resolveTarget(overId)
    if (!target) return
    moveSegment(activeId, target.rowId, target.index)
  }

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart({ active }) {
        const id = String(active.id)
        const seg = rows.flatMap((r) => r.segments).find((s) => s.id === id)
        if (seg) {
          const row = findRowOfSegment(rows, id)
          const rowIdx = row ? rows.indexOf(row) + 1 : 0
          const pos = row ? row.segments.findIndex((s) => s.id === id) + 1 : 0
          return `${SEGMENTS[seg.type].label} grabbed, position ${pos} of ${row?.segments.length ?? 0}, row ${rowIdx}`
        }
        if (id.startsWith(ROW_PREFIX)) return `row grabbed`
        return `item grabbed`
      },
      onDragOver({ over }) {
        if (!over) return 'no drop target'
        const t = resolveTarget(String(over.id))
        if (t) {
          const rowIdx = rows.findIndex((r) => r.id === t.rowId) + 1
          return `over row ${rowIdx}, position ${t.index + 1}`
        }
        return ''
      },
      onDragEnd({ over }) {
        return over ? 'dropped' : 'drag cancelled'
      },
      onDragCancel() {
        return 'drag cancelled'
      },
    }),
    [rows, resolveTarget],
  )

  const empty = rows.length === 0 || rows.every((r) => r.segments.length === 0)

  return (
    <section className="hud-panel panel-pad stack" aria-label="Row canvas" id="canvas">
      <div className="spread">
        <h2 className="section-head">Rows — drag to arrange</h2>
        {empty && <span className="term-comment">// no elements. the library is to your left.</span>}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={rows.map((r) => ROW_PREFIX + r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="stack">
            {rows.map((row, i) => (
              <RowShell
                key={row.id}
                row={row}
                index={i}
                total={rows.length}
                focused={focusedRowId === row.id}
                onFocusRow={onFocusRow}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeSeg ? (
            <div className="chip" data-dragging="true">
              <span className="swatch" style={{ background: 'var(--phosphor-dim)' }} />
              <span>{SEGMENTS[activeSeg.type].label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <button
        type="button"
        className="btn-bracket"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          const id = addRow()
          onFocusRow(id)
        }}
      >
        + ADD ROW
      </button>

      <div className="sr-only" aria-live="assertive">
        {announcement}
      </div>
    </section>
  )
}
