// ElementInspector — the ELEMENT tab. Renders the variant + style controls for
// the selected segment, derived from its shape. Variant toggles, dir style,
// lines style, pr showState, separator width, static text, label editor,
// emoji, prefix/suffix, color controls, and absence notes (from the registry).

import type { JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import type {
  Segment,
  MetricSegment,
  DirectorySegment,
  LinesSegment,
  PrSegment,
  SeparatorSegment,
  StaticTextSegment,
  MetricPart,
  TextStyle,
} from '../model/types'
import { SEGMENTS } from '../model/segments'
import { absenceNote } from './lib/library'
import { Color256Picker } from './Color256Picker'

function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}): JSX.Element {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function MultiToggle({
  options,
  active,
  onToggle,
}: {
  options: { value: string; label: string }[]
  active: string[]
  onToggle: (v: string) => void
}): JSX.Element {
  return (
    <div className="segmented" role="group" aria-label="parts">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={active.includes(o.value)}
          onClick={() => onToggle(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function StyleControl({
  label,
  style,
  onChange,
  allowThreshold = false,
}: {
  label: string
  style: TextStyle | undefined
  onChange: (s: TextStyle) => void
  allowThreshold?: boolean
}): JSX.Element {
  return (
    <details className="stack-2 disclosure">
      <summary className="label" style={{ cursor: 'pointer', color: 'var(--accent)' }}>
        {label} color
      </summary>
      <div className="well card-pad">
        <Color256Picker style={style} onChange={onChange} allowThreshold={allowThreshold} />
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Per-type bodies
// ---------------------------------------------------------------------------

function MetricBody({ seg }: { seg: MetricSegment }): JSX.Element {
  const update = useConfigStore((st) => st.updateSegment)
  const toggle = (part: MetricPart) => {
    const has = seg.parts.includes(part)
    const next = has ? seg.parts.filter((p) => p !== part) : [...seg.parts, part]
    // keep canonical order bar < percent < timer
    const order: MetricPart[] = ['bar', 'percent', 'timer']
    update(seg.id, { parts: order.filter((p) => next.includes(p)) } as Partial<Segment>)
  }
  // Timer is only meaningful for session/week (context has no reset).
  const showTimer = seg.type !== 'context'

  return (
    <div className="stack">
      <div className="stack-2">
        <span className="label">parts</span>
        <MultiToggle
          options={[
            { value: 'bar', label: 'BAR' },
            { value: 'percent', label: 'PERCENT' },
          ]}
          active={seg.parts}
          onToggle={(v) => toggle(v as MetricPart)}
        />
      </div>

      {seg.parts.includes('bar') && (
        <div className="row-flex" style={{ gap: 12 }}>
          <label className="field">
            <span className="label">bar width</span>
            <input
              className="text-input"
              style={{ width: 70 }}
              inputMode="numeric"
              value={seg.barWidth}
              onChange={(e) =>
                update(seg.id, {
                  barWidth: Math.max(1, Math.min(40, Number(e.target.value) || 1)),
                } as Partial<Segment>)
              }
            />
          </label>
        </div>
      )}

      {showTimer && (
        <label className="check">
          <input
            type="checkbox"
            checked={seg.parts.includes('timer')}
            onChange={() => toggle('timer')}
          />
          <span className="box" />
          <span>timer <span className="comment">(countdown to reset)</span></span>
        </label>
      )}

      <StyleControl
        label="value"
        style={seg.valueStyle}
        allowThreshold
        onChange={(s) => update(seg.id, { valueStyle: s } as Partial<Segment>)}
      />
      {seg.parts.includes('bar') && (
        <StyleControl
          label="bar"
          style={seg.barStyle}
          allowThreshold
          onChange={(s) => update(seg.id, { barStyle: s } as Partial<Segment>)}
        />
      )}
      {seg.parts.includes('timer') && (
        <StyleControl
          label="timer"
          style={seg.timerStyle}
          onChange={(s) => update(seg.id, { timerStyle: s } as Partial<Segment>)}
        />
      )}
    </div>
  )
}

function DirectoryBody({ seg }: { seg: DirectorySegment }): JSX.Element {
  const update = useConfigStore((st) => st.updateSegment)
  return (
    <div className="stack">
      <div className="stack-2">
        <span className="label">path style</span>
        <Segmented
          ariaLabel="directory style"
          value={seg.dirStyle}
          onChange={(v) => update(seg.id, { dirStyle: v } as Partial<Segment>)}
          options={[
            { value: 'tildeHome', label: '~/PATH' },
            { value: 'basename', label: 'BASENAME' },
            { value: 'full', label: 'FULL' },
          ]}
        />
      </div>
      <StyleControl label="text" style={seg.style} onChange={(s) => update(seg.id, { style: s } as Partial<Segment>)} />
    </div>
  )
}

function LinesBody({ seg }: { seg: LinesSegment }): JSX.Element {
  const update = useConfigStore((st) => st.updateSegment)
  return (
    <div className="stack">
      <div className="stack-2">
        <span className="label">lines style</span>
        <Segmented
          ariaLabel="lines style"
          value={seg.linesStyle}
          onChange={(v) => update(seg.id, { linesStyle: v } as Partial<Segment>)}
          options={[
            { value: 'combined', label: '+ / −' },
            { value: 'addedOnly', label: 'ADDED' },
            { value: 'removedOnly', label: 'REMOVED' },
          ]}
        />
      </div>
      <StyleControl label="added" style={seg.addedStyle} onChange={(s) => update(seg.id, { addedStyle: s } as Partial<Segment>)} />
      <StyleControl label="removed" style={seg.removedStyle} onChange={(s) => update(seg.id, { removedStyle: s } as Partial<Segment>)} />
    </div>
  )
}

function PrBody({ seg }: { seg: PrSegment }): JSX.Element {
  const update = useConfigStore((st) => st.updateSegment)
  return (
    <div className="stack">
      <label className="check">
        <input
          type="checkbox"
          checked={seg.showState}
          onChange={(e) => update(seg.id, { showState: e.target.checked } as Partial<Segment>)}
        />
        <span className="box" />
        <span>show review state</span>
      </label>
      <StyleControl label="text" style={seg.style} onChange={(s) => update(seg.id, { style: s } as Partial<Segment>)} />
    </div>
  )
}

function SeparatorBody({ seg }: { seg: SeparatorSegment }): JSX.Element {
  const update = useConfigStore((st) => st.updateSegment)
  const isFull = seg.width === 'full'
  return (
    <div className="stack">
      <div className="row-flex" style={{ gap: 12 }}>
        <label className="check">
          <input
            type="checkbox"
            checked={isFull}
            onChange={(e) =>
              update(seg.id, { width: e.target.checked ? 'full' : 40 } as Partial<Segment>)
            }
          />
          <span className="box" />
          <span>full width</span>
        </label>
        {!isFull && (
          <label className="field">
            <span className="label">width</span>
            <input
              className="text-input"
              style={{ width: 70 }}
              inputMode="numeric"
              value={seg.width}
              onChange={(e) =>
                update(seg.id, { width: Math.max(1, Number(e.target.value) || 1) } as Partial<Segment>)
              }
            />
          </label>
        )}
      </div>
      <StyleControl label="text" style={seg.style} onChange={(s) => update(seg.id, { style: s } as Partial<Segment>)} />
    </div>
  )
}

function StaticTextBody({ seg }: { seg: StaticTextSegment }): JSX.Element {
  const update = useConfigStore((st) => st.updateSegment)
  return (
    <div className="stack">
      <label className="field">
        <span className="label">text</span>
        <input
          className="text-input"
          value={seg.text}
          placeholder="literal text…"
          onChange={(e) => update(seg.id, { text: e.target.value } as Partial<Segment>)}
        />
      </label>
      <StyleControl label="text" style={seg.style} onChange={(s) => update(seg.id, { style: s } as Partial<Segment>)} />
    </div>
  )
}

function SimpleBody({ seg }: { seg: Segment }): JSX.Element {
  const update = useConfigStore((st) => st.updateSegment)
  const style = 'style' in seg ? (seg as { style?: TextStyle }).style : undefined
  return (
    <div className="stack">
      <StyleControl label="text" style={style} onChange={(s) => update(seg.id, { style: s } as Partial<Segment>)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared label / emoji / affix editors
// ---------------------------------------------------------------------------

function LabelEmojiAffix({ seg }: { seg: Segment }): JSX.Element {
  const update = useConfigStore((st) => st.updateSegment)
  const def = SEGMENTS[seg.type]

  return (
    <div className="stack">
      <hr className="divider" />
      {/* Label */}
      <div className="stack-2">
        <label className="check">
          <input
            type="checkbox"
            checked={seg.label?.show ?? false}
            onChange={(e) =>
              update(seg.id, {
                label: { text: seg.label?.text ?? '', show: e.target.checked, style: seg.label?.style },
              } as Partial<Segment>)
            }
          />
          <span className="box" />
          <span>label</span>
        </label>
        {seg.label?.show && (
          <input
            className="text-input"
            value={seg.label.text}
            placeholder="label text…"
            aria-label="label text"
            onChange={(e) =>
              update(seg.id, {
                label: { ...seg.label!, text: e.target.value },
              } as Partial<Segment>)
            }
          />
        )}
        {seg.label?.show && (
          <StyleControl
            label="label"
            style={seg.label.style}
            onChange={(s) =>
              update(seg.id, { label: { ...seg.label!, style: s } } as Partial<Segment>)
            }
          />
        )}
      </div>

      {/* Emoji — purely per-element: no global gate. */}
      <div className="stack-2">
        <label className="check">
          <input
            type="checkbox"
            checked={seg.emoji?.show ?? false}
            onChange={(e) =>
              update(seg.id, {
                emoji: { glyph: seg.emoji?.glyph ?? (def.emojiDefault ?? ''), show: e.target.checked },
              } as Partial<Segment>)
            }
          />
          <span className="box" />
          <span>emoji</span>
        </label>
        {seg.emoji?.show && (
          <input
            className="text-input"
            style={{ width: 80 }}
            value={seg.emoji.glyph}
            placeholder="glyph"
            aria-label="emoji glyph"
            onChange={(e) =>
              update(seg.id, { emoji: { ...seg.emoji!, glyph: e.target.value } } as Partial<Segment>)
            }
          />
        )}
      </div>

      {/* Prefix — color disclosure shows only once the affix is non-empty. */}
      <div className="stack-2">
        <label className="field">
          <span className="label">prefix</span>
          <input
            className="text-input"
            style={{ width: 110 }}
            value={seg.prefix ?? ''}
            onChange={(e) => update(seg.id, { prefix: e.target.value || undefined } as Partial<Segment>)}
          />
        </label>
        {(seg.prefix ?? '') !== '' && (
          <StyleControl
            label="prefix"
            style={seg.prefixStyle}
            onChange={(s) => update(seg.id, { prefixStyle: s } as Partial<Segment>)}
          />
        )}
      </div>

      {/* Suffix — same: color disclosure gated on a non-empty affix. */}
      <div className="stack-2">
        <label className="field">
          <span className="label">suffix</span>
          <input
            className="text-input"
            style={{ width: 110 }}
            value={seg.suffix ?? ''}
            onChange={(e) => update(seg.id, { suffix: e.target.value || undefined } as Partial<Segment>)}
          />
        </label>
        {(seg.suffix ?? '') !== '' && (
          <StyleControl
            label="suffix"
            style={seg.suffixStyle}
            onChange={(s) => update(seg.id, { suffixStyle: s } as Partial<Segment>)}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export function ElementInspector({ seg }: { seg: Segment }): JSX.Element {
  const update = useConfigStore((st) => st.updateSegment)
  const note = absenceNote(seg.type)

  let body: JSX.Element
  switch (seg.type) {
    case 'context':
    case 'session':
    case 'week':
      body = <MetricBody seg={seg} />
      break
    case 'directory':
      body = <DirectoryBody seg={seg} />
      break
    case 'lines':
      body = <LinesBody seg={seg} />
      break
    case 'pr':
      body = <PrBody seg={seg} />
      break
    case 'separator':
      body = <SeparatorBody seg={seg} />
      break
    case 'staticText':
      body = <StaticTextBody seg={seg} />
      break
    default:
      body = <SimpleBody seg={seg} />
  }

  // separator/staticText have no label/emoji affordances worth surfacing.
  const showAffix = seg.type !== 'separator'

  return (
    <div className="stack">
      <div className="spread">
        <span className="mono accent">
          Editing: {SEGMENTS[seg.type].label}
        </span>
        <label className="check">
          <input
            type="checkbox"
            checked={seg.enabled}
            onChange={(e) => update(seg.id, { enabled: e.target.checked } as Partial<Segment>)}
          />
          <span className="box" />
          <span>enabled</span>
        </label>
      </div>
      <span className="comment">{SEGMENTS[seg.type].description}</span>
      {note && <span className="comment">{note.replace(/^\/\/\s*/, '')}</span>}
      {body}
      {showAffix && <LabelEmojiAffix seg={seg} />}
    </div>
  )
}
