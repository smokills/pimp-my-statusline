// TerminalMockup — the product centerpiece. Wraps arbitrary children (the ANSI
// preview lines) in an OS-accurate window chrome. The CONTENT is identical
// across OSes; only the chrome (corners, title alignment, window controls)
// changes. An optional segmented switcher (macOS · Windows · Linux) flips the OS;
// the choice is owned by the caller (shared via useOsPref) so it persists and is
// the same in the landing demo and the builder.
//
// Chrome details (lovingly accurate):
//   macOS  — rounded window, traffic lights (red #FF5F57 / yellow #FEBC2E /
//            green #28C840) top-left, centered title.
//   Windows— square-ish corners, title left, minimise / maximise / close glyphs
//            on the right, with the close button turning red on hover.
//   Linux  — GNOME/adwaita headerbar, bolder centered title, circular control
//            buttons on the right (close → red on hover).

import type { JSX, ReactNode } from 'react'
import { OS_KINDS, OS_LABEL, type OsKind } from './useOsPref'
import {
  IconWinMin,
  IconWinMax,
  IconClose,
} from './icons'

function MacChrome({ title }: { title: string }): JSX.Element {
  return (
    <div className="term-bar">
      <div className="term-left">
        <span className="traffic" aria-hidden="true">
          <span className="light red" />
          <span className="light yellow" />
          <span className="light green" />
        </span>
      </div>
      <span className="term-title">{title}</span>
    </div>
  )
}

function WindowsChrome({ title }: { title: string }): JSX.Element {
  return (
    <div className="term-bar">
      <span className="term-title">{title}</span>
      <div className="term-winctl" aria-hidden="true">
        <span className="win-btn">
          <IconWinMin />
        </span>
        <span className="win-btn">
          <IconWinMax />
        </span>
        <span className="win-btn close">
          <IconClose />
        </span>
      </div>
    </div>
  )
}

function LinuxChrome({ title }: { title: string }): JSX.Element {
  return (
    <div className="term-bar">
      <div className="term-left" />
      <span className="term-title">{title}</span>
      <div className="term-right">
        <span className="gnome-ctl" aria-hidden="true">
          <span className="gnome-btn close">
            <IconClose />
          </span>
        </span>
      </div>
    </div>
  )
}

export function OsSwitcher({
  os,
  onOsChange,
}: {
  os: OsKind
  onOsChange: (os: OsKind) => void
}): JSX.Element {
  return (
    <div className="os-switch">
      <div className="segmented" role="group" aria-label="Window style: macOS, Windows, or Linux">
        {OS_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={os === k}
            onClick={() => onOsChange(k)}
          >
            {OS_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TerminalMockup({
  os,
  onOsChange,
  title = '~ — statusline',
  showSwitcher = false,
  children,
}: {
  os: OsKind
  onOsChange?: (os: OsKind) => void
  title?: string
  /** Render the OS switcher above the window (only when onOsChange is given). */
  showSwitcher?: boolean
  children: ReactNode
}): JSX.Element {
  const chrome =
    os === 'windows' ? (
      <WindowsChrome title={title} />
    ) : os === 'linux' ? (
      <LinuxChrome title={title} />
    ) : (
      <MacChrome title={title} />
    )

  return (
    <div>
      {showSwitcher && onOsChange && <OsSwitcher os={os} onOsChange={onOsChange} />}
      <div className="term-mockup" data-os={os}>
        {chrome}
        <div className="term-body">{children}</div>
      </div>
    </div>
  )
}
