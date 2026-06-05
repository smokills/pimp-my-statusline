// BuildStrip — the GLOBAL zone under the builder preview, organized as a tab
// group: Builds · Pet · Settings · Preview. One panel is always visible
// (Builds preselected); the active tab is highlighted via the design system's
// segmented control. Everything config-wide lives here, while the sidebar
// stays strictly element-scoped (library ⇄ docked inspector).
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

type GlobalTab = 'builds' | 'pet' | 'settings' | 'data'

export function BuildStrip(): JSX.Element {
  const config = useConfigStore((s) => s.config)
  const replaceConfig = useConfigStore((s) => s.replaceConfig)
  const pet = useConfigStore((s) => s.config.pet)
  const defaultThresholds = useConfigStore((s) => s.config.global.defaultThresholds)
  const mock = useMockStore((s) => s.mock)
  const { toast } = useToast()
  const [tab, setTab] = useState<GlobalTab>('builds')

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

  // Status cues in the tab labels, so global state is readable at a glance:
  // the active pet and customized thresholds.
  const petStatus = pet.enabled
    ? (PETS.find((p) => p.id === pet.petId)?.label ?? pet.petId)
    : 'off'
  const factoryStops = useMemo(() => JSON.stringify(defaultThresholdStops()), [])
  const customThresholds = JSON.stringify(defaultThresholds) !== factoryStops

  const tabs: { key: GlobalTab; label: string }[] = [
    { key: 'builds', label: 'Builds' },
    { key: 'pet', label: `Pet · ${petStatus}` },
    { key: 'settings', label: `Settings${customThresholds ? ' · custom' : ''}` },
    { key: 'data', label: 'Preview' },
  ]

  return (
    <section className="build-strip" aria-label="Builds and global settings">
      <div className="segmented build-tabs" role="tablist" aria-label="Global controls">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`gtab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`gpanel-${t.key}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'builds' && (
        <div
          role="tabpanel"
          id="gpanel-builds"
          aria-labelledby="gtab-builds"
          className="build-panel"
        >
          <span className="comment">start from a prefab, then make it yours</span>
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
        </div>
      )}
      {tab === 'pet' && (
        <div role="tabpanel" id="gpanel-pet" aria-labelledby="gtab-pet" className="build-panel">
          <PetCard />
        </div>
      )}
      {tab === 'settings' && (
        <div
          role="tabpanel"
          id="gpanel-settings"
          aria-labelledby="gtab-settings"
          className="build-panel"
        >
          <SettingsCard />
        </div>
      )}
      {tab === 'data' && (
        <div role="tabpanel" id="gpanel-data" aria-labelledby="gtab-data" className="build-panel">
          <MockDataPanel />
        </div>
      )}
    </section>
  )
}
