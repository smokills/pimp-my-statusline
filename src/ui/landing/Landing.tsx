// Landing — the marketing page at '/'. Composes the sections in order:
// Nav · Hero (live demo) · StatsBar · FeaturesGrid · HowItWorks · CtaBand · Footer.

import type { JSX } from 'react'
import { Nav } from './Nav'
import { Hero } from './Hero'
import { StatsBar } from './StatsBar'
import { FeaturesGrid } from './FeaturesGrid'
import { HowItWorks } from './HowItWorks'
import { Faq } from './Faq'
import { CtaBand } from './CtaBand'
import { Footer } from './Footer'

export function Landing(): JSX.Element {
  return (
    <div className="app">
      <a className="skip-link" href="#features">
        Skip to features
      </a>
      <Nav />
      <main>
        <Hero />
        <StatsBar />
        <FeaturesGrid />
        <HowItWorks />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </div>
  )
}
