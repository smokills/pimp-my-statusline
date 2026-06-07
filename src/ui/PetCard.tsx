// PetCard — the global pet configuration, shown above the rows in the canvas
// (not in a tab). The pet is not a row element: when enabled it is ALWAYS drawn
// at the left of the statusline, with the rows following to its right.
//
// A disclosure, collapsed by default: the summary always shows the status
// ("· off" / "· cat") so it stays compact instead of exploding the viewport.
// Expand it to flip the toggle, pick a pet, choose the mood metric and set the
// gap. The live result shows in the terminal preview above.

import type { JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { PETS } from '../pets/pets'
import type { PetMetric } from '../pets/types'

// Same labels the Preview-tab sliders use, so the driver and its scrubber share
// one vocabulary.
const METRIC_OPTIONS: { value: PetMetric; label: string }[] = [
  { value: 'context', label: 'context' },
  { value: 'session_5h', label: '5h session' },
  { value: 'week_7d', label: '7d week' },
]

export function PetCard(): JSX.Element {
  const pet = useConfigStore((s) => s.config.pet)
  const updatePet = useConfigStore((s) => s.updatePet)
  const metricLabel = METRIC_OPTIONS.find((m) => m.value === pet.metric)?.label ?? 'context'
  const status = pet.enabled ? (PETS.find((p) => p.id === pet.petId)?.label ?? pet.petId) : 'off'

  return (
    <details className="card card-pad stack disclosure">
      <summary className="section-head" style={{ cursor: 'pointer' }}>
        Pet companion{' '}
        <span
          className="mono"
          style={{ fontWeight: 400, color: pet.enabled ? 'var(--accent)' : 'var(--fg-muted)' }}
        >
          · {status}
        </span>
      </summary>

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

      {!pet.enabled && (
        <span className="comment">
          an ASCII companion drawn at the left of your statusline, reacting to your usage
        </span>
      )}

      {pet.enabled && (
        <div className="stack">
          <div className="stack-2">
            <span className="label">roster</span>
            <div className="pet-roster">
              {PETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip pet-chip"
                  data-selected={pet.petId === p.id}
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
            <span className="label">reacts to</span>
            <div className="segmented" role="group" aria-label="metric the pet mood reacts to">
              {METRIC_OPTIONS.map((m) => (
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

          <label className="field" style={{ maxWidth: 320 }}>
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

          <span className="comment">
            drawn at the left of the statusline; scrub {metricLabel} in “Adjust preview data” to
            see it react
          </span>
        </div>
      )}
    </details>
  )
}
