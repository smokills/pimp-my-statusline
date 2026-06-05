// TerminalMockup — the product centerpiece. Wraps arbitrary children (the ANSI
// preview lines) in an OS-accurate window chrome. The CONTENT is identical
// across OSes; only the chrome (corners, title alignment, window controls)
// changes. The OS is detected from the visitor's browser (detectOs) — callers
// pass it in so every mockup on the page agrees.
//
// Chrome details (lovingly accurate):
//   macOS  — rounded window, traffic lights (red #FF5F57 / yellow #FEBC2E /
//            green #28C840) top-left, centered title.
//   Windows— square-ish corners, title left, minimise / maximise / close glyphs
//            on the right, with the close button turning red on hover.
//   Linux  — GNOME/adwaita headerbar, bolder centered title, circular control
//            buttons on the right (close → red on hover).

import type { JSX, ReactNode } from 'react'
import type { OsKind } from './detectOs'
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

export function TerminalMockup({
  os,
  title = '~ — statusline',
  children,
}: {
  os: OsKind
  title?: string
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
    <div className="term-mockup" data-os={os}>
      {chrome}
      <div className="term-body">{children}</div>
    </div>
  )
}
