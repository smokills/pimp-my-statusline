// MockDataPanel — a "Preview data" trigger that opens a left slide-in drawer with
// the scenario scrubber for the live preview. The drawer pushes the page right
// (it never overlays), so the terminal stays visible while you scrub. Every
// placeable segment that reads mock data has a control here, grouped (usage ·
// session · workspace · cost · pull request); a control is disabled when its
// element isn't in the rows — there's nothing to preview otherwise. None of it
// touches the config or the exported script.

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { IconRefresh, IconSliders, IconClose } from './icons'
import { useMockStore } from '../store/mockStore'
import { useConfigStore } from '../store/configStore'
import type { EffortLevel } from '../model/mock'
import type { SegmentType } from '../model/types'
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

function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}): JSX.Element {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="text-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </label>
  )
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  disabled?: boolean
}): JSX.Element {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="text-input"
        type="number"
        value={value}
        step={step}
        min={min}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (v: string) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <select
        className="select-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}

export function MockDataPanel(): JSX.Element {
  const mock = useMockStore((s) => s.mock)
  const s = useMockStore()
  const [open, setOpen] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  // Which segment types are actually placed in the rows. A control is only worth
  // scrubbing if its element is in the statusline (and thus in the preview).
  const rows = useConfigStore((st) => st.config.rows)
  const placed = useMemo(() => {
    const set = new Set<SegmentType>()
    for (const row of rows) for (const seg of row.segments) set.add(seg.type)
    return set
  }, [rows])
  const has = (t: SegmentType): boolean => placed.has(t)

  // The "resets in" countdown only renders when its metric segment actually
  // shows the timer part — otherwise there's no countdown in the preview to scrub.
  const sessionTimer = useMemo(
    () => rows.some((r) => r.segments.some((seg) => seg.type === 'session' && seg.parts.includes('timer'))),
    [rows],
  )
  const weekTimer = useMemo(
    () => rows.some((r) => r.segments.some((seg) => seg.type === 'week' && seg.parts.includes('timer'))),
    [rows],
  )

  // While open: push the page right (body class drives the shift) and let Esc or
  // a click outside close it. The drawer doesn't overlay (the page stays live to
  // its right), so there's no backdrop element — we listen on the document and
  // close on any pointer-down that lands outside both the drawer and its trigger.
  // (Excluding the trigger matters: otherwise clicking it to close would close
  // here, then its onClick toggle would immediately re-open.)
  useEffect(() => {
    if (!open) return
    document.body.classList.add('pms-drawer-open')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (drawerRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.body.classList.remove('pms-drawer-open')
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

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
  const durationMin = Math.round((mock.cost?.total_duration_ms ?? 0) / 60000)

  // A control shows only when its element is placed; a group (header + divider)
  // shows only when it has at least one visible control. Nothing placed ⇒ an
  // empty-state note instead of a grid of headers.
  const showUsage = has('context') || has('session') || has('week')
  const showSession =
    has('model') || has('effort') || has('outputStyle') || has('agent') || has('version')
  const showWorkspace = has('directory') || has('gitBranch')
  const showCost = has('cost') || has('duration') || has('lines')
  const anyControls = showUsage || showSession || showWorkspace || showCost

  return (
    <>
      <div className="preview-data-trigger" ref={triggerRef}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <IconSliders />
          Preview data
        </button>
      </div>

      {open &&
        createPortal(
          <aside className="drawer stack" role="dialog" aria-label="Preview data" ref={drawerRef}>
            <div className="spread">
              <h2 className="section-head">Preview data</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="close preview data"
                onClick={() => setOpen(false)}
              >
                <IconClose />
              </button>
            </div>

            <span className="comment">
              fake data that only drives the preview, never your config or the exported script.
              Only elements you&apos;ve added appear here.
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

            {anyControls ? (
              <div className="mock-grid">
                {/* --- usage: the metric percentages + their reset countdowns --- */}
                {showUsage && (
                  <div className="stack-2">
                    <span className="group-head">Usage</span>
                    {has('context') && (
                      <Slider label="context" value={ctxPct} onChange={s.setContextPct} />
                    )}
                    {has('session') && (
                      <Slider label="5h session" value={sesPct} onChange={s.setSessionPct} />
                    )}
                    {sessionTimer && (
                      <Slider
                        label="5h resets in"
                        value={sesResetMin}
                        display={fmtMinutes(sesResetMin)}
                        onChange={s.setSessionResetMinutes}
                        min={0}
                        max={300}
                        step={5}
                      />
                    )}
                    {has('week') && (
                      <Slider label="7d week" value={weekPct} onChange={s.setWeekPct} />
                    )}
                    {weekTimer && (
                      <Slider
                        label="7d resets in"
                        value={weekResetMin}
                        display={fmtMinutes(weekResetMin)}
                        onChange={s.setWeekResetMinutes}
                        min={0}
                        max={10080}
                        step={60}
                      />
                    )}
                  </div>
                )}

                {/* --- session: model, effort, output style, agent, version --- */}
                {showSession && (
                  <div className="stack-2">
                    <span className="group-head">Session</span>
                    {has('model') && (
                      <TextField
                        label="model"
                        value={mock.model.display_name}
                        onChange={s.setModelName}
                      />
                    )}
                    {has('effort') && (
                      <SelectField
                        label="effort"
                        value={mock.effort?.level ?? 'high'}
                        options={EFFORTS}
                        onChange={(v) => s.setEffortLevel(v as EffortLevel)}
                      />
                    )}
                    {has('outputStyle') && (
                      <TextField
                        label="output style"
                        value={mock.output_style?.name ?? ''}
                        onChange={s.setOutputStyle}
                      />
                    )}
                    {has('agent') && (
                      <TextField label="agent" value={mock.agent?.name ?? ''} onChange={s.setAgentName} />
                    )}
                    {has('version') && (
                      <TextField label="version" value={mock.version ?? ''} onChange={s.setVersion} />
                    )}
                  </div>
                )}

                {/* --- workspace: directory + branch --- */}
                {showWorkspace && (
                  <div className="stack-2">
                    <span className="group-head">Workspace</span>
                    {has('directory') && (
                      <TextField
                        label="directory"
                        value={mock.cwd ?? mock.workspace.current_dir ?? ''}
                        onChange={s.setDirectory}
                      />
                    )}
                    {has('gitBranch') && (
                      <TextField
                        label="git branch"
                        value={mock._gitBranch ?? ''}
                        placeholder="(no branch)"
                        onChange={s.setGitBranch}
                      />
                    )}
                  </div>
                )}

                {/* --- cost & activity: all read the single `cost` object --- */}
                {showCost && (
                  <div className="stack-2">
                    <span className="group-head">Cost</span>
                    {has('cost') && (
                      <NumField
                        label="cost (USD)"
                        value={mock.cost?.total_cost_usd ?? 0}
                        step={0.01}
                        onChange={s.setCostUsd}
                      />
                    )}
                    {has('duration') && (
                      <NumField label="duration (min)" value={durationMin} onChange={s.setDurationMinutes} />
                    )}
                    {has('lines') && (
                      <NumField
                        label="lines added"
                        value={mock.cost?.total_lines_added ?? 0}
                        onChange={s.setLinesAdded}
                      />
                    )}
                    {has('lines') && (
                      <NumField
                        label="lines removed"
                        value={mock.cost?.total_lines_removed ?? 0}
                        onChange={s.setLinesRemoved}
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <span className="comment">
                Add an element to your statusline to tweak its preview data here.
              </span>
            )}
          </aside>,
          document.body,
        )}
    </>
  )
}
