// BuildStrip — the prefab-build gallery under the builder preview. Each card is
// a complete statusline config (model/presets/builds) rendered as a live mini
// terminal thumbnail against the CURRENT mock data; clicking it replaces the
// whole canvas with that build (preserving the user's export-language choice).
// The mock-session controls live behind the "Sample data" expander on the right
// so the strip's primary identity is composing, not scrubbing.

import { useMemo, useState, type JSX } from 'react'
import { BUILDS, type BuildPreset } from '../model/presets/builds'
import type { StatuslineConfig } from '../model/types'
import { renderToAnsi } from '../preview/renderToAnsi'
import { AnsiLine } from '../preview/ansiToHtml'
import { useConfigStore } from '../store/configStore'
import { useMockStore } from '../store/mockStore'
import { MockDataPanel } from './MockDataPanel'
import { useToast } from './Toast'

export function BuildStrip(): JSX.Element {
  const config = useConfigStore((s) => s.config)
  const replaceConfig = useConfigStore((s) => s.replaceConfig)
  const mock = useMockStore((s) => s.mock)
  const { toast } = useToast()
  const [showData, setShowData] = useState(false)

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

  return (
    <section className="build-strip" aria-label="Prefab builds">
      <div className="build-strip-head">
        <div>
          <h2 className="section-head">Builds</h2>
          <span className="comment"> — start from a prefab, then make it yours</span>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          aria-expanded={showData}
          onClick={() => setShowData((v) => !v)}
        >
          {showData ? 'Hide sample data' : 'Sample data'}
        </button>
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

      {showData && (
        <div className="build-data-body">
          <MockDataPanel />
        </div>
      )}
    </section>
  )
}
