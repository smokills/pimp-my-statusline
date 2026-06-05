// SettingsCard — STANDALONE global display options (default thresholds for
// new metric elements), hosted in the builder sidebar
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
