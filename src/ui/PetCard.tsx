// PetCard — the global pet configuration, shown as a collapsible section ABOVE
// the rows in the canvas (not in a tab). The pet is not a row element: it has
// its own enable/disable toggle, and when enabled it is ALWAYS drawn at the
// left of the statusline with the rows following to its right.
//
// Off = collapsed (toggle + one-line hint). On = the roster, the metric that
// drives its mood, and the gap. The live result is visible in the terminal
// preview above: scrub the matching mock slider in the "Preview" tab and watch
// the pet react.

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

  return (
    <section className="card card-pad stack" aria-label="Pet companion">
      <div className="spread">
        <h3 className="section-head">Pet companion</h3>
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
            drawn at the left of the statusline; scrub {metricLabel} in the “Preview” tab to see it
            react
          </span>
        </div>
      )}
    </section>
  )
}
