// BuildStrip — the GLOBAL zone under the builder preview. Its head is the
// global control bar: prefab builds on the left, and the config-wide expanders
// on the right — Pet, Settings (default thresholds) and Sample data — so
// everything that isn't element-scoped lives here, while the sidebar stays
// strictly element-scoped (library ⇄ docked inspector).
//
// Each build card is a complete statusline config (model/presets/builds)
// rendered as a live mini terminal thumbnail against the CURRENT mock data;
// clicking it replaces the whole canvas with that build (preserving the user's
// export-language choice).

import { useMemo, useState, type JSX } from 'react'
import { BUILDS, type BuildPreset } from '../model/presets/builds'
import type { StatuslineConfig } from '../model/types'
import { renderToAnsi } from '../preview/renderToAnsi'
import { AnsiLine } from '../preview/ansiToHtml'
import { useConfigStore } from '../store/configStore'
import { useMockStore } from '../store/mockStore'
import { defaultThresholdStops } from '../model/segments'
import { PETS } from '../pets/pets'
import { MockDataPanel } from './MockDataPanel'
import { PetCard } from './PetCard'
import { SettingsCard } from './SettingsCard'
import { useToast } from './Toast'

type Expander = 'pet' | 'settings' | 'data' | null

export function BuildStrip(): JSX.Element {
  const config = useConfigStore((s) => s.config)
  const replaceConfig = useConfigStore((s) => s.replaceConfig)
  const pet = useConfigStore((s) => s.config.pet)
  const defaultThresholds = useConfigStore((s) => s.config.global.defaultThresholds)
  const mock = useMockStore((s) => s.mock)
  const presetName = useMockStore((s) => s.presetName)
  const { toast } = useToast()
  // One global expander at a time keeps the zone tidy (they are peers).
  const [expanded, setExpanded] = useState<Expander>(null)
  const toggle = (k: Exclude<Expander, null>) => setExpanded((v) => (v === k ? null : k))

  // A build is "active" when the canvas equals it verbatim (language aside —
  // that's an export preference, not layout). On first load the persisted
  // default config matches Classic, so Classic starts highlighted.
  const configJson = useMemo(() => JSON.stringify(config), [config])
  const cards = useMemo(
    () =>
      BUILDS.map((build) => {
        const cfg: StatuslineConfig = { ...build.make(), language: config.language }
        return {
          build,
          lines: renderToAnsi(cfg, mock),
          active: JSON.stringify(cfg) === configJson,
        }
      }),
    [mock, configJson, config.language],
  )
  const isCustom = !cards.some((c) => c.active)

  function apply(build: BuildPreset): void {
    // Only guard when the canvas holds custom work — switching between
    // untouched prefabs is lossless, so it stays one click.
    if (
      isCustom &&
      !window.confirm(`Replace your current statusline with the “${build.name}” build?`)
    ) {
      return
    }
    replaceConfig({ ...build.make(), language: config.language })
    toast(`“${build.name}” build applied`)
  }

  // Status cues on the expander buttons, so global state is readable without
  // opening anything: the active pet, customized thresholds, the mock preset.
  const petStatus = pet.enabled
    ? (PETS.find((p) => p.id === pet.petId)?.label ?? pet.petId)
    : 'off'
  const factoryStops = useMemo(() => JSON.stringify(defaultThresholdStops()), [])
  const customThresholds = JSON.stringify(defaultThresholds) !== factoryStops

  return (
    <section className="build-strip" aria-label="Prefab builds and global settings">
      <div className="build-strip-head">
        <div>
          <h2 className="section-head">Builds</h2>
          <span className="comment"> — start from a prefab, then make it yours</span>
        </div>
        {/* Config-wide expanders (NOT element-scoped — those live in the sidebar). */}
        <div className="build-strip-actions">
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={expanded === 'pet'}
            aria-controls="global-pet"
            onClick={() => toggle('pet')}
          >
            Pet · {petStatus}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={expanded === 'settings'}
            aria-controls="global-settings"
            onClick={() => toggle('settings')}
          >
            Settings{customThresholds ? ' · custom' : ''}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={expanded === 'data'}
            aria-controls="global-data"
            onClick={() => toggle('data')}
          >
            Sample data · {presetName}
          </button>
        </div>
      </div>

      <div className="build-cards">
        {cards.map(({ build, lines, active }) => (
          <button
            key={build.id}
            type="button"
            className="build-card"
            aria-pressed={active}
            onClick={() => apply(build)}
          >
            <pre className="build-mini" aria-hidden="true">
              {lines.map((line, i) => (
                <div key={i}>
                  <AnsiLine line={line} />
                </div>
              ))}
            </pre>
            <span className="build-name">{build.name}</span>
            <span className="build-blurb">{build.blurb}</span>
          </button>
        ))}
      </div>

      {/* The ids tie each panel to its aria-controls trigger above; the cards
          inside are <section aria-label>s, i.e. already named regions. */}
      {expanded === 'pet' && (
        <div id="global-pet" className="build-data-body">
          <PetCard />
        </div>
      )}
      {expanded === 'settings' && (
        <div id="global-settings" className="build-data-body">
          <SettingsCard />
        </div>
      )}
      {expanded === 'data' && (
        <div id="global-data" className="build-data-body">
          <MockDataPanel />
        </div>
      )}
    </section>
  )
}
