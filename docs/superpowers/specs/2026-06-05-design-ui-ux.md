Write isn't available as a tool in this read-only session — but the plan-mode instructions said I may write to the designated plan file. Let me check whether I can use it. Given the harness is read-only and Write is not exposed, I'll return my complete design as my final message (which is what the calling script expects per my instructions). Here is the full UI/UX and visual direction design.

---

# Pimp My Statusline — UI/UX & Visual Direction

## 0. Database grounding (entries I picked)

All picks are cited from `/home/vito/.claude/plugins/marketplaces/ui-ux-pro-max-skill/src/ui-ux-pro-max/data/`:

- **Style** `styles.csv #80 "Cyberpunk Mobile HUD"` — chamfered 45° corners, scanline overlay, CRT flicker, HUD corner brackets, prompt-style inputs, neon glow. This is the structural spine of the concept (adapted to desktop web).
- **Style** `styles.csv #73 "Terminal CLI"` — ASCII borders (`+ - | *`), bracketed buttons `[ EXECUTE ]`, blinking block cursor, text progress bars `[#####-----]`, boot sequence splash. This drives the chrome and microcopy.
- **Style** `styles.csv #11 "Retro-Futurism"` — CRT scanlines + neon glow vocabulary, used sparingly so we don't tip into kitsch.
- **Color** `colors.csv #87 "Autonomous Drone Fleet Manager"` — the PRIMARY palette: terminal green `#00FF41` / `#008F11` on GitHub-grade dark `#0D1117`, card `#182424`, border `#30363D`, alert `#FF3333`. Chosen over the pure-black #80 because `#0D1117` is easier on the eyes for a tool people stare at while configuring, and it reads as "developer console" rather than "Hollywood hacker."
- **Color** `colors.csv #80 "Cybersecurity Platform"` — donates the OLED-black variant and the amber/red accents for the threshold scale.
- **Typography** `typography.csv #56 "Kinetic Motion"` — **Syncopate** (display) — wide, mechanical, futuristic; used only for the wordmark and section headers.
- **Typography** `typography.csv #61 "Terminal CLI Monospace"` + `#9 "Developer Mono"` — **JetBrains Mono** as the workhorse UI mono and **IBM Plex Sans** for any longer prose (install instructions, tooltips) where mono hurts readability.
- **UX** `ux-guidelines.csv` #9/#99 (reduced motion), #36/#76 (4.5:1 contrast), #22/#23 (44px targets, 8px spacing), #28/#41 (focus rings, keyboard nav), #79 (empty states).

The critical constraint that shapes everything: the product *is* a terminal artifact. The concept leans terminal/CRT, but deliberately **avoids** the generic neon-purple-on-black "hacker" cliché by anchoring on phosphor green + GitHub-dark and treating it like a precision instrument, not a movie prop.

---

## 1. Concept & Visual Direction — **"PHOSPHOR / The Statusline Workbench"**

A CRT phosphor terminal reimagined as a modern instrument panel. Think: an oscilloscope, a 1980s amber/green monitor, and a modern code editor had a child. Everything is rendered as if it lives *inside* a terminal, but the layout discipline is contemporary (clear grid, generous spacing, no clutter). The hook: **the app chrome and the thing you're building are the same material** — you're configuring a terminal display, inside a terminal-styled app, with a live terminal preview. The medium is the message.

### Exact palette (CSS custom properties)

```
/* Surfaces (from colors.csv #87) */
--bg:            #0D1117;   /* app background — GitHub dark, low-fatigue */
--bg-deep:       #090C10;   /* recessed wells, preview terminal interior */
--surface:       #161B22;   /* panels */
--surface-2:     #182424;   /* cards (card color from #87), slightly green-shifted */
--border:        #30363D;   /* hairlines, panel dividers */
--border-glow:   #1F3D2A;   /* faint green border on focused/active panels */

/* Phosphor foreground scale */
--phosphor:      #00FF41;   /* PRIMARY accent — terminal green (#87 primary) */
--phosphor-dim:  #008F11;   /* secondary green (#87 secondary) — labels, idle */
--phosphor-deep: #0A2912;   /* filled-bar background track tint */
--fg:            #E6EDF3;   /* default text (#87 foreground) */
--fg-muted:      #94A3B8;   /* muted text (#87 muted-fg) */

/* Threshold scale — mirrors the user's statusline.sh color() fn exactly */
--ok:            #00FF41;   /* < 70%  (green)  */
--warn:          #FFB000;   /* 70–89% (amber, from styles.csv #73 amber) */
--crit:          #FF3333;   /* >= 90% (red, #87 destructive) */

/* Per-element default colors echoing statusline.sh */
--accent-dir:    #4C8DFF;   /* bold-blue directory (ANSI 1;34 analog) */
--accent-branch: #3FB950;   /* bold-green branch (ANSI 1;32 analog) */
--accent-session:#39D0D8;   /* cyan Session (ANSI 36) */
--accent-week:   #C586E0;   /* magenta Week (ANSI 35) */
```

The threshold trio (`--ok/--warn/--crit`) is deliberately the same green/amber/red the user's own `color()` function emits at the 70/90 breakpoints — so the configurator UI and the generated output speak the same color language.

### Typography (Google Fonts)

- **Display / wordmark / section headers:** `Syncopate` (400, 700) — wide-tracked, mechanical. Used at large sizes only.
- **UI workhorse + all data/labels:** `JetBrains Mono` (400, 500; 400 italic) — sizes locked to a strict scale `12 / 13 / 14 / 16 / 20` (per `typography.csv #61` "strict sizes" rule). Uppercase for all section labels and buttons.
- **Prose fallback** (install steps, long tooltips, error explanations): `IBM Plex Sans` (400, 600) — used sparingly where mono harms readability.

Import: `Syncopate:wght@400;700`, `JetBrains+Mono:ital,wght@0,400;0,500;1,400`, `IBM+Plex+Sans:wght@400;600`.

### Texture / effects

- **Scanlines:** a single fixed full-viewport overlay `<div aria-hidden>` — `repeating-linear-gradient(transparent 0 2px, rgba(0,0,0,0.18) 2px 3px)`, `pointer-events:none`, opacity `0.05` (from `styles.csv #73`). Toggleable in a Display menu; **off** under `prefers-reduced-motion` and behind a "CRT FX" switch defaulting ON for desktop, OFF for mobile.
- **Phosphor glow:** active accents get `text-shadow: 0 0 6px rgba(0,255,65,0.35)`; primary buttons get `box-shadow: 0 0 0 1px var(--phosphor), 0 0 12px rgba(0,255,65,0.18)`. Used only on the *active* element — restraint is what keeps it from looking generated.
- **Chamfered corners** (`styles.csv #80`): panels use a 45° corner notch via `clip-path: polygon(...)` at 8px, instead of border-radius. Border-radius is **0 everywhere** (terminal discipline). Each major panel wears HUD corner brackets (`┌ ┐ └ ┘` rendered as pseudo-elements).
- **Bezel:** the live preview sits inside a faux-CRT bezel — a `--surface` frame with an inner `inset` shadow and a tiny green "power LED" dot + scanline-only interior.
- **No emoji in chrome** — consistent with the pet's hard ASCII-only constraint. Iconography is drawn from Lucide at 1.5px stroke, tinted `--phosphor-dim`, OR ASCII glyphs where it fits the bit (e.g. `▸`, `■`, `▤`).

### Motion language

- **Boot sequence** on first load: a 700ms fake log scroll (`> initializing palette...`, `> mounting element registry...`, `> READY`) then the UI fades in. Skipped entirely under reduced-motion (instant render).
- **Blinking block cursor** (`▋`) at 530ms in the preview and in text inputs (`styles.csv #73` 500ms blink).
- **Typewriter reveal** when the preview re-renders after a config change — each changed row re-types in ~120ms. Reduced-motion → instant swap.
- **Everything else is snappy:** 120–160ms ease-out transitions, no parallax, no scroll-jacking (`ux #99`). Drag uses a subtle lift + green outline, not bounce.

---

## 2. Layout

Desktop is a **three-zone instrument panel**: a left tool rail (element library), a center canvas (row arranger + the inspector docks to the right of the selected element), and a **persistent right column that is the live CRT preview** + the mock-data scrubber. The preview is sticky so it never leaves the viewport while you edit — the whole point is watching it react.

### Desktop wireframe (≥1100px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  ▌ PIMP MY STATUSLINE        ~/statusline · v0.1     [ IMPORT ]  [ EXPORT ▸ ]  ⚙ FX  ▤ │  ← top bar (Syncopate wordmark left)
├───────────────┬──────────────────────────────────────────────┬─────────────────────────┤
│ ELEMENT LIB   │  ROWS — drag to arrange                       │  ┌─ LIVE PREVIEW ──────┐ │
│ ┌───────────┐ │                                               │  │·                    │ │ ← CRT bezel, power LED
│ │ search ▋  │ │  ┌── ROW 1 ───────────────────────[ + ]──┐    │  │ ~/dev/pms  main     │ │
│ └───────────┘ │  │ [▤ directory] [git branch]            │    │  │ ───────────────     │ │
│               │  └───────────────────────────────────────┘    │  │ Opus high 12%  Ses..│ │
│ CONTEXT       │  ┌── ROW 2 ───── separator ──────[ + ]──┐    │  │ (^.^)  Week ▓▓░ 41% │ │ ← pet flanks rows
│  · context %  │  │ [──────── separator ────────]         │    │  └─────────────────────┘ │
│  · ctx gauge  │  └───────────────────────────────────────┘    │                          │
│  · 5h session │  ┌── ROW 3 ─────────────────────[ + ]──┐    │  MOCK SESSION ───────────│
│  · 7d week    │  │ [model] [effort] [ctx%] [session bar] │    │  ctx     ▕────●───▏ 12%  │
│  · peak/off   │  │ [week bar] [peak]                     │    │  5h      ▕──●─────▏ 23%  │
│ SESSION       │  └───────────────────────────────────────┘    │  7d      ▕────●───▏ 41%  │
│  · cost $     │                                               │  clock   ▕─●──────▏ 06:14│
│  · duration   │     ┌──────────────────────────────────┐     │  [PEAK]  model ▾  effort▾│
│  · lines ±    │     │  + ADD ROW                         │     │  ░ randomize  ↺ reset    │
│ META …        │     └──────────────────────────────────┘     │                          │
│  (collapsed)  │                                               │  Preview width: ▕──●──▏  │
├───────────────┴───────────────────────────────────────────────┴─────────────────────────┤
│  INSPECTOR (slides up from bottom when an element is selected — see §3)                   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Inspector placement decision:** rather than a cramped third sidebar, the inspector is a **bottom drawer** (≈320px tall) that slides up when an element chip is selected, spanning the canvas + library width but leaving the preview column fully visible. This keeps the preview unobstructed (you tweak a color, you see it change in the same eyeful) and gives the 256-color grid room to breathe. Closing it (Esc or click-away) returns the canvas to full height. The **pet selector** lives as a full-width tab inside this same drawer (tabs: `ELEMENT · PET · DISPLAY`), so the pet's live-mood preview can borrow the wide horizontal space.

**Export** is a full-screen modal (`§3`). **Import** is a smaller modal.

### Mobile (<760px)

Three zones collapse into a **stacked, tab-switched** layout with the preview pinned:

- A **sticky mini-preview** docks to the top (the CRT bezel, ~3 rows tall, horizontally scrollable). It stays visible while you scroll the editor below it. Tap to expand full-screen.
- Below it, a segmented control: `BUILD · STYLE · PET · EXPORT`.
  - **BUILD** = row arranger (vertical list, drag handles enlarged to 44px) + a bottom-sheet element library invoked by a `[ + ADD ELEMENT ]` button.
  - **STYLE** = the selected element's inspector as a full-screen sheet.
  - **PET / EXPORT** as full sheets.
- The mock-data scrubber becomes a collapsible accordion under the mini-preview.
- CRT FX (scanlines/glow) default **off** on mobile for performance and battery (`styles.csv #73` notes OLED but we keep it lean). All touch targets ≥44px, ≥8px apart (`ux #22/#23`).

---

## 3. Interaction Design

### Add / remove element
- Library items are **bracketed chips** `[ context % ]`. Click (or Enter when focused) appends to the **currently focused row** (or row 1 if none). A 120ms typewriter pulse confirms it in the preview.
- Each library item already present in the layout shows a dim `✓ placed` tag and a count; clicking again is allowed only for elements that make sense duplicated (separator, custom text) — others are disabled with tooltip "already in layout."
- Remove: hover a placed chip → an `✕` appears top-right (44px hit area); or select it and press Delete/Backspace. Removal animates the chip collapsing and the preview re-typing.

### Drag to reorder — within & between rows (dnd-kit)
- Library: `@dnd-kit/core` + `@dnd-kit/sortable`. Each row is a horizontal sortable context; the canvas is a `DndContext` so chips can cross row boundaries. Rows themselves are vertically sortable (drag the row's `⋮⋮` handle to reorder rows).
- Drag affordance: chip lifts (`translateY(-2px)`, green outline `box-shadow: 0 0 0 1px var(--phosphor)`), the drop target row shows a blinking insertion caret `▏`. Empty rows show a dashed `drop here` well.
- **Keyboard DnD (required, not optional):** dnd-kit `KeyboardSensor` with `sortableKeyboardCoordinates`. Flow: Tab to a chip → Space to "pick up" (announced via `aria-live`: "directory grabbed, position 1 of 3, row 2") → Arrow keys move it (Left/Right within row, Up/Down across rows) → Space to drop, Esc to cancel. This satisfies `ux #41`.
- Each move re-renders the preview live.

### Select element → Inspector opens
- Single click selects (green bracket glow on the chip); the bottom inspector drawer slides up showing the `ELEMENT` tab pre-focused. Header reads `> EDITING: context %`.
- Inspector contents (per element, only relevant controls shown):
  1. **Variant toggles** — segmented control of the variants this element supports: `GAUGE BAR · PERCENT · TIMER · LABEL`. (Context → gauge/percent; session/week → bar/percent/reset-timer; peak → label/timer; cost → currency; etc.) Disabled variants are hidden, not greyed, to reduce noise.
  2. **Gauge sub-options** when a bar variant is active: bar width (chars), fill glyph (`█ ▓ ▰ #`), empty glyph (`░ ▱ -`) — mirroring the `bar()` function in `statusline.sh`.
  3. **Color** — see 256-picker below.
  4. **Threshold coloring** — a toggle `THRESHOLD MODE`. When ON, the single color picker is replaced by three swatches (`<70 / 70–89 / ≥90`) defaulting to `--ok/--warn/--crit`, each independently editable, with editable breakpoints (number inputs pre-filled 70/90 — exactly the user's script). A live legend bar shows where the current mock value falls.
  5. **Label text** — editable prefix label (e.g. "Session", "Week", "Peak") with an Emoji column that is disabled+explained when the global emoji toggle is OFF.
  6. **Per-element notes** like "absent when not in a git repo" surfaced inline so users understand graceful-absence behavior.

### 256-color picker UX
- A **16×16 xterm grid** rendered as actual colored mono cells, organized into labeled bands matching the xterm-256 structure:
  - `STANDARD 0–15` (the 16 ANSI colors, named on hover: black, red, … bright-white).
  - `CUBE 16–231` (the 6×6×6 color cube laid out as 6 stacked 6×6 blocks).
  - `GRAYSCALE 232–255`.
- Top of the picker: the **current value** shown three ways — swatch, decimal index `38;5;46`, and the literal escape `\033[38;5;46m` (click to copy). A small input accepts a typed index or hex (snapped to nearest 256 via CIEDE2000).
- **Recently used** row (last 8 picks, persisted to localStorage) and a **Suggested** row seeded with the statusline.sh defaults (bold-blue dir, bold-green branch, cyan, magenta, the threshold trio).
- Hover any cell → tooltip with index + name; preview chip live-updates on hover (commit on click). Keyboard: arrow-key navigation across the grid, Enter to commit, with `aria-label` per cell ("color 46, bright green").

### Pet picker with live mood preview
- `PET` tab in the drawer. Left: a vertical list of pets (each a named ASCII creature — e.g. `koala`, `cat`, `fox`, `crab`, `null` = no pet). Right: a **large mood theater** showing the selected pet at its current mock-driven mood, framed by a fixed grid outline that visibly demonstrates the *identical width×height* hard constraint (the outline never moves between moods).
- **Mood metric selector:** radio `CONTEXT % · 5H SESSION % · 7D WEEK %` — choose which metric drives the pet's mood.
- **Mood scrubber / hover-scrub:** a horizontal slider 0–100 plus discrete buttons `CALM · ALERT · STRESSED · CRITICAL`. Hovering or scrubbing morphs the pet through its frames in place, so the user verifies every frame fits the grid and the line never shifts. A subtle red outline flashes if any frame would exceed the grid (authoring guard — relevant if custom pets are ever added).
- Selecting a pet immediately flanks the real preview's rows (each output line = pet fragment + row content, per the spec).

### Mock-data scrubber
- Lives permanently under the preview (desktop) / accordion (mobile). Sliders: **ctx %**, **5h %**, **7d %**, **time-of-day clock** (drives peak/off-peak + the Mon–Fri 05:00–11:00 America/Los_Angeles logic, ported from the script, with the countdown), plus dropdowns for **model**, **effort**, **vim mode**, **agent**, **PR state**, and toggles for **session_name present / worktree / thinking / exceeds_200k**. Each absent-able field has a `present ▢` checkbox so users can preview graceful-absence rendering.
- A `░ RANDOMIZE` button rolls plausible values; `↺ RESET` returns to the default mock (a believable mid-session snapshot). Moving any slider re-renders the preview (and the pet's mood) on the next frame — this is the core "watch it react" loop. A "preview width" slider sets `COLUMNS` so users can test truncation (docs note `COLUMNS`/`LINES`).

### Export modal (full screen)
- Header: `> EXPORT — choose your shell`. Three **language tabs**: `BASH (+jq) · PYTHON 3 · NODE.JS`. Each tab shows the generated, tailored, commented script in a syntax-highlighted code view (highlight.js or Shiki with a phosphor theme; only the chosen elements' code is present).
- Right rail of the modal: **install instructions** for the active language (chmod +x, where to save, the `~/.claude/settings.json` snippet with `type:"command"` and the right path/extension, plus `refreshInterval` recommendation since the statusline shows time-based peak/session countdowns). The **settings.json snippet** is its own copy block.
- Buttons per tab: `[ COPY ]` (copies script, toast "copied · 142 lines"), `[ DOWNLOAD ]` (saves `statusline.sh|.py|.js`). A `[ COPY settings.json ]`.
- A footer note shows the embedded **re-import marker** line that will be in the script: `# pms-config: <base64>` and explains it lets you paste the script back to resume editing.
- A **golden-test reassurance** line (small, dim): "Preview and script are verified identical in CI" — reinforces parity decision #2.

### Import flow (resume editing)
- `[ IMPORT ]` in the top bar → modal with a large mono textarea: "Paste a previously exported statusline script (.sh/.py/.js)". The parser scans for the `# pms-config:` / `// pms-config:` marker, base64-decodes the JSON, validates against the config schema (zod), and hydrates the editor.
- Success: typewriter "config restored — 3 rows, 8 elements" and the modal closes onto the populated workbench. Failure: inline error "no pms-config marker found — was this script exported by Pimp My Statusline?" with a link to start fresh. Drag-and-drop a file onto the modal is also accepted.

---

## 4. Microcopy & Personality

- **Wordmark:** `PIMP MY STATUSLINE` in Syncopate, with `MY` rendered in phosphor green and a blinking block cursor `▋` trailing it, as if typed at a prompt. A tiny ASCII chevron `▌` precedes it.
- **Tagline (under wordmark, on first boot / about):** `> a workbench for the bottom line of your terminal.`
- **Boot log (first load):** `> mounting element registry [OK]` / `> loading xterm-256 palette [OK]` / `> waking pet [ ^.^ ]` / `> READY.`
- **Empty row state** (`ux #79`): a dashed well reading `// drop an element here, or hit [ + ]`.
- **Empty layout** (everything removed): the preview shows `(your statusline is currently a void. add something.)` and the canvas shows `> no elements. the library is to your left.`
- **Buttons** are bracketed verbs: `[ EXPORT ]`, `[ COPY ]`, `[ ADD ROW ]`, `[ RANDOMIZE ]`.
- **Threshold toggle label:** `THRESHOLD MODE — color by %` with hint "green < 70, amber 70–89, red ≥ 90 (editable)".
- **Pet flavor:** each pet has a one-line bio in the picker, e.g. koala: `// chills at low usage. panics near the rate limit.` Mood names: `CALM · ALERT · STRESSED · CRITICAL`.
- **Toast confirmations** speak terminal: `copied → clipboard` / `downloaded statusline.sh` / `config restored`.
- **Tooltip for absent fields:** `// only present for Pro/Max subscribers` (rate limits), `// only inside a git repo` (branch/PR). Sourced straight from the docs' absence rules so users trust the output.

---

## 5. Accessibility & Responsive

- **Keyboard DnD:** full pick-up/move/drop via dnd-kit KeyboardSensor with `aria-live` announcements (detailed in §3). Every drag action has a keyboard equivalent; no mouse-only path exists.
- **Contrast (`ux #36/#76`):** `#00FF41` on `#0D1117` ≈ 13:1; `#E6EDF3` on `#0D1117` ≈ 14:1; muted `#94A3B8` on `#0D1117` ≈ 6:1 — all exceed 4.5:1. The amber `#FFB000` and red `#FF3333` threshold colors are validated ≥4.5:1 on the dark surfaces; where a threshold swatch sits on a light chip we pair it with a dark text token. The 256-color picker computes and displays a contrast badge against the preview background when a user picks a low-contrast color, with a non-blocking warning.
- **Focus (`ux #28`):** every interactive element gets a visible 2px phosphor focus ring (`outline: 2px solid var(--phosphor); outline-offset: 2px`) — never removed. Tab order matches visual order (`ux #41`). A "skip to canvas" link (`ux #45`) precedes the library.
- **Reduced motion (`ux #9/#99`):** `@media (prefers-reduced-motion: reduce)` disables boot sequence, scanlines, CRT flicker, cursor blink, and typewriter reveal — replaced by instant state swaps. The "CRT FX" toggle gives a manual override too. Pet mood changes become instant frame swaps.
- **Touch (`ux #22/#23`):** mobile drag handles, chip ✕, and slider thumbs are ≥44×44px with ≥8px spacing. The 256 grid cells enlarge to 24px on touch and gain a confirm step (tap to preview, tap "use this" to commit) to avoid fat-finger mis-picks.
- **Screen readers:** the preview's rendered output is mirrored into an `aria-live="polite"` visually-hidden text node so SR users hear the statusline update; ANSI is stripped to plain text for that mirror. Color names (not just indices) are announced.
- **Degradation on mobile:** scanlines/glow off, single-column tabbed flow, sticky mini-preview, bottom-sheet inspectors — all described in §2. No feature is desktop-only; export/import/pet all work on mobile.

---

## 6. Component Inventory (React + TS)

**App shell & chrome**
- `App` — root; provides config store, mock-data store, theme; mounts boot sequence.
- `BootSequence` — first-load fake log scroll; respects reduced-motion.
- `CrtOverlay` — fixed scanline/flicker overlay, `aria-hidden`, gated by FX toggle + reduced-motion.
- `TopBar` — wordmark, current-config name, Import/Export/FX/menu buttons.
- `Wordmark` — Syncopate title with blinking cursor.
- `SkipLink` — keyboard skip-to-canvas.
- `Toast` / `ToastProvider` — terminal-style transient confirmations.
- `HudPanel` — reusable chamfered panel with corner brackets (wraps library, canvas, preview).

**Element library**
- `ElementLibrary` — left rail; categories + search.
- `LibrarySearch` — filter input with cursor.
- `LibraryCategory` — collapsible group (CONTEXT / SESSION / META / GIT / MISC).
- `LibraryItem` — draggable bracketed chip; placed-state badge; add-on-click.

**Row arranger / canvas**
- `RowCanvas` — `DndContext`; owns cross-row + cross-element drag, keyboard sensor, aria-live announcer.
- `Row` — single sortable row; `[ + ]` add, `⋮⋮` reorder handle, drop well.
- `ElementChip` — placed element; select/remove; shows variant + color at a glance.
- `AddRowButton` — appends an empty row.
- `EmptyRowWell` / `EmptyLayoutState` — empty-state messaging.
- `DragAnnouncer` — `aria-live` region for DnD.

**Inspector drawer**
- `InspectorDrawer` — bottom slide-up; tabs ELEMENT/PET/DISPLAY; Esc/click-away close.
- `ElementInspector` — host for the selected element's controls.
- `VariantToggle` — segmented variant selector.
- `GaugeOptions` — bar width + fill/empty glyph pickers.
- `LabelEditor` — prefix label + per-element emoji (respects global emoji toggle).
- `ThresholdEditor` — threshold-mode switch, 3 swatches + editable breakpoints + live legend.
- `AbsenceNote` — inline "may be absent" explainer.

**Color picker**
- `Color256Picker` — orchestrates grid + bands + recents + input.
- `ColorGrid` — 16×16 xterm cells; keyboard nav; hover-preview.
- `ColorBand` — labeled section (standard/cube/grayscale).
- `ColorSwatchCell` — single cell with index/name aria-label.
- `RecentColors` / `SuggestedColors` — quick-pick rows.
- `ColorInput` — typed index/hex with snap-to-256.
- `ContrastBadge` — live contrast warning vs preview bg.

**Pet**
- `PetTab` — list + theater layout.
- `PetList` / `PetListItem` — selectable pets with bios.
- `PetTheater` — fixed-grid mood preview demonstrating the no-shift constraint.
- `PetMoodScrubber` — slider + discrete mood buttons (hover-scrub).
- `PetMetricSelector` — choose context/5h/7d as mood driver.

**Live preview**
- `PreviewBezel` — CRT frame, power LED, interior scanlines.
- `StatuslinePreview` — renders rows (+ pet flanks) from config × mock data; the canonical renderer reused by golden tests.
- `AnsiLine` — renders one output line with ANSI→span color mapping + typewriter.
- `AnsiText` — ANSI escape → styled spans (256-color aware).
- `PreviewAriaMirror` — visually-hidden plain-text live mirror for SR.

**Mock data scrubber**
- `MockDataPanel` — container.
- `MetricSlider` — labeled 0–100 slider (ctx/5h/7d).
- `ClockSlider` — time-of-day; drives peak logic.
- `MockFieldToggles` — present/absent checkboxes + dropdowns (model/effort/vim/agent/pr/etc.).
- `PreviewWidthSlider` — sets COLUMNS for truncation testing.
- `RandomizeReset` — randomize / reset controls.

**Export / Import**
- `ExportModal` — full-screen; language tabs.
- `LanguageTab` — Bash/Python/Node switch.
- `CodeView` — syntax-highlighted generated script (phosphor theme).
- `InstallInstructions` — per-language steps (IBM Plex Sans prose).
- `SettingsSnippet` — settings.json block + copy.
- `CopyButton` / `DownloadButton` — clipboard + file save.
- `ImportModal` — paste/drop script, parse pms-config marker, validate, hydrate.

**State / logic (non-visual, listed for parallelization)**
- `useConfigStore` — element/row/color/variant/pet config (zustand).
- `useMockDataStore` — mock JSON session state.
- `usePersistence` — localStorage (recents, last config, FX prefs).
- `useReducedMotion` / `useFxEnabled` — motion + FX gating hooks.

---

### Critical Files for Implementation
- /home/vito/dev/pimp-my-statusline/src/theme/phosphor.css (the palette, fonts, scanline/glow/chamfer tokens — single source of visual truth)
- /home/vito/dev/pimp-my-statusline/src/components/preview/StatuslinePreview.tsx (canonical renderer reused by golden tests; the parity contract)
- /home/vito/dev/pimp-my-statusline/src/components/canvas/RowCanvas.tsx (dnd-kit DndContext, cross-row drag, keyboard DnD + aria-live)
- /home/vito/dev/pimp-my-statusline/src/components/color/Color256Picker.tsx (xterm-256 grid, threshold mode, contrast badge)
- /home/vito/dev/pimp-my-statusline/src/components/export/ExportModal.tsx (language tabs, code view, settings.json snippet, re-import marker surfacing)