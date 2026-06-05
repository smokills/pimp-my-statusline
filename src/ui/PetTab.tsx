// PetTab — pet roster + mood theater. The selected pet is rendered large via
// colorizeFrame → AnsiLine inside a fixed-grid outline that NEVER moves between
// moods (demonstrating the no-shift invariant). A mood scrubber (0-100) drives
// the displayed frame; metric / position / gap / enable controls round it out.

import { useState, type JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { PETS, getPet } from '../pets/pets'
import { selectMood, colorizeFrame } from '../pets/runtime'
import { MOOD_ORDER, type Mood, type PetMetric } from '../pets/types'
import { AnsiLine } from '../preview/ansiToHtml'

const METRICS: { value: PetMetric; label: string }[] = [
  { value: 'context', label: 'CONTEXT' },
  { value: 'session_5h', label: '5H SESSION' },
  { value: 'week_7d', label: '7D WEEK' },
]

function MoodTheater({ petId, pct }: { petId: string; pct: number }): JSX.Element {
  const pet = getPet(petId)
  const thresholds = useConfigStore((s) => s.config.pet.thresholds)
  if (!pet) return <span className="term-comment">// unknown pet</span>

  const available = Object.keys(pet.frames) as Mood[]
  const mood = selectMood(pct, thresholds, available)
  const frame = pet.frames[mood]
  const lines = frame ? colorizeFrame(frame, pet.bodyColor) : []

  return (
    <div className="stack-2" style={{ alignItems: 'center' }}>
      <div
        className="well"
        style={{
          padding: 12,
          // Fixed grid: width = pet.width ch, height = 3 rows; never moves.
          width: `calc(${pet.width}ch + 24px)`,
          fontFamily: 'var(--font-mono)',
          fontSize: '1.5rem',
          lineHeight: 1.2,
          background: 'var(--bg-deep)',
          boxShadow: 'inset 0 0 18px rgba(0,0,0,0.7)',
        }}
        aria-label={`${pet.label} at mood ${mood}`}
      >
        <pre style={{ margin: 0, whiteSpace: 'pre' }}>
          {lines.map((l, i) => (
            <div key={i}>
              <AnsiLine line={l} />
            </div>
          ))}
        </pre>
      </div>
      <span className="label" style={{ color: 'var(--phosphor)' }}>
        {mood.toUpperCase()} · {pct}%
      </span>
    </div>
  )
}

export function PetTab(): JSX.Element {
  const pet = useConfigStore((s) => s.config.pet)
  const updatePet = useConfigStore((s) => s.updatePet)
  // Local scrubber so the user can preview moods without touching the real mock.
  const [scrub, setScrub] = useState(pet.thresholds.calm)

  return (
    <div className="row-flex" style={{ alignItems: 'flex-start', gap: 24 }}>
      {/* Roster */}
      <div className="stack-2" style={{ minWidth: 220 }}>
        <span className="label">roster</span>
        <label className="check">
          <input
            type="checkbox"
            checked={pet.enabled}
            onChange={(e) => updatePet({ enabled: e.target.checked })}
          />
          <span className="box" />
          <span>enable pet</span>
        </label>
        <div className="stack-2 scroll-y" style={{ maxHeight: 220, paddingRight: 4 }}>
          {PETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip"
              data-selected={pet.petId === p.id}
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, minHeight: 'auto', padding: 8 }}
              aria-pressed={pet.petId === p.id}
              onClick={() => updatePet({ petId: p.id })}
            >
              <span style={{ color: pet.petId === p.id ? 'var(--phosphor)' : 'var(--fg)' }}>{p.label}</span>
              <span className="term-comment" style={{ fontSize: 'var(--fs-12)' }}>
                {p.bio}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Theater + scrubber */}
      <div className="stack" style={{ minWidth: 200 }}>
        <span className="label">mood theater</span>
        <MoodTheater petId={pet.petId} pct={scrub} />
        <label className="field">
          <span className="spread">
            <span className="label">scrub mood</span>
            <span className="mono" style={{ color: 'var(--phosphor)' }}>{scrub}%</span>
          </span>
          <input
            className="range-input"
            type="range"
            min={0}
            max={100}
            value={scrub}
            onChange={(e) => setScrub(Number(e.target.value))}
            aria-label="mood scrubber"
          />
        </label>
        <div className="segmented" role="group" aria-label="quick moods">
          {MOOD_ORDER.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => setScrub([5, 30, 65, 85, 96][i])}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="stack" style={{ minWidth: 200 }}>
        <div className="stack-2">
          <span className="label">mood metric</span>
          <div className="segmented" role="group" aria-label="pet metric">
            {METRICS.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={pet.metric === m.value}
                onClick={() => updatePet({ metric: m.value })}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="stack-2">
          <span className="label">position</span>
          <div className="segmented" role="group" aria-label="pet position">
            <button type="button" aria-pressed={pet.position === 'left'} onClick={() => updatePet({ position: 'left' })}>
              LEFT
            </button>
            <button type="button" aria-pressed={pet.position === 'right'} onClick={() => updatePet({ position: 'right' })}>
              RIGHT
            </button>
          </div>
          {pet.position === 'right' && (
            <span className="term-comment">// experimental — terminals may strip trailing spaces</span>
          )}
        </div>

        <label className="field">
          <span className="spread">
            <span className="label">gap</span>
            <span className="mono" style={{ color: 'var(--phosphor)' }}>{pet.gap}</span>
          </span>
          <input
            className="range-input"
            type="range"
            min={0}
            max={3}
            value={pet.gap}
            onChange={(e) => updatePet({ gap: Number(e.target.value) })}
            aria-label="pet gap"
          />
        </label>
      </div>
    </div>
  )
}
