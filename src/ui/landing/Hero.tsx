// Hero — centered marketing hero: badge pill, big headline with a green
// highlight, subtitle, dual CTA, and the live TerminalMockup demo.
//
// The demo renders the REAL default statusline (with the cactus pet enabled) via
// renderToAnsi, stepping the context % through a loop (12 → 34 → 58 → 83 → 96)
// on a 3s interval so the pet visibly changes mood. It is an instant swap, not
// an animation. Under prefers-reduced-motion the loop is paused and the 34%
// state is shown. The OS switcher above it teases the OS-chrome feature and is
// shared (useOsPref) with the builder.

import { useEffect, useMemo, useState, type JSX } from 'react'
import { defaultConfig } from '../../model/presets/defaultPreset'
import { typical } from '../../model/presets/mockPresets'
import type { MockData } from '../../model/mock'
import type { StatuslineConfig } from '../../model/types'
import { TerminalMockup } from '../TerminalMockup'
import { AnsiPreview } from '../AnsiPreview'
import { useOsPref } from '../useOsPref'
import { IconArrowRight, IconGitHub } from '../icons'

const GITHUB_URL = 'https://github.com/smokills/pimp-my-statusline'
const CTX_STEPS = [12, 34, 58, 83, 96]
const STEP_MS = 3000

// The hero config: the byte-faithful default, with the cactus pet turned on so
// it reacts to the cycling context %.
function heroConfig(): StatuslineConfig {
  const cfg = defaultConfig()
  return { ...cfg, pet: { ...cfg.pet, enabled: true } }
}

function mockAtContext(pct: number): MockData {
  const base = typical()
  const cw = base.context_window!
  return {
    ...base,
    context_window: { ...cw, used_percentage: pct, remaining_percentage: 100 - pct },
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function Hero(): JSX.Element {
  const { os, setOs } = useOsPref()
  const config = useMemo(heroConfig, [])

  // Step index into CTX_STEPS. Starts on the 34% state (index 1) so the static
  // reduced-motion view matches the "typical" preset.
  const [step, setStep] = useState(1)

  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = setInterval(() => setStep((s) => (s + 1) % CTX_STEPS.length), STEP_MS)
    return () => clearInterval(id)
  }, [])

  const mock = useMemo(() => mockAtContext(CTX_STEPS[step]), [step])

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
          <TerminalMockup os={os} onOsChange={setOs} showSwitcher title="~ — statusline">
            <AnsiPreview config={config} mock={mock} ariaLabel="Live demo statusline preview" />
          </TerminalMockup>
        </div>
      </div>
    </section>
  )
}
