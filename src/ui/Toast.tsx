// Toast system. A context exposes `toast(message, tone?)`; toasts are announced
// in an aria-live region and auto-dismiss. Visuals come from the .toast classes
// in theme.css.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react'

export type ToastTone = 'ok' | 'warn' | 'crit'

/** An optional inline action (e.g. Undo). Clicking it runs `onClick` and
 *  dismisses the toast. Actionable toasts linger longer so there's time to act. */
export interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
}

interface ToastApi {
  toast(message: string, tone?: ToastTone, action?: ToastAction): void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used within <ToastProvider>')
  return api
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  // Track pending dismiss timers so they can be cleared on unmount (no setState
  // after unmount, no leaked timers).
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, tone: ToastTone = 'ok', action?: ToastAction) => {
      const id = (nextId.current += 1)
      setItems((cur) => [...cur, { id, message, tone, action }])
      const handle = setTimeout(
        () => {
          timers.current.delete(handle)
          setItems((cur) => cur.filter((t) => t.id !== id))
        },
        // Actionable toasts stay up long enough to read and click.
        action ? 6000 : 2600,
      )
      timers.current.add(handle)
    },
    [],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const handle of pending) clearTimeout(handle)
      pending.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone} role="status">
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
