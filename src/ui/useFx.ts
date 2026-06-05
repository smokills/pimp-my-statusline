// FX (scanline overlay) preference + reduced-motion detection. FX defaults ON
// for desktop, OFF for mobile, and is forced off under prefers-reduced-motion.
// Persisted to localStorage so a user's choice sticks.

import { useCallback, useEffect, useState } from 'react'

const FX_KEY = 'pms:fx:v1'

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function isMobile(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches
}

function initialFx(): boolean {
  if (prefersReducedMotion()) return false
  try {
    const stored = localStorage.getItem(FX_KEY)
    if (stored !== null) return stored === '1'
  } catch {
    /* ignore */
  }
  return !isMobile()
}

export function useFx(): { fx: boolean; toggleFx: () => void; setFx: (on: boolean) => void } {
  const [fx, setFxState] = useState<boolean>(initialFx)

  const setFx = useCallback((on: boolean) => {
    setFxState(on)
    try {
      localStorage.setItem(FX_KEY, on ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleFx = useCallback(() => setFx(!fx), [fx, setFx])

  // Respect a live change to the reduced-motion preference.
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => {
      if (mq.matches) setFxState(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return { fx, toggleFx, setFx }
}
