The key facts are confirmed. The current statusline uses `date -d "today 11:00:00"`, `date -d "+${ahead} days"`, and `date -d "${CAND_DATE} 05:00:00"` — three GNU-specific invocations. The local environment is `uutils coreutils` (GNU-compatible), but macOS BSD `date` rejects all of these. `jq` is present here, but that says nothing about end-user machines. Let me confirm the box-drawing/block char facts the pet review depends on, then deliver the review.

Now the adversarial review.

---

# Adversarial Technical Review — pimp-my-statusline

Three designs reviewed: **CORE** (architecture), **UI** (UI/UX), **PET** (pet system). I verified load-bearing claims against `~/.claude/statusline.sh` and the environment. Findings are grouped by theme; each has severity, affected design, and a concrete fix. Prioritized list at the end.

---

## A. BSD vs GNU `date` — the peak indicator is broken on macOS (BLOCKER)

The single biggest defect, and all three designs miss it.

The user's `statusline.sh` (lines 73, 77, 80, 82–83) computes peak/off-peak countdowns with **three GNU-only `date -d` forms**:
```bash
date -d "today 11:00:00" +%s
date -d "+${ahead} days" +%u
date -d "${CAND_DATE} 05:00:00" +%s
```
On macOS (BSD `date`), `-d` means *"daylight savings"* and takes no argument in this form — every one of these **fails or silently produces garbage**. macOS is the single most common platform for Claude Code users. CORE §8 says "port logic from user's script" and PET/UI both treat peak as a solved segment. **None of the three designs mention BSD `date` at all.** This is a guaranteed field failure for a flagship segment.

- **Severity: BLOCKER. Affected: CORE (generator), and by omission UI/PET.**
- **Fix:** The bash peak generator must NOT shell out to `date -d`. Two acceptable strategies, pick one and bake it into the helper template:
  1. **Pure-arithmetic peak in bash** (recommended): get `now=$(date +%s)`; derive PT wall-clock by adding the LA UTC offset. But DST makes a fixed offset wrong twice a year — so instead use `TZ=America/Los_Angeles date +%u` and `+%H` (these *are* portable; the user's lines 66–67 already use only portable forms) to get the current PT dow/hour, then compute the target epoch by **rounding the current epoch down to PT-midnight and adding hours**. PT-midnight is derivable portably as `now - (H*3600 + M*60 + S)` using `TZ=... date +%H %M %S`. Then `peak_start = pt_midnight + 5*3600`, `peak_end = pt_midnight + 11*3600`, and "next weekday" advances in 86400-second steps checking `TZ=... date -d@$cand +%u` — but `date -d@` is *also* GNU-only.
  2. **Therefore the robust portable primitive is `TZ=... date +%u` / `+%H` / `+%M` / `+%S` on the *current* time only, plus integer epoch arithmetic in 86400s steps, re-deriving the weekday of a future epoch via a known-good algorithm in pure bash (Zeller / day-of-week from epoch is trivial: `dow = (epoch/86400 + 4) % 7`).** This needs zero `date -d`. The DST caveat: a fixed 86400 step can be off by an hour across a DST boundary, but since the peak window is hour-granular and the countdown is displayed in `Hh Mm`, a one-hour DST seam twice a year is acceptable and documentable — OR detect it by re-reading `TZ=... date` offset at the candidate. Specify the exact algorithm in the helper template and unit-test it.
  - Python/Node are fine here: emit `zoneinfo.ZoneInfo('America/Los_Angeles')` (Python 3.9+ stdlib — confirm the README states 3.9 minimum, since `zoneinfo` is the whole game) and `Intl.DateTimeFormat('en-US',{timeZone:...})` / `toLocaleString` in Node. **Python `zoneinfo` on some Linux distros needs `tzdata` pip package when `/usr/share/zoneinfo` is absent** — CORE says "stdlib only," so document the `tzdata` fallback or the import will `ZoneInfoNotFoundError` on minimal containers.
- **Parity consequence:** because the three languages compute peak by *different* mechanisms, the golden test MUST pin `PMSL_NOW` AND `TZ` AND exercise a DST-boundary date, or bash-vs-python peak countdowns will diverge by an hour and the parity diff will fail in CI intermittently (see §E).

---

## B. Golden-test time determinism is underspecified and partly contradicted (MAJOR→BLOCKER)

CORE §5 proposes `NOW="${PMSL_NOW:-$(date +%s)}"` and routing peak/timer math through `NOW`. Good instinct, but there are holes that will make CI either flaky or false-green:

1. **The current `time_until()` calls `date +%s` directly (line 50), and peak uses `TZ=... date` for wall-clock, not `NOW`.** If the generator injects `PMSL_NOW` only into `time_until` but peak still reads the real `TZ=... date +%H`, then `time_until` is frozen while peak is live → they disagree about "now" within a single render. CORE doesn't reconcile this. **Fix:** ALL time reads in every generated language must funnel through one injected clock: `now = PMSL_NOW ?? system`, and the *wall-clock PT decomposition* must be derived from `now` (e.g. compute PT hour from `now` + tz offset), not from an independent `date` call. Otherwise frozen-clock tests can't freeze peak.

2. **PET (§4) binds the pet to `rate_limits` percentages but the pet has no time dependency — fine — yet PET §7.3 golden cases pin only `pct`, not `PMSL_NOW`.** If a pet is composed onto rows that *include* a timer/peak segment, the composed golden output is still time-dependent. PET's parity hook must inherit CORE's `PMSL_NOW`/`TZ` pinning. Cross-design gap.

3. **CORE asserts `stdout === renderToAnsi(...).join('\n') + '\n'` byte-for-byte.** `echo -e` and `printf '%b\n'` and `print()`/`console.log` differ in trailing-newline behavior and in how a final line without content is emitted. If a right-side pet (PET §3) emits trailing blank-pet lines, the **trailing whitespace on those lines** (the `blank = spaces` pet cell) will be present in script output but the renderer must also emit it — and many assertions/editors strip trailing whitespace. A byte-for-byte compare against a committed `.ansi` golden file (CORE §5.4) will break the moment anyone's editor trims trailing spaces on save. **Fix:** store goldens with explicit visible EOL markers or compare via a normalized structural form; configure `.gitattributes`/`.editorconfig` to preserve trailing whitespace in `tests/golden/**`; and decide a single canonical newline policy (every line including the last gets exactly one `\n`; no terminal-added trailing blank).

- **Severity: MAJOR (flakiness) rising to BLOCKER if peak isn't funneled through the injected clock. Affected: CORE primarily, PET for inheritance.**

---

## C. `jq` absence on end-user machines (MAJOR)

CORE §5 only discusses `jq` *on the CI runner* ("preinstalled on ubuntu-latest"). Confirmed: `jq 1.8.1` is present here and on GitHub runners. **But the generated bash script ships to arbitrary user machines**, and the decision (#1) is "Bash (+jq)". Many macOS/Linux users don't have `jq`. The UI export panel (UI §3) labels the tab `BASH (+jq)` but neither CORE nor UI specifies a **preflight check or graceful failure**.

- **Severity: MAJOR. Affected: CORE (bash generator), UI (install instructions).**
- **Fix:** Emit a guard at the top of every bash script:
  ```bash
  command -v jq >/dev/null 2>&1 || { echo "statusline: jq not found (brew install jq / apt install jq)"; exit 0; }
  ```
  `exit 0` (not 1) so Claude Code doesn't surface a broken statusline as an error. UI's `InstallInstructions` for the Bash tab must state the `jq` dependency prominently and link install commands. Consider surfacing in the export UI a note: "Bash requires jq; Python/Node have zero dependencies" — this nudges users to the dependency-free targets, which also sidesteps §A's bash-date pain.

---

## D. Float formatting / percentage rounding divergence across languages (MAJOR)

This is the subtlest parity threat and the designs are **internally contradictory** about it.

- The user's bash truncates: `... | cut -d. -f1` (line 19) → `23.5%` becomes `23`.
- CORE §8 says "truncate to int (`cut -d. -f1` / `int()` / `Math.floor`)". `Math.floor(23.5)=23`, `int(23.5)=23`, `cut`→`23`. Consistent for positives. **But `int()` in Python truncates toward zero and `Math.floor` floors toward −∞** — only matters for negatives, which percentages aren't, so OK *for the value text*.
- **PET §4 contradicts this:** `selectMood` uses `clamp(round(pct), 0, 100)` — **`round`, not truncate.** So a context value of `49.6%` displays as `49` (truncated, via the segment) but selects mood as `50` (rounded) → **wary**, while the displayed number says 49 (calm range). The pet mood and the visible percentage disagree at boundaries. Worse, the three languages round differently: bash has no built-in round (you'd do `printf '%.0f'`, which uses **round-half-to-even**), Python 3 `round()` is **also banker's rounding** (round-half-even), JS `Math.round()` is **round-half-up**. So `pct=49.5`: Python→`50` (even), JS→`50`, but `pct=48.5`: Python→`48` (banker's), JS→`49`. **Mood selection will diverge between Python and Node generators at `.5` boundaries**, and the golden test *will* catch it as a failure — but only if a `.5` mock is in the matrix. If it isn't, you ship divergent scripts.
- **`cut -d. -f1` also mishandles negatives and integers-without-decimal and `null`** — `null // 0` yields `0`, fine; but a value already integer like `42` has no `.`, and `cut -d. -f1` of `42` is `42`, fine. Scientific notation (jq can emit `1e-06` for tiny percentages) → `cut -d. -f1` gives `1e-06`?? Actually `cut -d.` on `1e-06` splits on `.`→ no dot → returns `1e-06` whole, then `[ "$pct" -ge 90 ]` **throws "integer expression expected"**. Low-probability but real for near-zero percentages.

- **Severity: MAJOR. Affected: CORE §8 vs PET §4 (direct contradiction), all generators.**
- **Fix:** (1) Pick ONE rounding mode for the entire project and emit it identically in all three languages. Recommend **truncation (floor) toward zero for the 0–100 domain** since bash's `cut` already does it and it matches the user's current script; then `selectMood` must use the SAME truncated integer, not `round`. Change PET §4 to `p = clamp(trunc(pct), 0, 100)`. (2) Sanitize the bash extraction against scientific notation: `jq -r '.x // 0 | floor'` (do the flooring **inside jq**, which has a real `floor`), eliminating `cut` entirely and guaranteeing an integer string. Mirror with `int(float(x))` / `Math.trunc(Number(x))`. (3) Add `.5` and near-zero (`0.4`, `1e-06`) values to the golden mock matrix so divergence is caught.

---

## E. Locale / `LANG` affects more than glyph bytes (MAJOR)

CORE §5 pins `LANG=C.UTF-8` for the CI test. Good, but incomplete and the *generated scripts run in the user's locale, not C.UTF-8*:

- **`printf` and number formatting:** in some locales the decimal separator is `,`. Bash arithmetic is locale-independent (good), but `printf '%.2f'` for **cost USD** (`cost.total_cost_usd`, an element in the inventory) emits `1,23` under `LC_NUMERIC=de_DE.UTF-8`. Python `f"{x:.2f}"` is locale-independent by default (good); Node `toFixed` is locale-independent (good); **bash `printf` is the outlier** and will desync from preview and from the other two languages for any cost/float formatting. **Fix:** prefix cost formatting with `LC_NUMERIC=C printf ...` in generated bash, or avoid `%f` and format cents via integer math.
- **`seq` locale:** the bar helper uses `seq 1 $filled` — fine, but `seq` with a `0` count: `seq 1 0` prints `1\n0`?? No — `seq 1 0` prints nothing (descending requires step). But the current `bar()` (line 42) does `printf '█%.0s' $(seq 1 $filled)` and when `filled=0`, `seq 1 0` → empty → `printf '█%.0s'` with **no args still prints one `█`** because `printf` with a format and zero args runs the format once. **This is a latent bug in the user's own script**: a 0% bar prints one filled block, not zero. CORE's sample `bar()` rewrites it with `seq 1 "$f"` and has the **same bug** at `f=0`. The renderer (`'█'*f`) would correctly print zero. → **Parity failure at 0% / 100%.**
- **Severity: MAJOR. Affected: CORE (bash bar + cost), and the `bar()` parity at boundaries.**
- **Fix for the `printf '%.0s'` zero-arg trap:** guard `[ "$f" -gt 0 ] && printf '█%.0s' $(seq 1 "$f")`. Same for empty. Add 0% and 100% to the golden matrix (the `fresh` and `panic` presets partially cover this but must hit exact 0 and exact 100). This bug means the *default preset itself* would fail parity until fixed.

---

## F. Box-drawing & block-char width across browser fonts vs terminals (MAJOR)

Multiple designs lean on `█ ░ ─ ▓ �entity`:

- **Terminal side:** `█`(U+2588), `░`(U+2591), `─`(U+2500) are East_Asian_Width=Neutral → single cell in virtually all terminals. PET §2.3 correctly restricts to single-width. Fine for the *script*.
- **Browser preview side (UI/CORE ansiToHtml):** the preview uses `ui-monospace, "JetBrains Mono", monospace`. **JetBrains Mono renders `█`/`░`/`─` at one cell, but the generic `monospace` fallback and many system monospace fonts render U+2591 (`░`) and the box-drawing range at *inconsistent advance widths* or with gaps**, and `ui-monospace` resolves to different fonts per OS (SF Mono, Cascadia, DejaVu). If the web font fails to load (offline, CSP, GitHub Pages cold cache), the fallback can break the cell grid → **the preview lies about alignment that the script actually gets right.** The pet's whole selling point ("never shifts") is validated by the user's eye on a preview that may itself be misaligned.
- **Severity: MAJOR. Affected: UI (font stack), CORE (ansiToHtml/preview), PET (visual validation premise).**
- **Fix:** (1) **Self-host JetBrains Mono** (woff2 in `public/`, `font-display: block` for the preview specifically so text doesn't paint in a fallback first) rather than relying on Google Fonts CDN — GitHub Pages + CDN + CSP is a flaky combination. (2) Set an explicit `font-feature-settings` and a fixed `ch`-based cell, and **render the preview with `display: grid` of fixed-width cells OR measure actual advance width at runtime** and warn if `measureText('█') !== measureText('M')`. (3) Add a Playwright/visual test (the UI mentions none) asserting the rendered preview line widths match expected cell counts — otherwise "preview↔script parity" is only proven for *bytes*, never for *rendered width*, and the pet constraint is unverified in the medium where it matters.

---

## G. Pet color spans break the width invariant verification — and trailing-space stripping (MAJOR)

PET is the most rigorous doc but has two real holes:

1. **ANSI inside padded frames vs `visibleLen`.** PET §5 bakes ANSI into rows, and §7.2's invariant test checks `visibleLen(row) === pet.width` on the **un-colorized** stored art (`row.length`, "art carries no ANSI"). But the *emitted* frames in the script ARE colorized. The invariant test therefore validates the art, not the artifact. If `colorizeRow` has an off-by-one (e.g. emits a stray character, or a span with `col+len > width` slips past — the bounds test exists, good), the shipped frame could be mis-width and **no test catches it because the test runs on pre-colorized data.** **Fix:** add an invariant that runs `visibleLen(colorizeRow(row, spans, body))` (with the real ANSI-stripping `visibleLen`) `=== pet.width` for every frame. This closes the loop between the two `visibleLen` definitions PET §3 vs §2.1 ambiguously uses (one strips ANSI, one is `row.length`) — that dual definition is itself a latent contradiction.

2. **Terminals strip trailing whitespace — destroying right-side and shorter-pet alignment.** PET §3 composes left-side pets as `petCell + gap + rowCell` (pet cell is space-padded to width W, including in `blank` overflow lines). Critically, the **pet's own trailing spaces** (e.g. cactus row `| ,  , |` has internal+trailing spaces; the `blank` overflow line is *all* spaces) sit at end-of-line when rows are shorter or absent. Some terminals and many pagers/`tmux` capture-pane / CI log capture **strip trailing whitespace**, and a fully-blank padded line may collapse. For **left-side** pets the pet is at line-start so its width is preserved by leading content — fine. But the `blank` overflow line (`Hp>Nr` case) for a left pet is `"      " + gap + ""` = pure trailing spaces → **terminal may render an empty line, shifting nothing visually but breaking byte-parity** with the renderer that emitted the spaces. For **right-side** pets, the entire pet column is trailing → if a terminal strips it, the pet *vanishes*. **Fix:** (a) document that right-side pets rely on the terminal preserving trailing spaces and recommend left as default (PET already defaults left — good, but make the export UI warn on right). (b) For byte-parity, the renderer must emit exactly what the script emits including trailing spaces, and goldens must preserve them (ties into §B.3). (c) Consider emitting a zero-width-but-present terminator... no — better: for right-side pets, do NOT right-pad rowCell with spaces (PET's `padTo` adds trailing spaces that compound the problem); instead left-pad the pet column is impossible without knowing terminal width. Honest fix: **right-side pet is best-effort; mark it experimental.**

3. **PET §1 admits its own art is mis-counted** ("owl's authored width is 6 … the validation test will catch any row I miscounted"). Shipping art the author *knows* is uncounted, relying on a test to reject the build, is fine as process — but the cactus `panic` frame in the bash sample (§6) has `(!||!)` which is 6, while §1.1's panic row 2 is `(!||!)` — consistent — yet §1.1 row 0 panic `\||/ ` padded vs §6 bash `\\||/` with doubled backslash and a leading space: **the backslash-doubling in `$'...'` changes the visible count if done wrong.** `$'\\'` is one visible backslash; the author must count *post-unescape*. This is exactly where the invariant test must run on the **decoded** string, not the source literal. Reiterates fix G.1.

- **Severity: MAJOR. Affected: PET, CORE (renderer parity).**

---

## H. GitHub Pages: base path, SPA 404, and `.nojekyll` (MAJOR/MINOR)

CORE §7 sets `vite base: '/pimp-my-statusline/'`. Correct for a project page. But:

1. **SPA refresh 404:** the review prompt flags it; **CORE and UI both ignore it.** If the app uses any client-side routing (modals as routes, deep links to `/export`), a hard refresh on a sub-path 404s on GitHub Pages (no server rewrite). The designs use modals (UI §3) not routes, so this may be moot — **but only if they commit to no client-side routing.** **Fix:** state explicitly "single route, modal-based, no React Router" OR add the `404.html`-copy-of-`index.html` redirect hack. Decide and document.
2. **`.nojekyll`:** Vite emits `_assets`-style and the default Pages Jekyll pipeline **ignores files/folders starting with `_`**. Vite's default output uses `assets/` (no underscore) so usually fine, but **any `_`-prefixed file breaks silently.** **Fix:** add an empty `.nojekyll` to `public/` (it's the standard belt-and-suspenders for Vite-on-Pages). Neither design mentions it.
3. **Base-path correctness for self-hosted fonts/assets:** with `base: '/pimp-my-statusline/'`, any *absolute* asset reference (`/fonts/...`) breaks; must use Vite's `import.meta.env.BASE_URL` or relative imports. The self-hosted-font fix from §F must respect this. **Minor but a guaranteed broken-font-in-prod if missed.**
4. **The actions workflow:** CORE references `actions/deploy-pages` with `permissions: pages: write, id-token: write` — correct. But it places the **parity test (which spawns bash/python3/node) in the same workflow that must succeed before deploy.** Good. Just confirm `concurrency` group is set so rapid pushes don't race deploys (not mentioned).

- **Severity: MAJOR (404/base-path can ship a blank page), MINOR (.nojekyll). Affected: CORE, UI.**

---

## I. Re-import marker robustness (MAJOR)

CORE §6 / PET / UI describe three **different marker strings**, which is itself a contradiction:
- CORE §6: `pimp-my-statusline:v1:<base64url>`
- CORE §4 code samples: `# pimp-my-statusline:eyJ...` (no `:v1:`)
- UI §3: `# pms-config: <base64>` and `// pms-config:`
- PET: doesn't emit but inherits.

These **must be one canonical regex** or re-import silently fails depending on which doc the engineer follows. **Fix:** freeze ONE format. Recommend CORE §6's `pimp-my-statusline:v<N>:<base64url>` and delete the `pms-config` variant from UI.

Further robustness gaps:
1. **Size:** the full `StatuslineConfig` with per-frame pet `spans` for a custom pet, threshold stops, labels, and N rows can exceed a few KB base64. A multi-KB single-line comment is ugly but works in bash/python/node. However **users hand-edit these scripts** (decision #1). A user who tweaks a color in the script body but not the stale marker will, on re-import, **silently lose their hand edits** — the marker wins, the body is ignored. **This is a real UX trap.** **Fix:** (a) on import, after decoding, **regenerate the script and diff it against the imported text**; if they differ, warn "this script has hand edits that will be lost — the embedded config does not reflect them." (b) Document that the marker is the source of truth and hand edits aren't round-tripped.
2. **base64url + comment safety:** base64url avoids `/` `+` `=`, good — but a bash `#` comment with base64url is safe; a Node `//` comment is safe; **but if the base64 happens to contain the substring that the extraction regex over-matches across a multi-line file** (it won't, base64url has no newline) — fine. Real risk: **the marker line length** can trip some editors' line-length limits and `curl | bash` paste buffers. Minor.
3. **Migration `migrate(raw, v)`:** CORE asserts a v1→current chain but **version is hardcoded `1` everywhere**; there's no actual migration yet, which is fine for v1, but the Zod validation (CORE §6) must run **before** `migrate`, and CORE orders it "validate after decode" in one place and "migrate then validate" implied elsewhere. **Fix:** decode → migrate to current → **then** Zod-validate the migrated shape; reject with a clear error otherwise. Pin the order.

- **Severity: MAJOR. Affected: all three (format contradiction), CORE (round-trip semantics).**

---

## J. `echo -e` vs `printf '%b'` portability (MAJOR)

CORE §4's bash sample uses `echo -e` for the final emit; CORE §8 and PET §6 correctly switch to `printf '%b'` for OSC-8/multiline. This is an **internal inconsistency**, and `echo -e` is genuinely non-portable:
- The user's current script uses `echo -e` and works **because their shell is bash**. But Claude Code invokes the statusline via the configured command; if a user's `settings.json` runs it under `sh` (dash), `echo -e` **prints a literal `-e`** and renders escapes as text → totally broken statusline.
- **Severity: MAJOR. Affected: CORE (bash generator must standardize), PET (consistent — good).**
- **Fix:** Generated bash should **never** use `echo -e`. Use `printf '%b\n' "$LINE"` for every output line, uniformly (PET already does; CORE §4 must match). Also ensure the shebang is `#!/usr/bin/env bash` (CORE §4 shows `#!/bin/bash`; on systems where bash isn't at `/bin/bash` — some minimal/NixOS — `env` is safer) AND the script truly uses bash features (arrays in pet table, `$'...'`), so `sh` is not an option regardless — make that explicit and have the jq guard double as a bash-feature gate.

---

## K. Threshold semantics: `>=` vs `>` and color contradiction (MINOR/MAJOR)

- User script (lines 31–33): `>= 90` red, `>= 70` yellow, else green. CORE §1 `ThresholdColor` default stops `[{90,red},{70,yellow},{0,green}]` with "first matching (pct >= at) wins from the top" — consistent. **Good.**
- **But UI §1 palette comments say "70–89 amber, ≥90 red"** and uses `--warn:#FFB000` amber, while the **user's script emits ANSI `\033[33m` = yellow (xterm 3/11), not amber `#FFB000`.** Decision #7 says "default preset mirrors the user's current statusline." The **preview must render ANSI 33 with the actual xterm-256 hex for color 3/11, NOT the UI's designer-chosen `#FFB000`.** If `ansiToHtml`'s `XTERM256` table uses a "nice" amber for index 3, the preview won't match a real terminal, and worse, the **UI chrome threshold color and the previewed statusline threshold color will differ**, confusing users. **Fix:** the `XTERM256` table must be the *standard* xterm palette (the canonical 256 hex values), used verbatim by `ansiToHtml`. The UI's `--warn/--ok/--crit` are for **chrome only** and must be clearly separated from the preview's color table. CORE §3 says "standard … generated once" — make it the *de facto* xterm hex values (e.g. color 3 = `#808000`, color 11 = `#FFFF00`), and document that chrome ≠ terminal palette.
- Also: the user's bar uses `pct/20` (line 39, integer division, 5 buckets), while **CORE §4 sample uses `p*w/100`**. For `w=5`: `pct/20` vs `pct*5/100` = `pct/20` — algebraically identical in integer math? `97*5/100 = 485/100 = 4` (bash int) and `97/20 = 4` — equal. `99/20=4`, `99*5/100=4`. Equal for w=5. **But for other bar widths the two formulas differ in rounding**, and CORE generalized to `p*w/100` while the default preset must reproduce `pct/20`. They coincide only at w=5. Since default barWidth=5 (CORE §1), parity holds for the default — **but the moment a user sets barWidth=10, bash `p*w/100` and the renderer must agree, and both differ from the original `pct/20`.** Fine as long as renderer and generators all use `p*w/100`; just confirm the renderer does NOT special-case `/20`. **Minor, but call it out.**

- **Severity: MAJOR (preview color fidelity), MINOR (bar formula). Affected: UI vs CORE.**

---

## L. Smaller but real issues (MINOR)

1. **`COLUMNS` is not exported to the statusline subprocess by default.** CORE §8 relies on `COLUMNS` env for truncation/separator-full. Claude Code only sets it on v2.1.153+ (CORE notes this) — but `COLUMNS` is a **bash-only shell variable that is NOT exported** to child processes unless the parent exports it. The generated script reading `${COLUMNS:-80}` will usually get the fallback `80`, not the real width, unless Claude Code explicitly passes it in the JSON or env. **Fix:** verify against the docs whether width arrives via stdin JSON or env; if env, document that it may be absent and the `'full'` separator will fall back to 80. The `narrow` mock preset tests the renderer but **can't test the script's real COLUMNS behavior** since the test injects it — note this gap.

2. **Pet `seq`-free composition in bash** — PET §6 bash sample hardcodes 3 `printf` lines for a 3-row pet. Good (no loop). But it assumes `ROW1/SEP/ROW3` exist as exactly 3 rows; if the user configures **2 rows or 4 rows**, PET §3's `compose` must run, and the bash emission of a *variable* `Lout` loop with `blank` padding is **not shown** — only the fixed 3-row case is. The general bash composer (with `valign`, `maxRowWidth`, `strip_ansi`) is the hard part and is unspecified in concrete bash. **Risk:** the engineer ships only the 3-row happy path. **Fix:** specify the general bash composer or constrain v1 to pet-height == row-count (PET hints at this but doesn't enforce).

3. **`session_id` typed required in MockData but `session_name` optional** — fine. But CORE's MockData includes `_now`, `_columns`, `_gitBranch` (sim fields). The Zod schema (§6) for **re-import validates `StatuslineConfig`, not MockData** — confirm the mock sim fields never leak into the serialized config marker (they shouldn't; mock isn't part of config). Just confirm the marker serializes `config` only, not `mock`. CORE §6 says `JSON.stringify(config)` — good. Minor.

4. **OSC-8 hyperlinks (PR url) in a multi-line statusline**: docs warn these are glitchy; CORE §8 wraps them in `printf '%b'`. But OSC-8 links spanning a **pet-composed line** (pet fragment + row with a link) can confuse terminals on width math (the link's bytes are zero-width but some terminals miscount). **Minor**; recommend PR-url-as-link be off by default when a pet is enabled.

5. **Vite `base` and the ShareOnboardingGuide/asset URLs** — not relevant to runtime, skip.

6. **`uutils coreutils` in this dev environment, not GNU coreutils** — the local `date` is uutils 0.8.0, which is *mostly* GNU-compatible and *does* accept `date -d`. This masks the BSD problem during local dev. **The engineer testing on this Linux box will see peak work perfectly and wrongly conclude it's portable.** Worth a warning comment: never validate `date` portability on the dev box; test on macOS or with a BSD-date shim in CI.

---

## Prioritized fix list

**Blockers (must fix before any release):**
1. **§A** — Rewrite the bash peak-indicator helper to avoid all `date -d` forms (pure epoch arithmetic + portable `TZ=... date +%u/%H/%M/%S` on *current* time only); use `zoneinfo`/`Intl` for py/node; document Python `tzdata` fallback. Without this the flagship segment is broken on macOS.
2. **§B** — Funnel ALL time reads (including peak wall-clock decomposition) through one injected clock (`PMSL_NOW`/`TZ`) in every language so frozen-clock golden tests actually freeze peak; pin `TZ` and add a DST-boundary case to the matrix.
3. **§D** — Resolve the CORE-vs-PET truncate-vs-round contradiction: one rounding mode (recommend floor via `jq … | floor`, no `cut`), used by both value display and `selectMood`; add `.5` and near-zero mocks to the golden matrix.
4. **§E** — Fix the `printf '█%.0s'` zero-argument bug (prints one block at 0%); guard with `[ "$f" -gt 0 ]`; add exact-0% and exact-100% to the golden matrix. (The default preset fails parity without this.)

**Major (fix before "parity guaranteed" can be claimed honestly):**
5. **§J** — Standardize generated bash on `printf '%b\n'`, never `echo -e`; resolve CORE §4 vs §8 inconsistency; `#!/usr/bin/env bash`.
6. **§I** — Freeze ONE re-import marker format (kill the `pms-config` variant); decode→migrate→Zod-validate order; warn on hand-edited scripts losing edits on re-import.
7. **§F** — Self-host JetBrains Mono with `font-display:block`; add a rendered-width assertion test so preview alignment (the pet's premise) is verified in the browser, not just byte-wise.
8. **§G** — Run the pet width invariant on the **colorized** (post-ANSI) string, not the raw art; mark right-side pets experimental due to trailing-space stripping; reconcile the two `visibleLen` definitions.
9. **§C** — Emit a `jq` preflight guard (`exit 0`) in bash; make the export UI flag bash's jq dependency and nudge toward dependency-free Python/Node.
10. **§E (cost/locale)** — `LC_NUMERIC=C` for any bash `printf '%f'` (cost), or integer-cents formatting.
11. **§K** — `XTERM256` table must use the *standard* xterm hex values for preview fidelity; keep UI chrome colors (`--warn` amber) strictly separate from the terminal palette.
12. **§H** — Add `.nojekyll`; commit to modal-only (no client-side routing) or add the 404 redirect; ensure assets use `BASE_URL` not absolute paths.

**Minor (track, fix opportunistically):**
13. **§L.1** — Verify how `COLUMNS` actually reaches the script (env not exported by default); document `'full'` separator fallback to 80.
14. **§L.2** — Specify the *general* (variable-height) bash pet composer, or constrain v1 to pet-height == row-count.
15. **§L.6** — Add a CI note: never trust the local `uutils`/GNU `date` for portability; test against BSD `date`.
16. **§K (bar)** — Confirm renderer uses `p*w/100` uniformly (not the original `/20`); they coincide only at w=5.
17. **§I.2 / §L.4** — Marker line-length and OSC-8-under-pet caveats; default PR link off when pet enabled.

**Most dangerous single issue:** §A (BSD `date`), because it is invisible on the Linux dev box (uutils accepts `-d`), absent from all three designs, and breaks the headline peak feature for the majority macOS user base in production — the exact class of bug CI-on-ubuntu will never catch.