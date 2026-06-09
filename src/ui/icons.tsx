// icons.tsx — inline SVG icon set (lucide-style, stroke-based). NO emoji.
// All icons inherit `currentColor` and size from the containing CSS (width/height
// set on the parent's `svg` rule), so callers just drop <Icon /> in.

import type { JSX, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function base(props: IconProps, children: JSX.Element): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconTerminal = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M4 17l6-6-6-6" />
      <path d="M12 19h8" />
    </>,
  )

export const IconLayout = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="11" height="6" rx="1.5" />
    </>,
  )

export const IconSparkle = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>,
  )

export const IconCode = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M8 18l-5-6 5-6" />
      <path d="M16 6l5 6-5 6" />
    </>,
  )

export const IconPalette = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M12 21a9 9 0 1 1 9-9c0 1.7-1.3 3-3 3h-1.5a1.5 1.5 0 0 0-1 2.6 1.5 1.5 0 0 1-1 2.4z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </>,
  )

export const IconRefresh = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>,
  )

export const IconCopy = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>,
  )

export const IconCheck = (p: IconProps): JSX.Element => base(p, <path d="M20 6L9 17l-5-5" />)

export const IconGitHub = (p: IconProps): JSX.Element => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
    <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7 0-.7 0-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.6.2-3.3 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.3.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z" />
  </svg>
)

export const IconArrowRight = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>,
  )

export const IconClose = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>,
  )

export const IconPlus = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>,
  )

export const IconPencil = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>,
  )

export const IconGrip = (p: IconProps): JSX.Element => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
    <circle cx="9" cy="6" r="1.4" />
    <circle cx="15" cy="6" r="1.4" />
    <circle cx="9" cy="12" r="1.4" />
    <circle cx="15" cy="12" r="1.4" />
    <circle cx="9" cy="18" r="1.4" />
    <circle cx="15" cy="18" r="1.4" />
  </svg>
)

export const IconDownload = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </>,
  )

export const IconUpload = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <path d="M12 21V9" />
      <path d="M7 14l5-5 5 5" />
      <path d="M5 3h14" />
    </>,
  )

// Sliders — the "Preview data" scrubber drawer trigger.
export const IconSliders = (p: IconProps): JSX.Element =>
  base(
    p,
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </>,
  )

// Window-control glyphs for OS chrome.
export const IconWinMin = (p: IconProps): JSX.Element => base(p, <path d="M5 12h14" />)
export const IconWinMax = (p: IconProps): JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false" {...p}>
    <rect x="5" y="5" width="14" height="14" rx="1" />
  </svg>
)
