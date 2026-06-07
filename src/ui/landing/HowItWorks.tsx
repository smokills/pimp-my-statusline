// HowItWorks — three alternating split steps:
//   1. Compose — stylized row chips of the default layout.
//   2. Watch it react — a TerminalMockup rendering the PANIC mock (everything red,
//      reset imminent) so the reactive coloring is obvious.
//   3. Export & install — a REAL generated bash excerpt (generate(defaultConfig(),
//      'bash') with the giant marker line dropped, trimmed to ~14 lines) in a code
//      block with a copy button.

import { useMemo, type JSX } from 'react'
import { generate } from '../../generators'
import { defaultConfig } from '../../model/presets/defaultPreset'
import { panic } from '../../model/presets/mockPresets'
import { TerminalMockup } from '../TerminalMockup'
import { AnsiPreview } from '../AnsiPreview'
import { detectOs } from '../detectOs'
import { useToast } from '../Toast'
import { IconCheck, IconCopy } from '../icons'

// Build a readable bash excerpt: drop the long base64 re-import marker (line 2),
// take the first ~14 meaningful lines of the actual generated script.
function bashExcerpt(): string {
  const lines = generate(defaultConfig(), 'bash').split('\n')
  // Line index 1 is the `# pimp-my-statusline:v1:<base64>` marker — drop it.
  const kept = lines.filter((_, i) => i !== 1)
  return kept.slice(0, 14).join('\n')
}

function ExcerptBlock({ code }: { code: string }): JSX.Element {
  const { toast } = useToast()
  const copy = async () => {
    try {
      // Copy the FULL script, not just the shown excerpt.
      await navigator.clipboard.writeText(generate(defaultConfig(), 'bash'))
      toast('copied statusline.sh to clipboard')
    } catch {
      toast('clipboard unavailable', 'warn')
    }
  }
  return (
    <div className="codeblock">
      <div className="codebar">
        <span>statusline.sh</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
          <IconCopy />
          Copy
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function HowItWorks(): JSX.Element {
  // Same OS chrome as every mockup on the page: the visitor's own.
  const os = useMemo(() => detectOs(), [])
  const excerpt = useMemo(bashExcerpt, [])
  const panicMock = useMemo(panic, [])
  const config = useMemo(defaultConfig, [])

  return (
    <section className="section" id="how" style={{ background: 'var(--muted-bg)' }}>
      <div className="container">
        <div className="section-intro">
          <span className="eyebrow">How it works</span>
          <h2>
            From blank canvas to <span className="accent">installed script</span>
          </h2>
          <p>Three steps. No build tooling, no account, no copy-pasting from a wiki.</p>
        </div>

        <div className="steps">
          {/* Step 1 — compose */}
          <div className="step">
            <div className="step-copy">
              <span className="step-num">1</span>
              <h3>Compose your layout</h3>
              <p>
                Drag elements from the library into rows. Mix directory, git, model, context and
                rate-limit metrics, separators and static text, arranged however you like.
              </p>
            </div>
            <div className="step-visual">
              <div className="card card-pad rowchips">
                <div className="rc-line">
                  <span className="rc">~/dev/project</span>
                  <span className="rc">main</span>
                </div>
                <div className="rc-line">
                  <span className="rc">────────────</span>
                </div>
                <div className="rc-line">
                  <span className="rc">Opus</span>
                  <span className="rc">high</span>
                  <span className="rc">34%</span>
                  <span className="rc">Session ███░░ 23%</span>
                  <span className="rc">Week ██░░░ 41%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 — watch it react */}
          <div className="step reverse">
            <div className="step-copy">
              <span className="step-num">2</span>
              <h3>Watch it react</h3>
              <p>
                The preview renders the exact bytes your script will print. As context or rate
                limits climb, threshold colors shift and your pet changes mood — here, the panic
                state with the reset imminent.
              </p>
              <ul className="checklist">
                <li>
                  <IconCheck />
                  Real ANSI rendering, not a mock-up
                </li>
                <li>
                  <IconCheck />
                  Threshold coloring by percentage
                </li>
                <li>
                  <IconCheck />
                  Pets react to the metric you choose
                </li>
              </ul>
            </div>
            <div className="step-visual">
              <TerminalMockup os={os} title="~ — panic">
                <AnsiPreview
                  config={config}
                  mock={panicMock}
                  ariaLabel="Statusline preview in the panic state"
                />
              </TerminalMockup>
            </div>
          </div>

          {/* Step 3 — export & install */}
          <div className="step">
            <div className="step-copy">
              <span className="step-num">3</span>
              <h3>Export &amp; install</h3>
              <p>
                Generate a clean, readable script in bash, python or node. Drop it in
                <code className="mono accent"> ~/.claude/</code>, point your settings at it, and you
                are done. The script carries a marker so you can re-import and keep editing.
              </p>
            </div>
            <div className="step-visual">
              <ExcerptBlock code={excerpt} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
