// SettingsCard — STANDALONE global display options (master emoji toggle +
// default thresholds for new metric elements), hosted in the builder sidebar
// next to the PetCard. These are config-wide settings, deliberately OUTSIDE
// the per-element inspector. Collapsed by default to keep the sidebar lean.

import { useState, type JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import type { ThresholdStop } from '../model/types'
import { Color256Picker } from './Color256Picker'

export function SettingsCard(): JSX.Element {
  const global = useConfigStore((s) => s.config.global)
  const updateGlobal = useConfigStore((s) => s.updateGlobal)
  const [open, setOpen] = useState(false)

  const setStops = (stops: ThresholdStop[]) => updateGlobal({ defaultThresholds: stops })

  return (
    <section className="side-card" aria-label="Global settings">
      <button
        type="button"
        className="spread side-card-head side-card-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="section-head">Settings</span>
        <span className="label">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="stack">
          <label className="check">
            <input
              type="checkbox"
              checked={global.emoji}
              onChange={(e) => updateGlobal({ emoji: e.target.checked })}
            />
            <span className="box" />
            <span>emoji (master switch)</span>
          </label>
          <span className="comment">ANDs with each element's own emoji setting</span>

          <hr className="divider" />
          <span className="label">default thresholds (for new metric elements)</span>
          <div className="well card-pad">
            <Color256Picker
              style={{ color: { kind: 'threshold', stops: global.defaultThresholds } }}
              allowThreshold={false}
              onChange={(s) => {
                if (s.color?.kind === 'threshold') setStops(s.color.stops)
              }}
            />
          </div>
        </div>
      )}
    </section>
  )
}
