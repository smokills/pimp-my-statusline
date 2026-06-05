// Nav — sticky landing navigation with blur backdrop: wordmark, anchor links,
// and the green "Open the builder" CTA. On mobile the text links collapse
// (.nav-links hidden) leaving the wordmark + a compact CTA group.

import type { JSX } from 'react'
import { IconTerminal, IconGitHub, IconArrowRight } from '../icons'

const GITHUB_URL = 'https://github.com/smokills/pimp-my-statusline'

export function Nav(): JSX.Element {
  return (
    <header className="nav">
      <div className="container">
        <a href="#/" className="wordmark" aria-label="Pimp My Statusline — home">
          <span className="mark" aria-hidden="true">
            <IconTerminal />
          </span>
          <span>
            Pimp My <span className="accent">Statusline</span>
          </span>
        </a>

        <nav className="nav-links" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
          <a href="#/build" className="btn btn-primary btn-sm">
            Open the builder
            <IconArrowRight />
          </a>
        </nav>

        {/* Mobile-only compact actions (shown when .nav-links is hidden). */}
        <div className="nav-mobile" style={{ marginLeft: 'auto', display: 'none', gap: 'var(--sp-2)' }}>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="icon-btn"
            aria-label="GitHub repository"
          >
            <IconGitHub />
          </a>
          <a href="#/build" className="btn btn-primary btn-sm">
            Build
          </a>
        </div>
      </div>
    </header>
  )
}
