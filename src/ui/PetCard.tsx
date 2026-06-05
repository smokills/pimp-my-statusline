// PetCard — the STANDALONE global pet configuration, hosted in the builder
// sidebar above the element library. The pet is not an element: it has a
// master enable/disable toggle here, and when enabled it is ALWAYS drawn at
// the left of the statusline with the rows following to its right.
//
// When enabled the card expands with the existing settings: roster, mood
// theater (fixed-grid preview that never shifts between moods), mood scrubber,
// metric binding and gap.

import { useState, type JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { PETS, getPet } from '../pets/pets'
import { selectMood, colorizeFrame } from '../pets/runtime'
import { MOOD_ORDER, type Mood, type PetMetric } from '../pets/types'
import { AnsiLine } from '../preview/ansiToHtml'

const METRICS: { value: PetMetric; label: string }[] = [
  { value: 'context', label: 'CTX' },
  { value: 'session_5h', label: '5H' },
  { value: 'week_7d', label: '7D' },
]

function MoodTheater({ petId, pct }: { petId: string; pct: number }): JSX.Element {
  const pet = getPet(petId)
  const thresholds = useConfigStore((s) => s.config.pet.thresholds)
  if (!pet) return <span className="comment">unknown pet</span>

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
        }}
        aria-label={`${pet.label} at mood ${mood}`}
      >
        <pre style={{ margin: 0, whiteSpace: 'pre', textAlign: 'left' }}>
          {lines.map((l, i) => (
            <div key={i}>
              <AnsiLine line={l} />
            </div>
          ))}
        </pre>
      </div>
      <span className="label" style={{ color: 'var(--accent)' }}>
        {mood.toUpperCase()} · {pct}%
      </span>
    </div>
  )
}

export function PetCard(): JSX.Element {
  const pet = useConfigStore((s) => s.config.pet)
  const updatePet = useConfigStore((s) => s.updatePet)
  // Local scrubber so the user can preview moods without touching the real mock.
  const [scrub, setScrub] = useState(pet.thresholds.calm)

  return (
    <section className="side-card" aria-label="Pet settings">
      <div className="spread side-card-head">
        <span className="section-head">Pet</span>
        <label className="check">
          <input
            type="checkbox"
            checked={pet.enabled}
            onChange={(e) => updatePet({ enabled: e.target.checked })}
            aria-label="enable pet"
          />
          <span className="box" />
          <span>{pet.enabled ? 'on' : 'off'}</span>
        </label>
      </div>

      {!pet.enabled && (
        <span className="comment">
          an ASCII companion drawn at the left of your statusline, reacting to
          your session
        </span>
      )}

      {pet.enabled && (
        <div className="stack">
          <div className="stack-2">
            <span className="label">roster</span>
            <div className="stack-2 scroll-y" style={{ maxHeight: 200, paddingRight: 4 }}>
              {PETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  data-selected={pet.petId === p.id}
                  style={{
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    minHeight: 'auto',
                    padding: 8,
                    width: '100%',
                  }}
                  aria-pressed={pet.petId === p.id}
                  onClick={() => updatePet({ petId: p.id })}
                >
                  <span style={{ color: pet.petId === p.id ? 'var(--accent)' : 'var(--fg)' }}>
                    {p.label}
                  </span>
                  <span className="comment" style={{ fontSize: 'var(--fs-12)' }}>
                    {p.bio}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="stack-2">
            <span className="label">mood theater</span>
            <MoodTheater petId={pet.petId} pct={scrub} />
            <label className="field">
              <span className="spread">
                <span className="label">scrub mood</span>
                <span className="mono" style={{ color: 'var(--accent)' }}>{scrub}%</span>
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
                <button key={m} type="button" onClick={() => setScrub([5, 30, 65, 85, 96][i])}>
                  {m}
                </button>
              ))}
            </div>
          </div>

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

          <label className="field">
            <span className="spread">
              <span className="label">gap</span>
              <span className="mono" style={{ color: 'var(--accent)' }}>{pet.gap}</span>
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

          <span className="comment">drawn at the left of the statusline; rows follow</span>
        </div>
      )}
    </section>
  )
}
