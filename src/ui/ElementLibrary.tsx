// ElementLibrary — left rail. Categories from the SEGMENTS registry (one entry
// per type), a search filter, and click-to-add to the focused row with
// placed-count badges. Single-instance types are disabled once placed;
// separator/staticText stay re-addable.
//
// Items are click-to-add, NOT drag sources: the only DndContext lives inside
// RowCanvas, and the library renders in the sidebar outside it, so a draggable
// here could never reach the canvas. The cursor stays a pointer to say so.

import { useMemo, useState, type JSX } from 'react'
import { IconCheck } from './icons'
import { useConfigStore } from '../store/configStore'
import {
  CATEGORY_ORDER,
  libraryEntries,
  placedCounts,
  isReAddable,
  type Category,
  type LibraryEntry,
} from './lib/library'
import { useToast } from './Toast'

function LibraryItem({
  entry,
  placed,
  onAdd,
}: {
  entry: LibraryEntry
  placed: number
  onAdd: (e: LibraryEntry) => void
}): JSX.Element {
  const disabled = placed > 0 && !isReAddable(entry.type)

  return (
    <div
      className="chip"
      data-disabled={disabled}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      title={disabled ? 'already in layout' : `${entry.description} — click to add`}
      style={{ justifyContent: 'space-between', cursor: disabled ? 'not-allowed' : 'pointer' }}
      onClick={() => !disabled && onAdd(entry)}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAdd(entry)
        }
      }}
    >
      <span className="row-flex" style={{ gap: 6 }}>
        {entry.metric && <span className="glyphs" aria-hidden="true">▓</span>}
        <span>{entry.label}</span>
      </span>
      {placed > 0 && (
        <span className="placed-tag" aria-label={`${placed} placed`}>
          <IconCheck style={{ width: 13, height: 13 }} />
          {placed > 1 ? `×${placed}` : 'placed'}
        </span>
      )}
    </div>
  )
}

export function ElementLibrary({ focusedRowId }: { focusedRowId: string | null }): JSX.Element {
  const config = useConfigStore((s) => s.config)
  const addSegment = useConfigStore((s) => s.addSegment)
  const selectSegment = useConfigStore((s) => s.selectSegment)
  const { toast } = useToast()
  const [query, setQuery] = useState('')

  const counts = useMemo(() => placedCounts(config), [config])
  const entries = useMemo(() => libraryEntries(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.label.toLowerCase().includes(q) || e.type.toLowerCase().includes(q))
  }, [entries, query])

  const byCategory = useMemo(() => {
    const map = new Map<Category, LibraryEntry[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const e of filtered) map.get(e.category)!.push(e)
    return map
  }, [filtered])

  const onAdd = (e: LibraryEntry) => {
    const id = addSegment(e.type, focusedRowId ?? undefined)
    selectSegment(id)
    toast(`added → ${e.label.toLowerCase()}`)
  }

  return (
    <aside className="card card-pad stack" aria-label="Element library">
      <h2 className="section-head">Element Library</h2>
      <div className="field">
        <input
          className="text-input"
          type="search"
          placeholder="filter elements…"
          aria-label="Filter elements"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="stack scroll-y" style={{ maxHeight: '62vh', paddingRight: 4 }}>
        {CATEGORY_ORDER.map((cat) => {
          const items = byCategory.get(cat)!
          if (items.length === 0) return null
          return (
            <div key={cat} className="stack-2">
              <span className="label" style={{ color: 'var(--accent)' }}>
                {cat}
              </span>
              {items.map((e) => (
                <LibraryItem key={e.type} entry={e} placed={counts[e.type] ?? 0} onAdd={onAdd} />
              ))}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <span className="comment">no elements match "{query}"</span>
        )}
      </div>
    </aside>
  )
}
