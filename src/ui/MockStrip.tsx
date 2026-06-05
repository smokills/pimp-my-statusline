// MockStrip — the compact horizontal mock-session control under the builder
// preview. Preset select + the three metric sliders (ctx / 5h / 7d) inline, plus
// a "More controls" expander that reveals the full MockDataPanel below.

import { useState, type JSX } from 'react'
import { useMockStore } from '../store/mockStore'
import { MOCK_PRESETS, type MockPresetName } from '../model/presets/mockPresets'
import { truncPct } from '../model/evaluate-helpers'
import { MockDataPanel } from './MockDataPanel'

const PRESETS = Object.keys(MOCK_PRESETS) as MockPresetName[]

function MiniSlider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <label className="ms-slider">
      <span className="spread" style={{ marginBottom: 2 }}>
        <span className="label">{label}</span>
        <span className="mono" style={{ color: disabled ? 'var(--fg-faint)' : 'var(--accent)' }}>
          {value}%
        </span>
      </span>
      <input
        className="range-input"
        type="range"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </label>
  )
}

export function MockStrip(): JSX.Element {
  const mock = useMockStore((s) => s.mock)
  const presetName = useMockStore((s) => s.presetName)
  const s = useMockStore()
  const [expanded, setExpanded] = useState(false)

  const ctxPct = truncPct(mock.context_window?.used_percentage)
  const sesPct = truncPct(mock.rate_limits?.five_hour?.used_percentage)
  const weekPct = truncPct(mock.rate_limits?.seven_day?.used_percentage)

  return (
    <div>
      <div className="mock-strip" aria-label="Mock session">
        <label className="ms-field">
          <span className="label">preset</span>
          <select
            className="select-input"
            value={PRESETS.includes(presetName as MockPresetName) ? presetName : ''}
            onChange={(e) => s.applyPreset(e.target.value as MockPresetName)}
          >
            {!PRESETS.includes(presetName as MockPresetName) && <option value="">custom</option>}
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <MiniSlider label="ctx" value={ctxPct} onChange={s.setContextPct} disabled={!mock.context_window} />
        <MiniSlider
          label="5h"
          value={sesPct}
          onChange={s.setSessionPct}
          disabled={!mock.rate_limits?.five_hour}
        />
        <MiniSlider
          label="7d"
          value={weekPct}
          onChange={s.setWeekPct}
          disabled={!mock.rate_limits?.seven_day}
        />

        <button
          type="button"
          className="btn btn-sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Fewer controls' : 'More controls'}
        </button>
      </div>

      {expanded && (
        <div className="mock-expand-body">
          <MockDataPanel />
        </div>
      )}
    </div>
  )
}
