Write is not available in this read-only session (as the system prompt warned). I'll return the complete review as my final message, which is what the calling workflow parses.

---

# PRODUCT & COMPLETENESS REVIEW — pimp-my-statusline

**Verdict:** The three designs together cover the requested feature surface well and are largely consistent on architecture. But there are **2 hard fidelity bugs** against the user's actual `statusline.sh`, **1 required feature that is unspecified everywhere** (localStorage persistence), **4 cross-document inconsistencies** (segment list, pet grid, color model, default-preset shape), and **3 scope-creep items** worth cutting. Each below has a concrete resolution.

---

## A. Dropped / under-specified features (must fix)

### A1. localStorage persistence is NOT specified anywhere — REQUIRED, currently a gap
The reviewer's own checklist item. Searching all three docs: the UI doc mentions a `usePersistence` hook "(recents, last config, FX prefs)" in the component inventory and "Recently used … persisted to localStorage" for colors — but **the actual working config (rows/segments/colors/pet/mock) is never stated to survive a refresh.** A user who spends 10 minutes arranging a statusline and hits F5 loses everything. That is unacceptable for a configurator.

**Resolution (concrete):**
- CORE's Zustand store (`src/store/configStore.ts`) must wrap state with Zustand's `persist` middleware, key `pms:config:v1`, storing the *entire* `StatuslineConfig` plus the last-selected language tab and FX prefs. Mock-scrubber state should NOT persist (always reboot to the `typical` preset) so the preview is reproducible on load — persist config only.
- On load: read `pms:config:v1`; run it through the SAME `migrate()` + Zod validation used by re-import (`src/model/reimport.ts` / `schema.ts`) so a stale-schema localStorage blob can't crash the app. On validation failure, fall back to `defaultPreset` and show a non-blocking toast "saved config was incompatible, reset to default."
- Debounce writes (~250ms) to avoid thrashing on slider drags.
- This must be added to CORE §7 (store) and named explicitly in UI's `usePersistence`.

### A2. Git branch / repo segments cannot be driven by JSON — the docs have NO plain "current branch" field
Verified against the official docs: stdin exposes `workspace.git_worktree`, `workspace.repo.{host,owner,name}`, and `worktree.branch` — but **there is no field for the ordinary current git branch.** The user's own `statusline.sh` gets it by shelling out: `git -C "$CWD" branch --show-current`. All three designs list a `gitBranch` segment as if it reads from JSON. CORE's MockData correctly invents `_gitBranch`, and the parity plan correctly routes it through `PMSL_GIT_BRANCH` in test mode — good — but **none of the three docs state that the generated production script must contain a real `git` subprocess call** (and that Python/Node generators must `subprocess`/`child_process` out to git, which is a notable complication for the "stdlib only" constraint).

**Resolution:**
- CORE §4 must specify: the `gitBranch` segment emits a git subprocess in all three languages — bash `git -C "$dir" branch --show-current 2>/dev/null`, python `subprocess.run(["git","-C",dir,"branch","--show-current"], ...)`, node `execFileSync("git", ["-C", dir, "branch","--show-current"])`. This is still "stdlib only" (subprocess/child_process are stdlib) but the doc must say so, because it's the one segment that escapes the pure-JSON model.
- Add an `AbsenceNote` in the inspector: "branch is read by running git; shows nothing outside a repo" (UI already has the note component; just wire the copy).
- Distinguish in the element library between **git branch (live, via subprocess)** and the JSON-native **worktree / repo owner-name** segments, so users understand why one needs git installed and the others don't.

### A3. The user's bar() and color() math is DIFFERENT from what every generator sample emits — parity-vs-fidelity bug
This is the most important fidelity defect. The user's actual script:
- `color()` emits **basic ANSI** `\033[31m / \033[33m / \033[32m` (codes 31/33/32), **not** xterm-256 `38;5;196/220/46`.
- `bar()` computes `filled = pct / 20` (integer division, 5 buckets of 20%), **not** `filled = pct*w/100`.
- Thresholds are `>=90` red, `>=70` yellow, else green — matches the designs' numbers, good.
- Context shows **`${CTX}%` with NO bar** (context is percent-only); Session shows `bar + %`; Week shows `bar + %`. Only the **5h session** has a reset countdown — **context has no timer and week has no timer** in the user's layout.

CORE's sample generators emit 256-color `color()` and `p*w/100` bar math. Decision #4 says "Colors: xterm-256 palette." So there's a tension: the **default preset must mirror statusline.sh** (decision #7) which uses basic ANSI and `/20` bars, but the **system** uses xterm-256 and (per CORE) `p*w/100`.

**Resolution:**
1. **Bar math:** standardize on ONE formula and make the default preset's `barWidth = 5` produce identical output to `pct/20`. With `barWidth=5`, `floor(pct*5/100) == floor(pct/20)` for all integer pct — these are arithmetically identical, so adopt CORE's `floor(p*w/100)` universally and the default preset is faithful at width 5. State this equivalence explicitly so no one "fixes" it later.
2. **Color:** the xterm-256 codes `46/220/196` are NOT the same glyphs-on-screen as basic `32/33/31` (a terminal's palette for 32 vs 38;5;46 differs). To be *faithful* to statusline.sh, the **default preset's threshold stops must use the basic-ANSI equivalents** — i.e. the model needs to allow a `FixedColor`/threshold to emit basic SGR (30–37 / 90–97), not only `38;5;N`. Resolution: extend `ColorSpec` with an optional `basic: true` flag (or a separate `kind:'ansi16'`) so the default preset emits `\033[32m` exactly like the user's script, while the picker still defaults new elements to 256-color. Without this, the default preset is a near-miss, not a mirror, and the golden test comparing against a hand-derived expectation of statusline.sh will be wrong.
3. **Variants in the default preset** must encode: context = `['percent']` (no bar), session = `['bar','percent','timer']`, week = `['bar','percent']` (no timer), model = name + effort (dim), peak = label + countdown. CORE's prose default ("ctx %, session bar+timer, week bar, peak indicator") is right; make sure `defaultPreset.ts` does NOT give context a bar or week a timer.

### A4. The 74-char separator width is wrong
The user's `SEP` is **74 dashes** (count line 129: it's a fixed `──…──`). CORE §8 says "the user's fixed 74-char dashed rule." Let me flag: the design says 74; that is plausible but the implementer must count the exact glyph run from statusline.sh line 129 and reproduce it byte-for-byte in `defaultPreset.ts` (it is a `\033[2;37m`-dim rule, 74 `─` chars, reset). Resolution: hardcode the exact count from the source; do not approximate. (Also: `\033[2;37m` is dim-white = `dim:true` + ansi16 white(37), another reason A3's basic-ANSI support is needed.)

---

## B. Cross-document inconsistencies (must reconcile)

### B1. The segment/element list differs across the three docs
- **Context's required inventory** (17 prompt) lists: directory, git branch, model, effort, context %, context gauge, 5h, 7d, peak, cost, duration, lines, output style, vim, session name, agent, PR, thinking, version, separator, custom text.
- **CORE `SegmentType`** adds `worktree` (good, it's in docs) but **drops `repo` owner/name** as a distinct segment (folds it nowhere). It also has no explicit "context gauge" type — it models context/session/week as one `MetricSegment` with `parts` (cleaner — but then the UI library listing "ctx gauge" and "context %" as two separate library items contradicts the one-segment-with-variants model).
- **UI ElementLibrary** lists "context %" and "ctx gauge" as **two separate library entries** under CONTEXT, and lists peak as "peak/off." That's a different mental model from CORE's single `context` MetricSegment.
- **PET doc** only cares about three metrics, consistent.

**Resolution:** Adopt CORE's model as canonical: ONE `context` segment whose variant toggle exposes gauge/percent. The UI library must therefore list **one** "context" item (not "context %" + "ctx gauge"); the gauge-vs-percent choice happens in the inspector's `VariantToggle`. Update UI ElementLibrary copy accordingly. Add a `repo` segment (owner/name/host) to `SegmentType` since the docs expose it and the inventory implies git identity beyond branch — or explicitly fold it into `worktree`/decide to cut it (see C2). Pick one and write it in `segments.ts`.

### B2. Pet grid spec conflicts between CORE and PET
- **CORE PetConfig** uses `moodStops: {at, mood}[]` with example `[{90,'panic'},{70,'worried'},{0,'happy'}]` — moods named `panic/worried/happy`, thresholds 70/90.
- **PET doc** uses moods `idle/calm/wary/alarmed/panic` with thresholds `idle:10, calm:50, wary:80, alarmed:90`.

These are **different mood vocabularies AND different thresholds.** A generator built to CORE's shape would not find PET's frames.

**Resolution:** PET's 5-mood model (`idle/calm/wary/alarmed/panic`) and its `DEFAULT_THRESHOLDS {idle:10,calm:50,wary:80,alarmed:90}` are the detailed, tested spec — adopt them as canonical. CORE's `PetConfig.moodStops` must be replaced with PET's `thresholds: {idle,calm,wary,alarmed}` shape and the `Mood` union imported from `src/pets/types.ts`. Delete the `happy/worried/panic` example from CORE. Also reconcile field name: CORE `petId` vs PET `Pet.id` — fine, but CORE's `position:'left'|'right'` and `gap` must match PET §0/§3 (PET says default left, gap 1, range 0–3) — they do; just centralize the type in one module so they can't drift.

### B3. Pet color model: CORE implies monochrome, PET specifies colored spans
- **CORE** never mentions pet color spans; its `petFrame` helper and prose treat the pet as plain frames.
- **PET §5** specifies per-frame `Span[]` colorization with per-pet `bodyColor` and mood accent palettes, baked into generated scripts.

This affects codegen complexity and the golden tests materially.

**Resolution:** Adopt PET's colored-span model (it's the charm of the feature and PET argues it convincingly — color is zero-width so the grid invariant holds). CORE must add `colorizeRow` to its `HelperId` set and its `petFrame` helper must consume the baked-ANSI mood table PET describes. Confirm the global emoji/monochrome toggle path: PET says "drops all spans, emits neutral color" — wire that to GlobalOptions and state it once.

### B4. Pet metric naming inconsistency
- **CORE** `PetMetric = 'context' | 'session' | 'week'`.
- **PET** `'context' | 'session_5h' | 'week_7d'`.

**Resolution:** Pick PET's explicit names (`session_5h`, `week_7d`) — they're unambiguous and match the JSON paths table. Update CORE's `PetMetric`.

### B5. Re-import marker string differs
- **CORE** marker: `pimp-my-statusline:v1:<base64url>`.
- **UI** ImportModal scans for `# pms-config: <base64>` / `// pms-config:`.

Two different magic strings — the importer would never find CORE's marker.

**Resolution:** One marker string. Recommend CORE's `pimp-my-statusline:v<N>:<base64url>` (it carries a version for migration, which `pms-config:` lacks). Update UI ImportModal + ExportModal footer copy to show the real `pimp-my-statusline:v1:` marker. Decision #8 just requires "a comment line containing the serialized config (e.g. base64 JSON)" — CORE's satisfies it; align UI to it.

---

## C. Scope creep (YAGNI — cut or defer)

### C1. Boot sequence, CRT flicker, typewriter-reveal, scanlines, blinking cursor (UI §1)
Nobody asked for a fake boot log, CRT flicker, or per-keystroke typewriter re-rendering of the preview. The requirement is a "LIVE terminal preview" — instant, accurate updates. A 700ms boot animation and a 120ms typewriter on every config change actively **slow down** the core watch-it-react loop and add reduced-motion branching complexity.

**Resolution:** Keep the static phosphor *aesthetic* (palette, mono fonts, chamfered panels) — that's cheap and on-theme. **Cut for v1:** boot sequence, CRT flicker, typewriter reveal on config change. Make scanlines a single static overlay defaulting OFF (it's a gimmick that can hurt contrast). Keep the blinking cursor ONLY in the wordmark (one element, harmless). This removes `BootSequence` from the critical path and the typewriter timing from the preview, making it genuinely live.

### C2. Optional 2-row / 1-row pet art variants (PET §2.4)
PET designs a `frames` map keyed by height with deferred 2-row/1-row art. The prompt's pet requirement is one reactive multi-line side-column; nobody asked for height variants. PET itself defers them to v1-not-shipped, which is good — but the `Partial<Record<height,...>>` shaping leaks into types and the composer.

**Resolution:** Cut the height-keyed map for v1. `Pet.height` is the literal `3` (PET already types it so). Composer handles row-count mismatch uniformly (PET §3 already does this well). Re-add height variants only if a user asks. Keeps `pets.ts` and `compose` simpler.

### C3. `accentByMood` substitution, CIEDE2000 hex snapping, contrast-badge auto-warnings, owl/robot/fish "proposed additions"
- PET §5 wisely defers `accentByMood` to v2 — good, keep deferred.
- UI's CIEDE2000 nearest-256 hex snapping and live contrast-badge computation in the 256 picker are nice-to-haves nobody requested. The picker requirement is "xterm-256 swatches + threshold editor."
- PET proposes **6 pets** but the prompt only says "pet selector" (≥1, some choice). 3 pets (cactus/cat/dog) is plenty for v1; owl/robot/fish are explicitly "proposed additions."

**Resolution:** Keep the 256 swatch grid + recents + typed-index input; **cut** CIEDE2000 hex snapping (accept a typed *index* 0–255, drop hex entry, or do a trivial nearest-RGB if hex is kept) and **downgrade** the contrast badge to a static a11y check on the *threshold trio* only, not a live per-pick computation. **Ship 3 pets** (cactus, cat, dog), keep the other 3 as stretch. This is a meaningful reduction in art authoring + invariant-test surface. (Counter-note: the pets are cheap data; if the team wants 6, the only cost is authoring + the invariant test already covers them. Acceptable either way — but don't let "6 pets fully colored" block v1.)

---

## D. Export / install flow completeness for a novice (mostly good, small gaps)

What's present and correct: per-language tabs (Bash/Python/Node), copy + download, `settings.json` snippet with `type:"command"`, chmod hint, install instructions, re-import marker surfaced. UI §3 export modal and CORE §6 cover this. Verified against docs: chmod, settings.json structure, refreshInterval all real.

Gaps:
- **D1. jq install hint.** Decision #1 and the prompt explicitly want a "jq install hint." UI's export rail mentions "chmod +x … settings.json snippet" but does **not** call out installing jq for the Bash tab. A novice on a fresh machine will get `jq: command not found`. **Resolution:** Bash tab install instructions must include `# requires jq:` with `brew install jq` / `apt-get install -y jq` / `winget install jqlang.jq`, and ideally the generated bash preamble should `command -v jq >/dev/null || { echo "statusline: jq not found" >&2; exit 0; }` so a missing jq degrades gracefully instead of spewing errors into the statusline.
- **D2. refreshInterval guidance.** UI mentions recommending `refreshInterval` — good and docs-backed (needed because peak/session countdowns are time-based). Make sure the `settings.json` snippet **actually includes** `"refreshInterval": 10` (or similar) whenever a time-based segment (peak, any timer) is enabled, and omits it otherwise. State this conditional in CORE §6 / ExportPanel.
- **D3. File path / extension correctness.** The settings snippet must point `command` at the right filename per language (`~/.claude/statusline.sh|.py|.js`) and, for Python/Node, either a shebang+chmod path or an explicit interpreter prefix (`"command": "python3 ~/.claude/statusline.py"`). UI says "the right path/extension" — make it concrete per tab.
- **D4. Windows / no-bash note.** Minor: a one-line note that the Python/Node exports are the portable choice on Windows. Optional.

---

## E. Default-preset faithfulness (summary of the must-fix list)

The default preset (`defaultPreset.ts`) must reproduce statusline.sh **exactly**, which means, beyond A3/A4:
- Row 1: directory (`$HOME`→`~`, `dirStyle:'tildeHome'`, bold-blue ansi16 34) + git branch (bold-green ansi16 32, via git subprocess), joined by 2 spaces.
- Row 2: the 74-char dim-white (`2;37`) `─` separator.
- Row 3, joined by 2 spaces: model (bold-white `1;37`) + effort (dim-white `2;37`, suppressed when absent) + **space** + context `${CTX}%` colored by threshold (basic ansi16 32/33/31) **no bar** + Session (cyan `36` label) threshold-colored 5-char bar + `%` + dim `(reset)` countdown + Week (magenta `35` label) threshold-colored bar + `%` **no countdown** + Peak (`1;31` Peak / `1;32` Off-peak) + dim `(remaining)`.
- The `time_until` formatting (`${h}h${m}m` or `${m}m`, empty when ≤0) must match exactly; CORE's `timeUntil` helper must reproduce this format string, not invent its own.
- Peak logic: Mon–Fri 05:00–11:00 America/Los_Angeles, with the next-window roll-forward (today 05:00 if before 5 on a weekday, else scan +1..7 days for next weekday 05:00). CORE PeakSegment params (tz, windowDays [1-5], 5–11) are right; the **roll-forward-to-next-weekday** detail must be in the `peak` helper for all three languages or the countdown will be wrong on weekends. PET/UI don't touch this; CORE must own it precisely.

Also: the default preset has **no pet** (statusline.sh has none). So `defaultPreset.pet.enabled = false`. The pet is an opt-in enhancement, which is correct — but make sure the default boot state mirrors the user (pet off), and the golden test for "default preset" compares against statusline.sh's exact 3-line output.

---

## F. Minor / confirm

- **F1.** CORE MockData omits `_columns` from some flows but §8 uses it — fine, it's declared; just ensure ExportPanel's "preview width" slider (UI) writes `_columns` and that the truncation helper is in the shared `width.ts` so preview and the `COLUMNS` codegen agree (CORE §8 covers this; cross-link it to UI's `PreviewWidthSlider`).
- **F2.** CORE claims jq is preinstalled on ubuntu-latest and adds a guard — good, keep the explicit `apt-get install -y jq` fallback in CI so the parity job never flakes.
- **F3.** Deterministic time: CORE's `PMSL_NOW` indirection is essential for golden tests of peak/timer/pet-on-time. Confirm PET's pet golden cases also pin `PMSL_NOW` (PET pins the metric %, which is time-independent, so fine) — but any pet bound via a *reset countdown*-adjacent preset still needs the pinned clock. Keep PMSL_NOW universal.
- **F4.** UI exposes a `valign` for the pet? PET §3 has `valign:'top'|'middle'`; UI PetPanel doesn't surface it. Either expose it (one segmented control) or hardcode `top` and drop it from PET's API to avoid a dead option. Recommend: hardcode `top` for v1, cut from the type.

---

## Priority fix list (build order)
1. **A3** (color/bar fidelity + ansi16 support in ColorSpec) — blocks a faithful default preset and the golden test.
2. **A1** (localStorage persist) — required, currently absent.
3. **B1/B2/B3/B4/B5** (reconcile segment list, pet mood vocab+thresholds, pet color model, metric names, marker string) — these are silent integration breakers.
4. **A2** (git-via-subprocess, document it) and **E** (exact default preset) — fidelity + the one non-JSON segment.
5. **D1/D2/D3** (jq hint, conditional refreshInterval, per-language command path) — novice install completeness.
6. **C1/C2/C3** (cut boot/flicker/typewriter, height variants, CIEDE2000; ship 3 pets) — descope to protect v1.

### Critical Files for Implementation
- /home/vito/dev/pimp-my-statusline/src/model/segments.ts (canonical segment list — resolve B1; single source the UI library must mirror)
- /home/vito/dev/pimp-my-statusline/src/model/presets/defaultPreset.ts (faithful mirror of statusline.sh — resolve A3, A4, E)
- /home/vito/dev/pimp-my-statusline/src/store/configStore.ts (add Zustand persist middleware — resolve A1)
- /home/vito/dev/pimp-my-statusline/src/pets/types.ts (canonical Mood vocab + thresholds + metric names + color model — resolve B2, B3, B4)
- /home/vito/dev/pimp-my-statusline/src/ui/ExportPanel.tsx (jq hint, conditional refreshInterval, per-language command path, real re-import marker — resolve D1/D2/D3, B5)