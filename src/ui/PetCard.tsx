// PetCard — the STANDALONE global pet configuration, hosted in the builder
// sidebar above the element library. The pet is not an element: it has a
// master enable/disable toggle here, and when enabled it is ALWAYS drawn at
// the left of the statusline with the rows following to its right.
//
// Deliberately minimal: pick a pet, set the gap. Everything else is visible
// live in the terminal preview above (drag the mock sliders and watch the pet
// react) — no duplicated mood preview here. The mood is driven by the context
// window percentage.

import type { JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { PETS } from '../pets/pets'

export function PetCard(): JSX.Element {
  const pet = useConfigStore((s) => s.config.pet)
  const updatePet = useConfigStore((s) => s.updatePet)

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
          your context usage
        </span>
      )}

      {pet.enabled && (
        <div className="stack">
          <div className="stack-2">
            <span className="label">roster</span>
            <div className="stack-2 scroll-y" style={{ maxHeight: 240, paddingRight: 4 }}>
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

          <span className="comment">
            drawn at the left of the statusline; scrub the ctx slider above to
            see it react
          </span>
        </div>
      )}
    </section>
  )
}
