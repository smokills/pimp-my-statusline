// Faq — objection-handling Q&A as native <details> accordions (no JS, keyboard
// accessible for free). The same questions are mirrored in the README and in
// the FAQPage JSON-LD inside index.html: keep the three in sync.

import type { JSX } from 'react'

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do I need an account or an install?',
    a: 'No. The builder runs entirely in your browser and your work saves locally as you go. The only thing that ever leaves the page is the script you choose to export.',
  },
  {
    q: 'Can I trust the generated script?',
    a: 'Read it before you install it: the export is a short, commented script that reads the session JSON Claude Code pipes in and prints your statusline. No network calls, no telemetry, nothing else.',
  },
  {
    q: 'What does the script need to run?',
    a: 'The bash export needs jq; the python and node exports use the standard library only. All three run on macOS and Linux.',
  },
  {
    q: 'How do I install the exported script?',
    a: 'Save it in ~/.claude/, then point the statusLine command in ~/.claude/settings.json at it. The export modal shows the exact snippet for your language.',
  },
  {
    q: 'Can I change my statusline later?',
    a: 'Yes. Your config persists in the browser, and every exported script embeds a re-import marker: paste the script back into the builder to resume editing exactly where you left off.',
  },
]

export function Faq(): JSX.Element {
  return (
    <section className="section" id="faq">
      <div className="container">
        <div className="section-intro">
          <span className="eyebrow">FAQ</span>
          <h2>
            Common <span className="accent">questions</span>
          </h2>
        </div>

        <div className="faq">
          {FAQS.map((f) => (
            <details className="faq-item card" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
