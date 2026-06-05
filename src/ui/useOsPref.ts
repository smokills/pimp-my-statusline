// useOsPref — the shared OS-chrome preference for the TerminalMockup. Persisted
// to localStorage (key `pms:os`, default 'macos') and shared between the landing
// demo and the builder preview so switching in one place sticks everywhere.
//
// Instances stay in sync within a tab via a tiny pub/sub: setOs notifies every
// mounted hook (the native `storage` event only fires across tabs, not within).

import { useCallback, useEffect, useState } from 'react'

export type OsKind = 'macos' | 'windows' | 'linux'

export const OS_KINDS: readonly OsKind[] = ['macos', 'windows', 'linux']
export const OS_LABEL: Record<OsKind, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

const OS_KEY = 'pms:os'
const DEFAULT_OS: OsKind = 'macos'

function isOsKind(v: unknown): v is OsKind {
  return v === 'macos' || v === 'windows' || v === 'linux'
}

/** Read the stored OS preference, falling back to the default. */
export function loadOsPref(): OsKind {
  try {
    const stored = localStorage.getItem(OS_KEY)
    if (isOsKind(stored)) return stored
  } catch {
    /* ignore */
  }
  return DEFAULT_OS
}

// In-tab subscribers, so two mounted mockups (landing + builder) stay in sync.
const listeners = new Set<(os: OsKind) => void>()

export function useOsPref(): { os: OsKind; setOs: (os: OsKind) => void } {
  const [os, setOsState] = useState<OsKind>(loadOsPref)

  const setOs = useCallback((next: OsKind) => {
    try {
      localStorage.setItem(OS_KEY, next)
    } catch {
      /* ignore */
    }
    listeners.forEach((fn) => fn(next))
  }, [])

  useEffect(() => {
    listeners.add(setOsState)
    return () => {
      listeners.delete(setOsState)
    }
  }, [])

  return { os, setOs }
}
