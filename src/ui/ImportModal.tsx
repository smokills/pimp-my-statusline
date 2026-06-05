// ImportModal — paste or drop a previously exported script. Uses analyzeImport
// (pure) to extract + validate the embedded config and detect hand edits. On
// success: replaceConfig + toast; if hand-edited, a warning precedes the apply.

import { useEffect, useState, type JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { analyzeImport } from './lib/importFlow'
import { useToast } from './Toast'

export function ImportModal({ onClose }: { onClose: () => void }): JSX.Element {
  const replaceConfig = useConfigStore((s) => s.replaceConfig)
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = (raw: string) => {
    const res = analyzeImport(raw)
    if (!res.ok) {
      setError(res.error)
      setWarning(null)
      return
    }
    if (res.handEdited && !warning) {
      // First press surfaces the warning; second press applies.
      setWarning('this script has hand edits — they will be lost; the embedded config wins. Import again to confirm.')
      setError(null)
      return
    }
    replaceConfig(res.config)
    toast(`config restored — ${res.rows} rows, ${res.elements} elements`)
    onClose()
  }

  const onFile = async (file: File) => {
    const content = await file.text()
    setText(content)
    apply(content)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="hud-panel panel-pad stack"
        role="dialog"
        aria-label="Import"
        aria-modal="true"
        style={{ width: 'min(680px, 100%)', alignSelf: 'center', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread">
          <h2 className="section-head">&gt; Import — paste an exported script</h2>
          <button type="button" className="btn-icon" aria-label="close import" onClick={onClose}>
            ✕
          </button>
        </div>

        <textarea
          className="textarea-input"
          rows={12}
          value={text}
          placeholder="paste a previously exported statusline script (.sh / .py / .js), or drop a file…"
          aria-label="script to import"
          data-over={dragOver}
          style={dragOver ? { borderColor: 'var(--phosphor)', boxShadow: 'var(--glow-soft)' } : undefined}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
            setWarning(null)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) void onFile(file)
          }}
        />

        {error && (
          <span className="mono" style={{ color: 'var(--crit)' }}>
            {error}
          </span>
        )}
        {warning && (
          <span className="mono" style={{ color: 'var(--warn)' }}>
            ⚠ {warning}
          </span>
        )}

        <div className="row-flex">
          <button type="button" className="btn-bracket" data-variant="primary" disabled={!text.trim()} onClick={() => apply(text)}>
            {warning ? 'IMPORT ANYWAY' : 'IMPORT'}
          </button>
        </div>
      </div>
    </div>
  )
}
