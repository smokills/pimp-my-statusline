// MockDataPanel — the mock-session scrubber under the preview. Preset dropdown,
// metric sliders (ctx/5h/7d), reset-offset inputs, a clock control (dow + time),
// presence checkboxes for optional objects, dropdowns, git-branch input, a
// COLUMNS slider, and RANDOMIZE / RESET. Each change re-renders the preview.

import type { JSX } from 'react'
import { IconRefresh } from './icons'
import { useMockStore, decomposeNow } from '../store/mockStore'
import { MOCK_PRESETS, type MockPresetName } from '../model/presets/mockPresets'
import type { EffortLevel, VimMode, PrReviewState } from '../model/mock'
import { truncPct } from '../model/evaluate-helpers'

const PRESETS = Object.keys(MOCK_PRESETS) as MockPresetName[]
const EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
const VIM_MODES: VimMode[] = ['NORMAL', 'INSERT', 'VISUAL', 'VISUAL LINE']
const PR_STATES: PrReviewState[] = ['approved', 'pending', 'changes_requested', 'draft']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  suffix = '%',
  disabled = false,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  suffix?: string
  disabled?: boolean
}): JSX.Element {
  return (
    <label className="field">
      <span className="spread">
        <span className="label">{label}</span>
        <span className="mono" style={{ color: disabled ? 'var(--fg-faint)' : 'var(--accent)' }}>
          {value}
          {suffix}
        </span>
      </span>
      <input
        className="range-input"
        type="range"
        min={min}
        max={max}
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
  const presetName = useMockStore((s) => s.presetName)
  const s = useMockStore()

  const clock = decomposeNow(mock._now)
  const ctxPct = truncPct(mock.context_window?.used_percentage)
  const sesPct = truncPct(mock.rate_limits?.five_hour?.used_percentage)
  const weekPct = truncPct(mock.rate_limits?.seven_day?.used_percentage)

  return (
    <section className="card card-pad stack" aria-label="Mock session data">
      <div className="spread">
        <h2 className="section-head">Mock Session</h2>
        <span className="comment">{presetName}</span>
      </div>

      <label className="field">
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

      <Slider label="ctx" value={ctxPct} onChange={s.setContextPct} disabled={!mock.context_window} />
      <Slider label="5h session" value={sesPct} onChange={s.setSessionPct} disabled={!mock.rate_limits?.five_hour} />
      <Slider label="7d week" value={weekPct} onChange={s.setWeekPct} disabled={!mock.rate_limits?.seven_day} />

      <hr className="divider" />
      <span className="label">clock (drives peak)</span>
      <div className="row-flex">
        <select
          className="select-input"
          aria-label="day of week"
          value={clock.dow}
          onChange={(e) => s.setClock({ dow: Number(e.target.value) })}
        >
          {DOW.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="select-input"
          aria-label="hour"
          value={clock.hour}
          onChange={(e) => s.setClock({ hour: Number(e.target.value) })}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      </div>

      <hr className="divider" />
      <span className="label">present objects</span>
      <div className="row-flex" style={{ gap: 12 }}>
        <Toggle label="context" checked={!!mock.context_window} onChange={s.toggleContext} />
        <Toggle label="rate_limits" checked={!!mock.rate_limits} onChange={s.toggleRateLimits} />
        <Toggle label="cost" checked={!!mock.cost} onChange={s.toggleCost} />
        <Toggle label="effort" checked={!!mock.effort} onChange={s.toggleEffort} />
        <Toggle label="vim" checked={!!mock.vim} onChange={s.toggleVim} />
        <Toggle label="pr" checked={!!mock.pr} onChange={s.togglePr} />
        <Toggle label="session_name" checked={!!mock.session_name} onChange={s.toggleSessionName} />
        <Toggle label="thinking" checked={!!mock.thinking} onChange={s.toggleThinking} />
        <Toggle label="worktree" checked={!!mock.worktree} onChange={s.toggleWorktree} />
      </div>

      <hr className="divider" />
      <div className="row-flex" style={{ gap: 12 }}>
        <label className="field">
          <span className="label">model</span>
          <input
            className="text-input"
            style={{ width: 130 }}
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
        {mock.vim && (
          <label className="field">
            <span className="label">vim</span>
            <select
              className="select-input"
              value={mock.vim.mode}
              onChange={(e) => s.setVimMode(e.target.value as VimMode)}
            >
              {VIM_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        )}
        {mock.pr && (
          <label className="field">
            <span className="label">pr state</span>
            <select
              className="select-input"
              value={mock.pr.review_state ?? 'pending'}
              onChange={(e) => s.setPrState(e.target.value as PrReviewState)}
            >
              {PR_STATES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
      </div>

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

      <Slider
        label="columns"
        value={mock._columns}
        onChange={s.setColumns}
        min={20}
        max={200}
        suffix=""
      />

      <div className="row-flex">
        <button type="button" className="btn btn-sm" onClick={s.randomize}>
          Randomize
        </button>
        <button type="button" className="btn btn-sm" onClick={s.reset}>
          <IconRefresh />
          Reset
        </button>
      </div>
    </section>
  )
}
