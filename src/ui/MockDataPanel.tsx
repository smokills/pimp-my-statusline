// MockDataPanel — the "Preview" tab's panel: the scenario scrubber for the live
// preview, laid out as a compact three-column grid (usage · session · present
// objects). Every change re-renders the preview above; none of it touches the
// config or the exported script.

import type { JSX } from 'react'
import { IconRefresh } from './icons'
import { useMockStore } from '../store/mockStore'
import type { EffortLevel } from '../model/mock'
import { truncPct } from '../model/evaluate-helpers'

const EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** Compact duration for the resets-in scrubbers: 90 → "1h30m", 3000 → "2d2h". */
function fmtMinutes(min: number): string {
  if (min <= 0) return 'now'
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}

function Slider({
  label,
  value,
  display,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
}: {
  label: string
  value: number
  /** Formatted value shown next to the label (defaults to `${value}%`). */
  display?: string
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}): JSX.Element {
  return (
    <label className="field">
      <span className="spread">
        <span className="label">{label}</span>
        <span className="mono" style={{ color: disabled ? 'var(--fg-faint)' : 'var(--accent)' }}>
          {display ?? `${value}%`}
        </span>
      </span>
      <input
        className="range-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (b: boolean) => void
}): JSX.Element {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="box" />
      <span>{label}</span>
    </label>
  )
}

export function MockDataPanel(): JSX.Element {
  const mock = useMockStore((s) => s.mock)
  const s = useMockStore()

  const ctxPct = truncPct(mock.context_window?.used_percentage)
  const sesPct = truncPct(mock.rate_limits?.five_hour?.used_percentage)
  const weekPct = truncPct(mock.rate_limits?.seven_day?.used_percentage)
  // Countdown scrubbers: minutes from the (frozen) sim clock until each reset.
  const sesResetMin = mock.rate_limits?.five_hour
    ? Math.max(0, Math.round((mock.rate_limits.five_hour.resets_at - mock._now) / 60))
    : 0
  const weekResetMin = mock.rate_limits?.seven_day
    ? Math.max(0, Math.round((mock.rate_limits.seven_day.resets_at - mock._now) / 60))
    : 0

  return (
    <details className="preview-tools stack disclosure">
      <summary style={{ cursor: 'pointer' }}>Adjust preview data</summary>

      <div className="spread">
        <span className="comment" style={{ maxWidth: '52ch' }}>
          fake session data driving the live preview above: scrub it and watch your
          statusline react. It never changes your config or the exported script.
        </span>
        <div className="row-flex">
          <button type="button" className="btn btn-sm" onClick={s.randomize}>
            Randomize
          </button>
          <button type="button" className="btn btn-sm" onClick={s.reset}>
            <IconRefresh />
            Reset
          </button>
        </div>
      </div>

      <div className="mock-grid">
        {/* --- usage: the metric percentages + their reset countdowns --- */}
        <div className="stack-2">
          <span className="label">usage</span>
          <Slider label="context" value={ctxPct} onChange={s.setContextPct} disabled={!mock.context_window} />
          <Slider
            label="5h session"
            value={sesPct}
            onChange={s.setSessionPct}
            disabled={!mock.rate_limits?.five_hour}
          />
          <Slider
            label="5h resets in"
            value={sesResetMin}
            display={fmtMinutes(sesResetMin)}
            onChange={s.setSessionResetMinutes}
            min={0}
            max={300}
            step={5}
            disabled={!mock.rate_limits?.five_hour}
          />
          <Slider
            label="7d week"
            value={weekPct}
            onChange={s.setWeekPct}
            disabled={!mock.rate_limits?.seven_day}
          />
          <Slider
            label="7d resets in"
            value={weekResetMin}
            display={fmtMinutes(weekResetMin)}
            onChange={s.setWeekResetMinutes}
            min={0}
            max={10080}
            step={60}
            disabled={!mock.rate_limits?.seven_day}
          />
        </div>

        {/* --- session facts: model, effort, branch --- */}
        <div className="stack-2">
          <span className="label">session</span>
          <label className="field">
            <span className="label">model</span>
            <input
              className="text-input"
              value={mock.model.display_name}
              onChange={(e) => s.setModelName(e.target.value)}
              aria-label="model name"
            />
          </label>
          {mock.effort && (
            <label className="field">
              <span className="label">effort</span>
              <select
                className="select-input"
                value={mock.effort.level}
                onChange={(e) => s.setEffortLevel(e.target.value as EffortLevel)}
              >
                {EFFORTS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="label">git branch</span>
            <input
              className="text-input"
              value={mock._gitBranch ?? ''}
              placeholder="(no branch)"
              onChange={(e) => s.setGitBranch(e.target.value)}
              aria-label="git branch"
            />
          </label>
        </div>

        {/* --- presence: which optional stdin objects exist at all --- */}
        <div className="stack-2">
          <span className="label">present objects</span>
          <div className="mock-checks">
            <Toggle label="context" checked={!!mock.context_window} onChange={s.toggleContext} />
            <Toggle label="rate_limits" checked={!!mock.rate_limits} onChange={s.toggleRateLimits} />
            <Toggle label="cost" checked={!!mock.cost} onChange={s.toggleCost} />
            <Toggle label="effort" checked={!!mock.effort} onChange={s.toggleEffort} />
            <Toggle
              label="output_style"
              checked={!!mock.output_style}
              onChange={s.toggleOutputStyle}
            />
          </div>
        </div>
      </div>
    </details>
  )
}
