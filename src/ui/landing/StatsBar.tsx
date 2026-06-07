// StatsBar — a four-stat row of big green numbers with muted labels.

import type { JSX } from 'react'

const STATS: { num: string; lbl: string }[] = [
  { num: '15', lbl: 'statusline elements' },
  { num: '6', lbl: 'reactive ASCII pets' },
  { num: '3', lbl: 'export languages' },
  { num: '1:1', lbl: 'preview = installed script' },
]

export function StatsBar(): JSX.Element {
  return (
    <section className="container" aria-label="By the numbers">
      <div className="stats">
        {STATS.map((s) => (
          <div className="stat" key={s.lbl}>
            <div className="num">{s.num}</div>
            <div className="lbl">{s.lbl}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
