import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadOsPref } from './useOsPref'

// A minimal in-memory localStorage shim for the node test env.
function installLocalStorage(): Record<string, string> {
  const store: Record<string, string> = {}
  const shim: Storage = {
    get length() {
      return Object.keys(store).length
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
    getItem: (k: string) => (k in store ? store[k] : null),
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (k: string) => {
      delete store[k]
    },
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
  }
  vi.stubGlobal('localStorage', shim)
  return store
}

describe('loadOsPref', () => {
  beforeEach(() => {
    installLocalStorage()
  })

  it('defaults to macos when nothing is stored', () => {
    expect(loadOsPref()).toBe('macos')
  })

  it('reads a valid stored value', () => {
    localStorage.setItem('pms:os', 'windows')
    expect(loadOsPref()).toBe('windows')
    localStorage.setItem('pms:os', 'linux')
    expect(loadOsPref()).toBe('linux')
  })

  it('falls back to macos for an invalid stored value', () => {
    localStorage.setItem('pms:os', 'beos')
    expect(loadOsPref()).toBe('macos')
  })
})
