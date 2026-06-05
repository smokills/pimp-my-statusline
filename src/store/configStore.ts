// configStore — the editable StatuslineConfig plus selection state. Persisted
// to localStorage (key pms:config:v1) via zustand `persist`, debounced ~250ms,
// partialized to the config only. On rehydrate the stored value is run through
// parseConfig (zod): invalid → fall back to defaultConfig() and surface a toast.
//
// The mutation actions are written as pure transforms over the config so they
// can be unit-tested in the node env without a DOM (see __tests__).

import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import type {
  Segment,
  SegmentType,
  StatuslineConfig,
  PetConfig,
  GlobalOptions,
} from '../model/types'
import { SEGMENTS } from '../model/segments'
import { parseConfig } from '../model/schema'
import { defaultConfig } from '../model/presets/defaultPreset'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrawerTab = 'element' | 'pet' | 'display'

export interface ConfigState {
  config: StatuslineConfig
  selectedSegmentId: string | null
  drawerTab: DrawerTab
  drawerOpen: boolean

  // selection
  selectSegment(id: string | null): void
  setDrawerTab(tab: DrawerTab): void
  openDrawer(tab?: DrawerTab): void
  closeDrawer(): void

  // segment mutation
  addSegment(type: SegmentType, rowId?: string): string
  removeSegment(id: string): void
  updateSegment(id: string, patch: Partial<Segment>): void
  moveSegment(id: string, toRowId: string, toIndex: number): void

  // rows
  addRow(): string
  removeRow(rowId: string): void
  reorderRows(fromIndex: number, toIndex: number): void

  // global / pet / language
  updatePet(patch: Partial<PetConfig>): void
  updateGlobal(patch: Partial<GlobalOptions>): void
  setLanguage(language: StatuslineConfig['language']): void
  replaceConfig(config: StatuslineConfig): void
}

// ---------------------------------------------------------------------------
// id generation — stable, collision-resistant within a session
// ---------------------------------------------------------------------------

let idCounter = 0
function uid(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

// ---------------------------------------------------------------------------
// Pure config transforms (exported for unit tests)
// ---------------------------------------------------------------------------

/** Build a fresh segment of `type` with a unique id, applying defaultThresholds
 *  from the global options to brand-new metric segments. */
export function makeSegment(type: SegmentType, global: GlobalOptions): Segment {
  const base = SEGMENTS[type].defaults()
  const seg = { ...base, id: uid(type) } as Segment
  if (
    (seg.type === 'context' || seg.type === 'session' || seg.type === 'week') &&
    global.defaultThresholds.length > 0
  ) {
    seg.valueStyle = {
      ...seg.valueStyle,
      color: { kind: 'threshold', stops: global.defaultThresholds.map((s) => ({ ...s })) },
    }
  }
  return seg
}

export function addSegmentTo(
  config: StatuslineConfig,
  seg: Segment,
  rowId: string | undefined,
): StatuslineConfig {
  const targetId = rowId ?? config.rows[0]?.id
  if (targetId === undefined) {
    // No rows at all — create one to hold the segment.
    return {
      ...config,
      rows: [{ id: uid('row'), segments: [seg], joiner: '  ' }],
    }
  }
  return {
    ...config,
    rows: config.rows.map((r) =>
      r.id === targetId ? { ...r, segments: [...r.segments, seg] } : r,
    ),
  }
}

export function removeSegmentFrom(config: StatuslineConfig, id: string): StatuslineConfig {
  return {
    ...config,
    rows: config.rows.map((r) => ({
      ...r,
      segments: r.segments.filter((s) => s.id !== id),
    })),
  }
}

export function updateSegmentIn(
  config: StatuslineConfig,
  id: string,
  patch: Partial<Segment>,
): StatuslineConfig {
  return {
    ...config,
    rows: config.rows.map((r) => ({
      ...r,
      segments: r.segments.map((s) =>
        s.id === id ? ({ ...s, ...patch } as Segment) : s,
      ),
    })),
  }
}

/** Move a segment to `toRowId` at `toIndex`. Handles within-row and cross-row.
 *  `toIndex` is interpreted against the destination row AFTER the segment has
 *  been removed from its source (the standard array-move semantics dnd-kit uses).
 *  Out-of-range indices are clamped. */
export function moveSegmentIn(
  config: StatuslineConfig,
  id: string,
  toRowId: string,
  toIndex: number,
): StatuslineConfig {
  let moving: Segment | undefined
  // First pass: pull the segment out of whichever row holds it.
  const stripped = config.rows.map((r) => {
    const idx = r.segments.findIndex((s) => s.id === id)
    if (idx === -1) return r
    moving = r.segments[idx]
    return { ...r, segments: r.segments.filter((s) => s.id !== id) }
  })
  if (moving === undefined) return config
  const seg = moving
  return {
    ...config,
    rows: stripped.map((r) => {
      if (r.id !== toRowId) return r
      const clamped = Math.max(0, Math.min(toIndex, r.segments.length))
      const next = r.segments.slice()
      next.splice(clamped, 0, seg)
      return { ...r, segments: next }
    }),
  }
}

export function addRowTo(config: StatuslineConfig): { config: StatuslineConfig; rowId: string } {
  const rowId = uid('row')
  return {
    config: { ...config, rows: [...config.rows, { id: rowId, segments: [], joiner: '  ' }] },
    rowId,
  }
}

export function removeRowFrom(config: StatuslineConfig, rowId: string): StatuslineConfig {
  return { ...config, rows: config.rows.filter((r) => r.id !== rowId) }
}

export function reorderRowsIn(
  config: StatuslineConfig,
  fromIndex: number,
  toIndex: number,
): StatuslineConfig {
  if (
    fromIndex < 0 ||
    fromIndex >= config.rows.length ||
    toIndex < 0 ||
    toIndex >= config.rows.length ||
    fromIndex === toIndex
  ) {
    return config
  }
  const next = config.rows.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return { ...config, rows: next }
}

// ---------------------------------------------------------------------------
// Persisted storage — debounced writes, parseConfig gate on read
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'pms:config:v1'

/** Surfaced when a stored config fails the schema gate on rehydrate. The UI
 *  registers a listener to turn this into a toast.
 *
 *  Ordering hazard: zustand's persist with SYNCHRONOUS storage calls getItem at
 *  module-import time — BEFORE App mounts and registers a listener. So we BUFFER
 *  any warning emitted while no listener is registered, and flush it the moment
 *  one registers. Without this the corrupt-config reset toast would be lost. */
type RehydrateListener = (msg: string) => void
let rehydrateListener: RehydrateListener | null = null
let bufferedWarning: string | null = null

function emitRehydrateWarning(msg: string): void {
  if (rehydrateListener) rehydrateListener(msg)
  else bufferedWarning = msg
}

export function onRehydrateWarning(fn: RehydrateListener): void {
  rehydrateListener = fn
  if (bufferedWarning !== null) {
    const msg = bufferedWarning
    bufferedWarning = null
    fn(msg)
  }
}

/** Test-only: clear the listener + buffer so each test starts unregistered
 *  (mirrors a fresh module load). Not used by app code. */
export function __resetRehydrateForTest(): void {
  rehydrateListener = null
  bufferedWarning = null
}

interface PersistedShape {
  config: StatuslineConfig
}

/** A debounced localStorage wrapper. Reads are synchronous; writes are coalesced
 *  on a ~250ms timer so a burst of edits produces one write. The persisted JSON
 *  is `{ state: { config }, version }` (zustand's envelope). On read, the inner
 *  config is validated with parseConfig; an invalid config is dropped (returns
 *  null) so the store falls back to its initializer default. */
export function createDebouncedStorage(delay = 250): PersistStorage<PersistedShape> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: string | null = null
  // Read localStorage lazily off globalThis so a test can install a shim and so
  // SSR/node (no localStorage) degrades to a no-op store.
  const ls = (): Storage | null => {
    const g = globalThis as unknown as { localStorage?: Storage }
    return g.localStorage ?? null
  }

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pending !== null && ls()) {
      try {
        ls()!.setItem(STORAGE_KEY, pending)
      } catch {
        /* quota / private mode — ignore */
      }
      pending = null
    }
  }

  // Flush the debounced write on any teardown signal. beforeunload alone is
  // unreliable on mobile (iOS Safari / Android backgrounding), so we also flush
  // on pagehide and when the tab is hidden — covering the cases where the last
  // edit would otherwise be dropped.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return {
    getItem: (name): StorageValue<PersistedShape> | null => {
      const store = ls()
      if (!store) return null
      const raw = store.getItem(name)
      if (raw === null) return null
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return null
      }
      const env = parsed as { state?: { config?: unknown }; version?: number }
      const cfg = parseConfig(env?.state?.config)
      if (cfg === null) {
        // Invalid persisted config — drop it so the store keeps its default,
        // and surface a warning the UI can toast (buffered until a listener
        // registers, since getItem runs before App mounts).
        emitRehydrateWarning('saved config was incompatible — reset to default')
        return null
      }
      return { state: { config: cfg }, version: env.version }
    },
    setItem: (_name, value) => {
      pending = JSON.stringify(value)
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    removeItem: (name) => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
      ls()?.removeItem(name)
    },
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      config: defaultConfig(),
      selectedSegmentId: null,
      drawerTab: 'element',
      drawerOpen: false,

      selectSegment: (id) =>
        set(() =>
          id === null
            ? { selectedSegmentId: null, drawerOpen: false }
            : { selectedSegmentId: id, drawerOpen: true, drawerTab: 'element' },
        ),
      setDrawerTab: (drawerTab) => set({ drawerTab }),
      openDrawer: (tab) =>
        set((s) => ({ drawerOpen: true, drawerTab: tab ?? s.drawerTab })),
      closeDrawer: () => set({ drawerOpen: false }),

      addSegment: (type, rowId) => {
        const seg = makeSegment(type, get().config.global)
        set((s) => ({ config: addSegmentTo(s.config, seg, rowId) }))
        return seg.id
      },
      removeSegment: (id) =>
        set((s) => ({
          config: removeSegmentFrom(s.config, id),
          selectedSegmentId: s.selectedSegmentId === id ? null : s.selectedSegmentId,
          drawerOpen: s.selectedSegmentId === id ? false : s.drawerOpen,
        })),
      updateSegment: (id, patch) =>
        set((s) => ({ config: updateSegmentIn(s.config, id, patch) })),
      moveSegment: (id, toRowId, toIndex) =>
        set((s) => ({ config: moveSegmentIn(s.config, id, toRowId, toIndex) })),

      addRow: () => {
        const { config, rowId } = addRowTo(get().config)
        set({ config })
        return rowId
      },
      removeRow: (rowId) => set((s) => ({ config: removeRowFrom(s.config, rowId) })),
      reorderRows: (fromIndex, toIndex) =>
        set((s) => ({ config: reorderRowsIn(s.config, fromIndex, toIndex) })),

      updatePet: (patch) =>
        set((s) => ({ config: { ...s.config, pet: { ...s.config.pet, ...patch } } })),
      updateGlobal: (patch) =>
        set((s) => ({ config: { ...s.config, global: { ...s.config.global, ...patch } } })),
      setLanguage: (language) =>
        set((s) => ({ config: { ...s.config, language } })),
      replaceConfig: (config) =>
        set({ config, selectedSegmentId: null, drawerOpen: false }),
    }),
    {
      name: STORAGE_KEY,
      storage: createDebouncedStorage(),
      partialize: (s) => ({ config: s.config }),
    },
  ),
)
