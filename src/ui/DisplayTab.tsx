// DisplayTab — global display options: master emoji toggle, the default
// threshold editor (applied to NEW metric segments), and an FX toggle mirror.

import type { JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import type { ThresholdStop } from '../model/types'
import { Color256Picker } from './Color256Picker'

export function DisplayTab({
  fx,
  onToggleFx,
}: {
  fx: boolean
  onToggleFx: () => void
}): JSX.Element {
  const global = useConfigStore((s) => s.config.global)
  const updateGlobal = useConfigStore((s) => s.updateGlobal)

  // The default thresholds are a stops array; reuse the threshold picker by
  // wrapping it in a synthetic threshold color.
  const setStops = (stops: ThresholdStop[]) => updateGlobal({ defaultThresholds: stops })

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <span className="mono" style={{ color: 'var(--phosphor)' }}>&gt; display options</span>

      <label className="check">
        <input
          type="checkbox"
          checked={global.emoji}
          onChange={(e) => updateGlobal({ emoji: e.target.checked })}
        />
        <span className="box" />
        <span>emoji (master switch — ANDs with each element's emoji)</span>
      </label>

      <hr className="divider" />
      <span className="label">default thresholds (applied to new metric elements)</span>
      <div className="well panel-pad">
        <Color256Picker
          style={{ color: { kind: 'threshold', stops: global.defaultThresholds } }}
          allowThreshold={false}
          onChange={(s) => {
            if (s.color?.kind === 'threshold') setStops(s.color.stops)
          }}
        />
      </div>
      <span className="term-comment">// these seed the threshold coloring of any element you add next</span>

      <hr className="divider" />
      <label className="check">
        <input type="checkbox" checked={fx} onChange={onToggleFx} />
        <span className="box" />
        <span>CRT FX — scanline overlay</span>
      </label>
    </div>
  )
}
