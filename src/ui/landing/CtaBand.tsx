// CtaBand — the final call-to-action band: a soft-glow card with the headline,
// dual CTA, and a reassurance microcopy line.

import type { JSX } from 'react'
import { IconArrowRight, IconGitHub } from '../icons'

const GITHUB_URL = 'https://github.com/smokills/pimp-my-statusline'

export function CtaBand(): JSX.Element {
  return (
    <section className="cta-band">
      <div className="container">
        <div className="cta-card">
          <h2>
            Ready to pimp your <span className="hl">statusline</span>?
          </h2>
          <div className="hero-ctas" style={{ marginBottom: 0 }}>
            <a href="#/build" className="btn btn-primary btn-lg">
              Start building
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
          <p>free · no account · runs entirely in your browser</p>
        </div>
      </div>
    </section>
  )
}
