// Hero — centered marketing hero: badge pill, big headline with a green
// highlight, subtitle, dual CTA, and the live TerminalMockup demo.
//
// The demo renders the REAL default statusline (with the cactus pet enabled) via
// renderToAnsi, stepping through a loop of climbing scenarios on a 3s interval:
// context, 5h session and 7d week ALL rise together, so every gauge moves and
// the pet visibly changes mood (not just the context bar). It is an instant
// swap, not an animation. Under prefers-reduced-motion the loop is paused and a
// mid scenario is shown. The window chrome matches the visitor's OS (detectOs)
// so the mockup reads as THEIR terminal.

import { useEffect, useMemo, useState, type JSX } from 'react'
import { defaultConfig } from '../../model/presets/defaultPreset'
import { typical } from '../../model/presets/mockPresets'
import type { MockData } from '../../model/mock'
import type { StatuslineConfig } from '../../model/types'
import { TerminalMockup } from '../TerminalMockup'
import { AnsiPreview } from '../AnsiPreview'
import { detectOs } from '../detectOs'
import { IconArrowRight, IconGitHub } from '../icons'

const GITHUB_URL = 'https://github.com/smokills/pimp-my-statusline'
// Each scenario climbs all three meters together (context %, 5h session %, 7d
// week %). Index 1 is the calm "typical" state shown under reduced motion.
const SCENARIOS: { ctx: number; session: number; week: number }[] = [
  { ctx: 12, session: 8, week: 20 },
  { ctx: 34, session: 28, week: 41 },
  { ctx: 58, session: 55, week: 63 },
  { ctx: 83, session: 79, week: 86 },
  { ctx: 96, session: 94, week: 98 },
]
const STEP_MS = 3000

// The hero config: the byte-faithful default, with the cactus pet turned on so
// it reacts to the cycling context %.
function heroConfig(): StatuslineConfig {
  const cfg = defaultConfig()
  return { ...cfg, pet: { ...cfg.pet, enabled: true } }
}

function mockForScenario(s: { ctx: number; session: number; week: number }): MockData {
  const base = typical()
  const cw = base.context_window!
  const rl = base.rate_limits!
  return {
    ...base,
    context_window: { ...cw, used_percentage: s.ctx, remaining_percentage: 100 - s.ctx },
    rate_limits: {
      five_hour: { ...rl.five_hour!, used_percentage: s.session },
      seven_day: { ...rl.seven_day!, used_percentage: s.week },
    },
  }
}

export function Hero(): JSX.Element {
  const os = useMemo(() => detectOs(), [])
  const config = useMemo(heroConfig, [])

  // Step index into SCENARIOS. Starts on the calm state (index 1) so the static
  // reduced-motion view matches the "typical" preset.
  const [step, setStep] = useState(1)

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    let id: ReturnType<typeof setInterval> | null = null
    const sync = () => {
      if (mq.matches) {
        if (id !== null) clearInterval(id)
        id = null
        setStep(1) // freeze on the calm "typical" scenario
      } else if (id === null) {
        id = setInterval(() => setStep((s) => (s + 1) % SCENARIOS.length), STEP_MS)
      }
    }
    sync()
    mq.addEventListener('change', sync)
    return () => {
      mq.removeEventListener('change', sync)
      if (id !== null) clearInterval(id)
    }
  }, [])

  const mock = useMemo(() => mockForScenario(SCENARIOS[step]), [step])

  return (
    <section className="hero">
      <div className="container">
        <span className="pill">
          <span className="dot" aria-hidden="true" />6 reactive ASCII pets included
        </span>

        <h1>
          Your statusline, <span className="hl">pimped</span>.
        </h1>

        <p className="hero-sub">
          A visual builder for Claude Code statuslines. Drag elements into place, watch a live
          terminal preview react to your session, and export a clean, readable script for bash,
          python or node.
        </p>

        <div className="hero-ctas">
          <a href="#/build" className="btn btn-primary btn-lg">
            Open the builder
            <IconArrowRight />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-outline btn-lg"
          >
            <IconGitHub />
            View on GitHub
          </a>
        </div>

        <div className="hero-demo">
          <TerminalMockup os={os} title="~ — statusline">
            <AnsiPreview config={config} mock={mock} ariaLabel="Live demo statusline preview" />
          </TerminalMockup>
        </div>
      </div>
    </section>
  )
}
