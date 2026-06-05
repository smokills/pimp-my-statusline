# Redesign: product landing + builder (v2)

Vito rejected the PHOSPHOR CRT design. Reference: https://ui-ux-pro-max-skill.nextlevelbuilder.io/demo/developer-tools (classic dark developer-tools landing). Design driven by the **ui-ux-pro-max** skill database (NOT frontend-design).

## Design system (from ui-ux-pro-max `--design-system`)

- **Style:** Dark Mode (OLED) — clean, NOT cyberpunk/CRT. No scanlines, no chamfers, no glow-everything.
- **Colors:** bg `#0F172A` (midnight), surface `#1E293B`, secondary `#334155`, muted `#272F42`, border `#475569` (use sparingly — prefer `#1E293B/2E3A52` hairlines), fg `#F8FAFC`, accent/CTA **green `#22C55E`**, destructive `#EF4444`.
- **Typography:** JetBrains Mono everywhere (headings 600/700, body 400/500). Already self-hosted via @fontsource.
- **Effects:** minimal glow on green CTAs only (`text-shadow 0 0 10px` class), smooth 150-300ms transitions, border-radius BACK (8-12px cards, 6px buttons — this is NOT the terminal-discipline design), visible focus rings.
- **Landing pattern:** "Product Demo + Features" — 1. Hero, 2. Product mockup center, 3. Feature breakdown, 4. CTA.

## Architecture

- **Hash routing:** `/` → landing; `#/build` → full-screen builder. Tiny `useHashRoute` hook (testable pure parse fn). No router lib.
- **TerminalMockup** (new shared component): wraps the existing ANSI preview in OS window chrome with a **theme switcher: macOS / Windows / Linux**.
  - macOS: rounded-lg window, traffic lights (red/yellow/green dots) top-left, centered title.
  - Windows: square corners, title left, minimize/maximize/close glyphs right (✕ hover red).
  - Linux (GNOME-ish): rounded-md, dark adwaita-style headerbar, circular control buttons right.
  - Chrome only changes; the ANSI content area is identical. Choice persisted (localStorage, default macOS). Title shows `~ — statusline`-style text.

## Landing (`/`) — sections

1. **Nav** (sticky, blur backdrop): logo mark + "Pimp My Statusline", links Features / How it works / GitHub, CTA `Open the builder` (green).
2. **Hero** (centered): small badge pill ("6 reactive ASCII pets included"), H1 with green highlight span ("Your statusline, **pimped**." or similar — punchy English copy), subtitle (one sentence: visual builder for Claude Code statuslines, live preview, readable exports), dual CTA (`Open the builder` green / `View on GitHub` outline), below: **TerminalMockup demo** with the default+pet statusline rendered by the REAL renderToAnsi, mock data slowly cycling (context % sweeps so the pet changes mood — pause under reduced-motion; 3-4s interval steps, no fast animation) + the OS switcher visible above it (teases the feature).
3. **Stats bar:** `21 elements · 6 reactive pets · 3 export languages · byte-identical preview↔script` (green numbers, muted labels).
4. **Features grid** (6 cards, 3×2, rounded surface cards, lucide-style inline SVG icons — NO emoji): Live terminal preview / Drag & drop rows / Reactive ASCII pets / Export bash·python·node / xterm-256 + threshold colors / Re-import & autosave.
5. **How it works** (split, alternating): step 1 compose (mini screenshot or stylized row chips), step 2 watch it react (TerminalMockup with panic-state), step 3 export & install (REAL generated bash excerpt in a code block with copy).
6. **Final CTA band:** "Ready to pimp your statusline?" + green CTA + reassurance line (`free · no account · runs entirely in your browser`).
7. **Footer:** product name, GitHub link, "Built for Claude Code".

## Builder (`#/build`) — layout

- Slim top bar: logo (→ `/`), right: IMPORT / EXPORT buttons + language indicator.
- **Hero zone (sticky top):** centered TerminalMockup (max-w ~900px) with OS switcher; directly under it a compact horizontal **mock strip** (preset select + ctx/5h/7d sliders + expand toggle for the full MockDataPanel).
- **Editor zone below:** left = rows canvas (dnd unchanged: RowCanvas logic kept), right sidebar = ElementLibrary. Inspector opens as an overlay panel (modal-like card, NOT bottom drawer) anchored over the editor zone; Color256Picker/PetTab/DisplayTab logic all kept, restyled.
- Mobile (<760px): mockup sticky top (kept behavior), tabs below as today, restyled.

## Constraints

- KEEP UNTOUCHED: src/model, src/pets, src/preview (renderToAnsi/ansiToHtml), src/generators, all stores' logic (configStore/mockStore — visual-only changes), src/ui/lib helpers, all tests must stay green (422; +new for useHashRoute/OS-pref).
- REPLACE: theme/phosphor.css → theme/theme.css (new tokens); restructure App.tsx; restyle existing components; delete dead PHOSPHOR-only styles/components (PreviewBezel CRT chrome → TerminalMockup; TopBar → Nav/BuilderBar).
- A11y bar unchanged: keyboard dnd, focus rings, reduced-motion, aria mirrors, 44px targets.
- English copy. No new npm deps (inline SVG icons).
