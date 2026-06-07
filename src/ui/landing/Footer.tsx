// Footer — compact product footer: wordmark + tagline, links, GitHub.

import type { JSX } from 'react'
import { IconTerminal } from '../icons'

const GITHUB_URL = 'https://github.com/smokills/pimp-my-statusline'

export function Footer(): JSX.Element {
  return (
    <footer className="footer">
      <div className="container">
        <div className="stack-2">
          <span className="wordmark" style={{ fontSize: 'var(--fs-14)' }}>
            <span className="mark" aria-hidden="true" style={{ width: 24, height: 24 }}>
              <IconTerminal />
            </span>
            Pimp My Statusline
          </span>
          <span className="muted" style={{ fontSize: 'var(--fs-13)' }}>
            Built for Claude Code.
          </span>
        </div>

        <nav className="foot-links" aria-label="Footer">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
          <a href="#/build">Builder</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  )
}
