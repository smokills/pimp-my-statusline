// Rehydrate-fallback tests for the debounced storage wrapper. We install a tiny
// in-memory localStorage shim on globalThis, then exercise getItem with valid,
// invalid and absent values, asserting the parseConfig gate + warning callback.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createDebouncedStorage,
  onRehydrateWarning,
  STORAGE_KEY,
} from './configStore'
import { defaultConfig } from '../model/presets/defaultPreset'

class MemStorage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
}

const g = globalThis as unknown as { localStorage?: Storage }

beforeEach(() => {
  g.localStorage = new MemStorage() as unknown as Storage
})
afterEach(() => {
  delete g.localStorage
  onRehydrateWarning(() => {})
})

describe('debounced storage — rehydrate gate', () => {
  it('returns null when nothing is stored', () => {
    const s = createDebouncedStorage(0)
    expect(s.getItem(STORAGE_KEY)).toBeNull()
  })

  it('round-trips a valid config through the zod gate', () => {
    const s = createDebouncedStorage(0)
    const envelope = JSON.stringify({ state: { config: defaultConfig() }, version: 0 })
    g.localStorage!.setItem(STORAGE_KEY, envelope)
    const got = s.getItem(STORAGE_KEY)
    expect(got).not.toBeNull()
    // getItem is synchronous in our wrapper; narrow off the Promise union.
    if (got && !(got instanceof Promise)) {
      expect(got.state.config.rows.length).toBe(3)
    }
  })

  it('drops an invalid stored config and fires the warning', () => {
    const warn = vi.fn()
    onRehydrateWarning(warn)
    const s = createDebouncedStorage(0)
    const bad = JSON.stringify({ state: { config: { version: 1, nope: true } }, version: 0 })
    g.localStorage!.setItem(STORAGE_KEY, bad)
    expect(s.getItem(STORAGE_KEY)).toBeNull()
    expect(warn).toHaveBeenCalledWith('saved config was incompatible — reset to default')
  })

  it('drops non-JSON garbage without throwing', () => {
    const s = createDebouncedStorage(0)
    g.localStorage!.setItem(STORAGE_KEY, '{not json')
    expect(s.getItem(STORAGE_KEY)).toBeNull()
  })

  it('debounces writes and flushes after the delay', async () => {
    vi.useFakeTimers()
    try {
      const s = createDebouncedStorage(250)
      s.setItem(STORAGE_KEY, { state: { config: defaultConfig() }, version: 0 })
      // not yet written
      expect(g.localStorage!.getItem(STORAGE_KEY)).toBeNull()
      vi.advanceTimersByTime(260)
      expect(g.localStorage!.getItem(STORAGE_KEY)).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
