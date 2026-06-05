// PetCard — the GLOBAL pet configuration, hosted in the build strip under the
// preview (behind the "Pet" expander), with the other config-wide controls.
// The pet is not an element: it has a master enable/disable toggle here, and
// when enabled it is ALWAYS drawn at the left of the statusline with the rows
// following to its right.
//
// Deliberately minimal: pick a pet, set the gap. Everything else is visible
// live in the terminal preview above (scrub the mock sliders and watch the pet
// react) — no duplicated mood preview here. The mood is driven by the context
// window percentage.

import type { JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { PETS } from '../pets/pets'

export function PetCard(): JSX.Element {
  const pet = useConfigStore((s) => s.config.pet)
  const updatePet = useConfigStore((s) => s.updatePet)

  return (
    <section className="card card-pad stack" aria-label="Pet settings">
      <div className="spread">
        <h3 className="section-head">Pet</h3>
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
          your context usage
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
            drawn at the left of the statusline; scrub ctx in “Sample data” to
            see it react
          </span>
        </div>
      )}
    </section>
  )
}
