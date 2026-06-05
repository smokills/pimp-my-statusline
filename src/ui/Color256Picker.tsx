// Color256Picker — the xterm-256 palette picker. Operates on a TextStyle (color
// + bold + dim) and supports a THRESHOLD MODE (three stops with editable
// breakpoints). Bands: ANSI16 (0-15, editable as raw ansi16 SGR codes via the
// "raw ANSI-16" toggle), CUBE (16-231 as six 6×6 blocks), GRAYSCALE (232-255).
// Hover live-previews via onHover; click commits via onChange. Recents +
// suggested + typed-index input round it out.

import { memo, useCallback, useEffect, useState, type JSX } from 'react'
import type { ColorSpec, TextStyle, ThresholdStop } from '../model/types'
import { XTERM256, ANSI16_TO_XTERM } from '../preview/xterm256'
import {
  colorName,
  loadRecents,
  pushRecent,
  SUGGESTED_COLORS,
  colorSpecToHex,
} from './lib/color'

// Reverse map: xterm index 0-15 → ansi16 SGR code (30-37 / 90-97).
const XTERM_TO_ANSI16: Record<number, number> = Object.fromEntries(
  Object.entries(ANSI16_TO_XTERM).map(([sgr, idx]) => [idx, Number(sgr)]),
)

// Memoized so a single pick (which changes `currentIndex`) only re-renders the
// two cells whose `selected` boolean actually flips — not all 256. The callbacks
// passed in are useCallback-stable, so referential equality holds.
const Cell = memo(function Cell({
  index,
  selected,
  onPick,
  onHover,
  onLeave,
}: {
  index: number
  selected: boolean
  onPick: (i: number) => void
  onHover: (i: number) => void
  onLeave: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      className="color-cell"
      data-current={selected}
      style={{ background: XTERM256[index] }}
      title={`${index} · ${colorName(index)}`}
      aria-label={`color ${index}, ${colorName(index)}`}
      onClick={() => onPick(index)}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={onLeave}
      onFocus={() => onHover(index)}
      onBlur={onLeave}
    />
  )
})

function Band({
  label,
  indices,
  cols,
  current,
  onPick,
  onHover,
  onLeave,
}: {
  label: string
  indices: number[]
  cols: number
  current: number | null
  onPick: (i: number) => void
  onHover: (i: number) => void
  onLeave: () => void
}): JSX.Element {
  return (
    <div className="stack-2">
      <span className="label">{label}</span>
      <div
        className="color-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, var(--cell-size))` }}
      >
        {indices.map((i) => (
          <Cell
            key={i}
            index={i}
            selected={current === i}
            onPick={onPick}
            onHover={onHover}
            onLeave={onLeave}
          />
        ))}
      </div>
    </div>
  )
}

const CUBE_BLOCKS: number[][] = Array.from({ length: 6 }, (_, block) =>
  Array.from({ length: 36 }, (_, k) => 16 + block * 36 + k),
)
const GRAYSCALE = Array.from({ length: 24 }, (_, k) => 232 + k)
const ANSI_INDICES = Array.from({ length: 16 }, (_, k) => k)

/** A single-color picker grid + bands + recents + typed input + bold/dim. */
function PickerCore({
  color,
  bold,
  dim,
  onColor,
  onHoverColor,
  onBold,
  onDim,
  allowAnsi16,
}: {
  color: ColorSpec | undefined
  bold: boolean
  dim: boolean
  onColor: (c: ColorSpec) => void
  onHoverColor: (c: ColorSpec | null) => void
  onBold: (b: boolean) => void
  onDim: (d: boolean) => void
  allowAnsi16: boolean
}): JSX.Element {
  const [recents, setRecents] = useState<number[]>(loadRecents)
  const [typed, setTyped] = useState('')
  // When the existing color is ansi16, default the "raw" toggle on so the
  // faithful default-preset colors are editable as-is.
  const [rawAnsi16, setRawAnsi16] = useState<boolean>(color?.kind === 'ansi16')

  useEffect(() => {
    setRawAnsi16(color?.kind === 'ansi16')
  }, [color])

  // Current xterm index for highlighting the grid (fixed, or ansi16→xterm).
  const currentIndex: number | null =
    color?.kind === 'fixed'
      ? color.code
      : color?.kind === 'ansi16'
        ? (ANSI16_TO_XTERM[color.code] ?? null)
        : null

  const commit = useCallback(
    (index: number) => {
      if (rawAnsi16 && index < 16) {
        const sgr = XTERM_TO_ANSI16[index]
        if (sgr !== undefined) {
          onColor({ kind: 'ansi16', code: sgr })
          setRecents(pushRecent(index))
          return
        }
      }
      onColor({ kind: 'fixed', code: index })
      setRecents(pushRecent(index))
    },
    [onColor, rawAnsi16],
  )

  const hover = useCallback(
    (index: number) => {
      if (rawAnsi16 && index < 16) {
        const sgr = XTERM_TO_ANSI16[index]
        if (sgr !== undefined) {
          onHoverColor({ kind: 'ansi16', code: sgr })
          return
        }
      }
      onHoverColor({ kind: 'fixed', code: index })
    },
    [onHoverColor, rawAnsi16],
  )
  const leave = useCallback(() => onHoverColor(null), [onHoverColor])

  const onTypedCommit = () => {
    const n = Number(typed)
    if (Number.isInteger(n) && n >= 0 && n <= 255) commit(n)
    setTyped('')
  }

  return (
    <div className="stack">
      <div className="row-flex" style={{ alignItems: 'center' }}>
        <span
          className="swatch"
          style={{
            width: 28,
            height: 28,
            border: '1px solid var(--border)',
            background: colorSpecToHex(color, bold),
          }}
          aria-hidden="true"
        />
        <span className="label">{color ? describe(color) : 'no color'}</span>
        <div style={{ flex: 1 }} />
        <label className="check">
          <input
            type="checkbox"
            checked={bold}
            onChange={(e) => onBold(e.target.checked)}
          />
          <span className="box" />
          <span>bold</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={dim} onChange={(e) => onDim(e.target.checked)} />
          <span className="box" />
          <span>dim</span>
        </label>
      </div>

      {recents.length > 0 && (
        <Band
          label="recents"
          indices={recents}
          cols={Math.max(8, recents.length)}
          current={currentIndex}
          onPick={commit}
          onHover={hover}
          onLeave={leave}
        />
      )}
      <Band
        label="suggested"
        indices={[...SUGGESTED_COLORS]}
        cols={8}
        current={currentIndex}
        onPick={commit}
        onHover={hover}
        onLeave={leave}
      />

      <div className="row-flex" style={{ alignItems: 'flex-end' }}>
        <Band
          label="standard 0-15"
          indices={ANSI_INDICES}
          cols={8}
          current={currentIndex}
          onPick={commit}
          onHover={hover}
          onLeave={leave}
        />
        {allowAnsi16 && (
          <label className="check" style={{ marginBottom: 2 }}>
            <input
              type="checkbox"
              checked={rawAnsi16}
              onChange={(e) => setRawAnsi16(e.target.checked)}
            />
            <span className="box" />
            <span title="Emit standard colors as raw ANSI-16 SGR codes (byte-faithful)">
              raw ANSI-16
            </span>
          </label>
        )}
      </div>

      <div className="stack-2">
        <span className="label">cube 16-231</span>
        <div className="row-flex" style={{ gap: 8 }}>
          {CUBE_BLOCKS.map((blk, i) => (
            <div
              key={i}
              className="color-grid"
              style={{ gridTemplateColumns: 'repeat(6, var(--cell-size))' }}
            >
              {blk.map((idx) => (
                <Cell
                  key={idx}
                  index={idx}
                  selected={currentIndex === idx}
                  onPick={commit}
                  onHover={hover}
                  onLeave={leave}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <Band
        label="grayscale 232-255"
        indices={GRAYSCALE}
        cols={24}
        current={currentIndex}
        onPick={commit}
        onHover={hover}
        onLeave={leave}
      />

      <div className="row-flex">
        <label className="field" style={{ width: 130 }}>
          <span className="label">index 0-255</span>
          <input
            className="text-input"
            inputMode="numeric"
            value={typed}
            placeholder="e.g. 46"
            onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onTypedCommit()
            }}
            onBlur={onTypedCommit}
          />
        </label>
      </div>
    </div>
  )
}

function describe(c: ColorSpec): string {
  if (c.kind === 'fixed') return `fixed ${c.code} · 38;5;${c.code}`
  if (c.kind === 'ansi16') return `ansi16 ${c.code}`
  return 'threshold'
}

// ---------------------------------------------------------------------------
// Public: a styled-control that switches between single color + threshold mode.
// ---------------------------------------------------------------------------

const FALLBACK_STOPS: ThresholdStop[] = [
  { at: 90, code: 31, ansi16: true },
  { at: 70, code: 33, ansi16: true },
  { at: 0, code: 32, ansi16: true },
]

export function Color256Picker({
  style,
  onChange,
  onHover,
  allowThreshold = false,
}: {
  style: TextStyle | undefined
  onChange: (style: TextStyle) => void
  /** Live hover preview: receives a derived TextStyle, or null to clear. */
  onHover?: (style: TextStyle | null) => void
  allowThreshold?: boolean
}): JSX.Element {
  const color = style?.color
  const bold = style?.bold ?? false
  const dim = style?.dim ?? false
  const isThreshold = color?.kind === 'threshold'

  const setColor = (c: ColorSpec) => onChange({ ...style, color: c })
  const hoverColor = (c: ColorSpec | null) =>
    onHover?.(c === null ? null : { ...style, color: c })

  const enableThreshold = () =>
    onChange({
      ...style,
      color: { kind: 'threshold', stops: FALLBACK_STOPS.map((s) => ({ ...s })) },
    })
  const disableThreshold = () => onChange({ ...style, color: { kind: 'fixed', code: 46 } })

  return (
    <div className="stack">
      {allowThreshold && (
        <label className="check">
          <input
            type="checkbox"
            checked={isThreshold}
            onChange={(e) => (e.target.checked ? enableThreshold() : disableThreshold())}
          />
          <span className="box" />
          <span>threshold mode — color by %</span>
        </label>
      )}

      {isThreshold ? (
        <ThresholdEditor
          stops={(color as Extract<ColorSpec, { kind: 'threshold' }>).stops}
          bold={bold}
          dim={dim}
          onStops={(stops) => onChange({ ...style, color: { kind: 'threshold', stops } })}
          onBold={(b) => onChange({ ...style, bold: b })}
          onDim={(d) => onChange({ ...style, dim: d })}
        />
      ) : (
        <PickerCore
          color={color}
          bold={bold}
          dim={dim}
          onColor={setColor}
          onHoverColor={hoverColor}
          onBold={(b) => onChange({ ...style, bold: b })}
          onDim={(d) => onChange({ ...style, dim: d })}
          allowAnsi16
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Threshold editor — three breakpoint stops, each with its own color picker.
// ---------------------------------------------------------------------------

function ThresholdEditor({
  stops,
  bold,
  dim,
  onStops,
  onBold,
  onDim,
}: {
  stops: ThresholdStop[]
  bold: boolean
  dim: boolean
  onStops: (s: ThresholdStop[]) => void
  onBold: (b: boolean) => void
  onDim: (d: boolean) => void
}): JSX.Element {
  // Sort descending by `at` for display: <70 / 70-89 / >=90 reads top-down as
  // high → low here. We render the canonical three: high (>=90), mid (>=70), low (>=0).
  const sorted = [...stops].sort((a, b) => b.at - a.at)
  const [open, setOpen] = useState<number | null>(null)

  const updateStop = (i: number, patch: Partial<ThresholdStop>) => {
    const next = sorted.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    onStops(next)
  }
  const stopColor = (s: ThresholdStop): ColorSpec =>
    s.ansi16 ? { kind: 'ansi16', code: s.code } : { kind: 'fixed', code: s.code }
  const applyColor = (i: number, c: ColorSpec) => {
    if (c.kind === 'threshold') return
    updateStop(i, { code: c.code, ansi16: c.kind === 'ansi16' || undefined })
  }

  const rangeLabel = (i: number): string => {
    if (i === 0) return `≥ ${sorted[0].at}`
    if (i === sorted.length - 1) return `< ${sorted[i - 1].at}`
    return `${sorted[i].at}–${sorted[i - 1].at - 1}`
  }

  return (
    <div className="stack">
      <div className="row-flex" style={{ alignItems: 'flex-start', gap: 16 }}>
        {sorted.map((s, i) => (
          <div key={i} className="stack-2" style={{ minWidth: 90 }}>
            <span className="label">{rangeLabel(i)}</span>
            <button
              type="button"
              className="color-cell"
              data-current={open === i}
              style={{ width: 40, height: 28, background: colorSpecToHex(stopColor(s), bold) }}
              aria-label={`edit color for ${rangeLabel(i)}%`}
              onClick={() => setOpen(open === i ? null : i)}
            />
            <label className="field">
              <span className="label faint">at ≥</span>
              <input
                className="text-input"
                style={{ width: 64 }}
                inputMode="numeric"
                value={s.at}
                disabled={i === sorted.length - 1}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                  updateStop(i, { at: v })
                }}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="row-flex">
        <label className="check">
          <input type="checkbox" checked={bold} onChange={(e) => onBold(e.target.checked)} />
          <span className="box" />
          <span>bold</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={dim} onChange={(e) => onDim(e.target.checked)} />
          <span className="box" />
          <span>dim</span>
        </label>
      </div>

      {open !== null && (
        <div className="well card-pad">
          <PickerCore
            color={stopColor(sorted[open])}
            bold={bold}
            dim={dim}
            onColor={(c) => applyColor(open, c)}
            onHoverColor={() => {}}
            onBold={onBold}
            onDim={onDim}
            allowAnsi16
          />
        </div>
      )}
    </div>
  )
}
