// SettingsCard — GLOBAL display options (default thresholds for new metric
// elements), hosted in the build strip under the preview (behind the
// "Settings" expander) with the other config-wide controls. These are
// config-wide settings, deliberately OUTSIDE the per-element inspector; the
// strip button owns the expand/collapse.

import type { JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import type { ThresholdStop } from '../model/types'
import { Color256Picker } from './Color256Picker'

export function SettingsCard(): JSX.Element {
  const global = useConfigStore((s) => s.config.global)
  const updateGlobal = useConfigStore((s) => s.updateGlobal)

  const setStops = (stops: ThresholdStop[]) => updateGlobal({ defaultThresholds: stops })

  return (
    <section className="card card-pad stack" aria-label="Global settings">
      <h3 className="section-head">Settings</h3>
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
    </section>
  )
}
