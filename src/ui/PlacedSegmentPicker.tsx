// PlacedSegmentPicker — a compact, row-grouped, tappable list of placed segments
// shown in the inspector's ELEMENT tab when nothing is selected. This is the
// mobile selection path (the canvas is hidden on the STYLE tab), but it is
// harmless and helpful on desktop too. Tapping a row's segment selects it.

import type { JSX } from 'react'
import { useConfigStore } from '../store/configStore'
import { SEGMENTS } from '../model/segments'
import { primaryStyle, variantGlyphs } from './lib/library'
import { styleSwatchHex } from './lib/color'

export function PlacedSegmentPicker(): JSX.Element {
  const rows = useConfigStore((s) => s.config.rows)
  const selectSegment = useConfigStore((s) => s.selectSegment)

  const empty = rows.every((r) => r.segments.length === 0)

  return (
    <div className="stack">
      <span className="term-comment">// select an element to edit it</span>
      {empty ? (
        <span className="term-comment">// no elements yet — switch to BUILD to add some</span>
      ) : (
        rows.map((row, i) =>
          row.segments.length === 0 ? null : (
            <div key={row.id} className="stack-2">
              <span className="label" style={{ color: 'var(--phosphor-dim)' }}>
                row {i + 1}
              </span>
              <div className="row-flex">
                {row.segments.map((seg) => {
                  const glyphs = variantGlyphs(seg)
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      className="chip"
                      style={{ opacity: seg.enabled ? 1 : 0.5 }}
                      onClick={() => selectSegment(seg.id)}
                      aria-label={`edit ${SEGMENTS[seg.type].label}`}
                    >
                      <span
                        className="swatch"
                        style={{ background: styleSwatchHex(primaryStyle(seg)) }}
                        aria-hidden="true"
                      />
                      <span>{SEGMENTS[seg.type].label}</span>
                      {glyphs && (
                        <span className="glyphs" aria-hidden="true">
                          {glyphs}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ),
        )
      )}
    </div>
  )
}
