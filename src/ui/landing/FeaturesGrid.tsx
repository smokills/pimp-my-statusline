// FeaturesGrid — the "Build it visually. Install it anywhere." section: a 3×2 grid
// of rounded surface cards, each with an inline SVG icon, bold title and muted body.

import type { JSX } from 'react'
import {
  IconTerminal,
  IconLayout,
  IconSparkle,
  IconCode,
  IconPalette,
  IconRefresh,
} from '../icons'

const FEATURES: { icon: (p: { className?: string }) => JSX.Element; title: string; body: string }[] = [
  {
    icon: IconTerminal,
    title: 'Live terminal preview',
    body: 'Watch your statusline render in real time, byte-for-byte identical to the script you will install.',
  },
  {
    icon: IconLayout,
    title: 'Drag & drop rows',
    body: 'Drag elements between rows to build the layout, then drag whole rows to reorder them.',
  },
  {
    icon: IconSparkle,
    title: 'Reactive ASCII pets',
    body: 'Six little companions that change mood as your context, session or weekly usage climbs toward the limit.',
  },
  {
    icon: IconCode,
    title: 'Export bash · python · node',
    body: 'A short, hand-editable script you can read top to bottom. Copy it, run it, tweak it however you like.',
  },
  {
    icon: IconPalette,
    title: 'xterm-256 + threshold colors',
    body: 'Pick from the full 256-color palette, or color metrics by percentage with editable threshold breakpoints.',
  },
  {
    icon: IconRefresh,
    title: 'Re-import & autosave',
    body: 'Your work saves locally as you go, and you can paste any exported script back in to pick up editing.',
  },
]

export function FeaturesGrid(): JSX.Element {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-intro">
          <span className="eyebrow">Features</span>
          <h2>
            Build it visually. <span className="accent">Install it anywhere.</span>
          </h2>
          <p>A focused toolkit for Claude Code statuslines: live preview, full color control, reactive pets, readable exports.</p>
        </div>

        <div className="features">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <article className="feature card" key={f.title}>
                <span className="ficon" aria-hidden="true">
                  <Icon />
                </span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
