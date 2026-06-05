// Terminal-style toast system. A context exposes `toast(message, tone?)`; toasts
// are announced in an aria-live region and auto-dismiss. Visuals come from the
// .toast classes in phosphor.css.

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react'

export type ToastTone = 'ok' | 'warn' | 'crit'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastApi {
  toast(message: string, tone?: ToastTone): void
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

  const toast = useCallback((message: string, tone: ToastTone = 'ok') => {
    const id = (nextId.current += 1)
    setItems((cur) => [...cur, { id, message, tone }])
    setTimeout(() => {
      setItems((cur) => cur.filter((t) => t.id !== id))
    }, 2600)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone} role="status">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
