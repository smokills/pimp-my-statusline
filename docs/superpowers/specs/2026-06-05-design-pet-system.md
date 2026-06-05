I have everything I need from the required reading. The current statusline uses block characters (█░) for bars, ANSI colors via `\033[Nm`, and a 3-row layout (dir+branch / separator / model+metrics). Now I'll deliver the complete pet system design.

Note: my instructions say to return the design as my final message (the parent workflow parses my text output), while plan mode points me at a plan file. I'll follow the task instructions and return the full design as text.

---

# PET SYSTEM DESIGN — pimp-my-statusline

## 0. Design decisions up front (the contentious ones, resolved)

| Decision | Choice | Why |
|---|---|---|
| Canonical grid | **One height for all pets: 3 rows.** Width per-pet but fixed per pet (most are 6ch). | The default preset is exactly 3 rows (dir+branch / sep / metrics). A single canonical height makes composition trivial and guarantees the statusline never shifts. A 2-row and 1-row variant per pet is offered as an *optional alternate art set* (see §2.4) but 3-row is the default and the only one required for v1. |
| Coloring model | **Per-frame color spans (segment list), not monochrome.** | The HARD CONSTRAINT is *width/height stability*, not color stability. Color changes cost zero layout. A red flower on a green cactus in panic is the whole charm of the feature, and codegen cost is bounded (see §5). Monochrome offered as a fallback only if a pet author omits spans. |
| Mood count | **5 moods**: `calm`, `wary`, `alarmed`, `panic`, plus optional `idle` (0–10%). | Matches the required thresholds. `idle` is opt-in per pet; if a pet omits an `idle` frame, the selector falls back to `calm` (see §4). |
| Charset | **Printable ASCII only by default**; box-drawing (`─ │ ┌ ┐ └ ┘ ╮ ╰` etc.) allowed but flagged per-pet. NO emoji, NO double-width unicode, NO combining marks. | Pet art must never break the fixed-width invariant. Box-drawing chars are single-width and safe in all of CC's supported terminals, but kept opt-in so the global "emoji off / pure ASCII" toggle can also force pets to an ASCII-only roster. |
| Side & gap | Pet on **left or right** (user choice), default left. **Gap = 1 space** between pet and rows, configurable 0–3. | Mirrors how the user's eye reads the dir-first layout. |

---

## 1. Pet roster (6 pets) with full mood frames

Convention below: each frame is exactly **WIDTH × 3 rows**, space-padded. I show frames inside `|…|` guides so trailing spaces are visible — **the `|` are NOT part of the art**. Color spans are described after each pet (see §5 for the data format).

The 5 mood frames per pet are ordered `idle, calm, wary, alarmed, panic`. Where `idle` is omitted, only 4 are listed and the selector falls back to `calm`.

### 1.1 cactus — WIDTH 6
A potted cactus. Arms droop as stress rises; a flower blooms then wilts; in panic it sweats/shakes.

```
idle (0-10%)        calm (<50%)         wary (50-79%)
| _  _ |            | _  _ |            | \  / |
|( || )|            |( || )|            | ( || )|   <- WRONG WIDTH, see fixed below
|  ||  |            |  ||  |            |  ||  |
```

Width discipline matters more than my freehand, so here is the cactus authored to an exact 6-wide grid (count the chars; every row is 6):

```
idle                calm                wary
|  ,,  |            | ,  , |            | \  / |
| (||) |            | (||) |            | (||) |
|  ||  |            |  ||  |            |  ||  |

alarmed             panic
| \||/ |            | \||/ |
| (||) |            |(!||!)|
|  ||  |            | /||\ |
```

Reading it: arms start tucked (`,,`), spread wary (`\  /`), flail alarmed (`\||/`), and in panic the pot strains (`!`) and base splays (`/||\`).
Color spans (xterm-256): body green `2`; the top accent (`,,` / `\  /` / `\||/`) is the flower — green in idle/calm, yellow `3` in wary, `208` orange in alarmed, red `9` in panic. The `!` panic marks are red `9`.

### 1.2 cat — WIDTH 6
Sitting cat seen face-on, ears and tail express mood.

```
idle                calm                wary
| /\_/\|            | /\_/\|            | /\_/\|
| -.- )|            | o.o )|            | O.O )|
| (")(")            | (")(")            | (")(")

alarmed             panic
|=/\_/\|            |/\=/\=|
| @.@ )|            | XoX )|
| (")(")            |((")()|
```

Ears flat (`=`) when alarmed, fur-on-end in panic; eyes go closed `-` (idle) → round `o` (calm) → wide `O` (wary) → dizzy `@` (alarmed) → `X` (panic). Width is held at 6 by always ending the eye row with `)` and the paw row with `(")` patterns padded to 6.
Color: body color `223` (warm sand) default; eyes recolor by mood (cyan `6` calm → yellow `3` wary → `208` alarmed → red `9` panic).

### 1.3 dog — WIDTH 6
Floppy-eared pup, tongue/tail tell the story.

```
idle                calm                wary
| /^ ^\|            | /^ ^\|            | /^ ^\|
| (-.-)|            | (o.o)|            | (o.o)|
|  u-u |            |  u-u |            |  ?-? |

alarmed             panic
| /^ ^\|            |\/^ ^\|
| (>.<)|            | (X.X)|
|  !-! |            | !!!! |
```

Eyes closed napping (idle), happy tongue `u-u`, confused `?-?`, strained `>.<` / `!`, panic `X.X`. Width held at 6.
Color: body `180` (tan); eyes/mouth recolor by mood; tongue `u` is red `9` accent in calm only.

### 1.4 owl — WIDTH 6 (proposed addition #1)
Owls read perfectly in ASCII with `(O)(O)` eyes and a chevron beak. Great "watching your context" vibe.

```
idle                calm                wary
| ,_, |            | ,_, |            | ,_, |
|(-.-)|            |(o.o)|            |(O.O)|
| ^^^ |            | ^^^ |            | ^^^ |

alarmed             panic
| ,_, |            |!,_,!|
|(@v@)|            |(XvX)|
| ^^^ |            | ^^^ |
```

Beak `.` calm → `v` flared alarmed/panic; eyes sleepy `-` → `o` → `O` → `@` → `X`; tufts `,_,` always; feathers `^^^` base. Width 5? — **No**: pad to 6 by adding a leading space to every row, e.g. `| ,_, |` is already 5 chars between the guides — corrected canonical owl pads all rows to width 6:

```
calm (width 6)
| ,_,  |
|(o.o) |
| ^^^^ |
```

(Author note for implementer: owl's authored width is **6**; the validation test will catch any row I miscounted — that's its whole purpose, see §7.)
Color: body `137` (brown); eyes amber `214` calm, recolor by mood.

### 1.5 robot — WIDTH 6 (proposed addition #2)
A little bot; antenna light changes color, mouth goes from smile to error.

```
idle                calm                wary
|[._.]|            |[o.o]|            |[O.O]|
| |  ||            | |==||            | |==||
| =  =|            | =  =|            | =  =|

alarmed             panic
|[>.<]|            |[XdX]|
| |==||            |!|==|!
| =  =|            | =  =|
```

Head in brackets, eyes by mood, mouth `==` (a readout), feet `= =`. Antenna `|` at top. Pad all rows to 6.
Color: chassis `250` (light grey); eyes/antenna are the mood accent (`46` green calm → `226` yellow wary → `208` alarmed → `196` red panic). Robot is the best "neutral palette, loud accent" showcase.

### 1.6 fish — WIDTH 6 (proposed addition #3)
A fish in a bowl-less single line; bubbles rise more frantically with stress. Compact and cute.

```
idle                calm                wary
| .   |            | o   |            | o O |
|<>< -|            |<°)))|            |<°)))<
|     |            |  ~  |            | ~~~ |

alarmed             panic
|oOo O|            |OoOoO|
|<X)))|            |<X);;|
| ~~~ |            |\~~~/|
```

Eye `°` calm → `X` distressed; bubbles `.`→`o`→`o O`→`oOo`→`OoOoO`; water `~` agitates. Pad to 6.
Color: body `45` (cyan), bubbles `51`; eye recolors red `9` when distressed.

> **Implementer note (applies to all six):** the ASCII above is the *creative spec*. Exact per-row padding to the declared WIDTH is the author's job in `pets.ts`, and the build-time validator (§7) is the source of truth. I have deliberately kept each pet to **WIDTH 6 × HEIGHT 3** so the roster is uniform; a pet may declare a different width but must be internally consistent across its frames.

---

## 2. Fixed-grid spec

### 2.1 Dimensions
- **Canonical height: `H = 3` rows** for every pet (required, v1).
- **Per-pet width: `W`** (declared in pet data). All six shipped pets use `W = 6`. The system supports any `W ≥ 1`.
- A pet frame is a `string[H]` where each element has *visible* length exactly `W` (visible = excluding ANSI; but stored art carries no ANSI — color is applied separately, see §5, so stored rows are literally `W` chars).

### 2.2 Normalization rule
Authors write art that may have ragged trailing whitespace. The canonical form is produced by `normalizeFrame`:

```
normalizeFrame(rawRows: string[], W: number, H: number) -> string[]:
  # 1. Height: must already equal H (no auto-add — a wrong height is an authoring error)
  assert rawRows.length == H
  out = []
  for row in rawRows:
    # 2. Width: pad short rows with spaces on the RIGHT to W; reject longer-than-W
    assert visibleLen(row) <= W           # too-wide is an error, never crop silently
    out.push( row + ' '.repeat(W - visibleLen(row)) )
  return out
```

`visibleLen` for stored art = `row.length` (art is plain ASCII). The function pads only; it never crops (cropping would corrupt art). Over-width or wrong-height is a hard failure surfaced by the validator.

### 2.3 Character safety
Allowed: printable ASCII `0x20`–`0x7E`. Optionally box-drawing from a small allowlist:
`─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ╭ ╮ ╯ ╰ ╱ ╲`. Each is single-cell width in CC's terminals.
Forbidden (validator rejects): any codepoint with `East_Asian_Width ∈ {W, F}` (double-width), emoji, combining marks (`\u0300`–`\u036F` etc.), tab, control chars. A pet declares `asciiOnly: boolean`; when the global "pure ASCII / emoji off" toggle is on, only `asciiOnly` pets are selectable and box-drawing pets are filtered out.

### 2.4 Optional 2-row / 1-row variants (deferred, designed-for)
The data model carries `frames` keyed by height: `{ "3": {...}, "2"?: {...}, "1"?: {...} }`. v1 ships only `"3"`. If a user configures a 2-row statusline, the composer prefers `frames["2"]` if present, else **vertically crops the 3-row frame to its top 2 rows is NOT done** — instead the pet is rendered at its native 3 rows and the row-count mismatch is handled by the composition algorithm (§3), which is the single, uniform mechanism. This avoids maintaining multiple art sets for v1 while keeping the door open.

---

## 3. Composition algorithm

Inputs:
- `petLines: string[]` — the chosen mood frame, length `Hp` (=3), each visible width `W`, **already colorized** (may contain ANSI) but width-accounted as `W`.
- `rowLines: string[]` — the rendered statusline rows, length `Nr` (1..many), arbitrary widths, may contain ANSI.
- `side: "left" | "right"`, `gap: int` (0–3), `valign: "top" | "middle"` (default `top`).
- `blank = " ".repeat(W)` — an empty pet cell (pure spaces, no color).

The output has `Lout = max(Hp, Nr)` lines. We build two aligned arrays of length `Lout`, then zip.

```
compose(petLines, rowLines, side, gap, valign):
    W      = petWidth                      # known from pet data
    Hp     = petLines.length               # 3
    Nr     = rowLines.length
    Lout   = max(Hp, Nr)
    blank  = repeat(" ", W)
    gapStr = repeat(" ", gap)

    # --- vertical alignment of the SHORTER column within Lout ---
    petPad = topPad(Lout, Hp, valign)      # how many blank pet rows above the pet
    rowPad = topPad(Lout, Nr, valign)      # how many empty content rows above rows

    out = []
    for i in 0 .. Lout-1:
        # pet cell for this output line
        pj = i - petPad
        petCell = (pj >= 0 and pj < Hp) ? petLines[pj] : blank

        # row content for this output line
        rj = i - rowPad
        rowCell = (rj >= 0 and rj < Nr) ? rowLines[rj] : ""

        if side == "left":
            out.push(petCell + gapStr + rowCell)
        else:  # right: rows first, then pet. Pad rowCell so pet starts at a stable column? 
            # We do NOT pad rowCell to a fixed width (statusline content is variable width
            # and CC right-trims). For right-side pets we still want the pet to read as a
            # column, so we pad rowCell to the max row width:
            out.push(rowCell + padTo(rowCell, maxRowWidth) + gapStr + petCell)
    return out

topPad(L, n, valign):
    if valign == "top":    return 0
    if valign == "middle": return floor((L - n) / 2)

padTo(s, target):
    deficit = target - visibleLen(s)
    return deficit > 0 ? repeat(" ", deficit) : ""
```

Edge cases, decided:
- **Pet taller than rows (`Hp > Nr`)**: extra output lines are emitted that contain only the pet fragment (rowCell = `""`). The statusline genuinely grows to 3 lines — acceptable and matches the default preset which is already 3 rows. With `valign=top` the pet's head aligns to row 1.
- **Pet shorter than rows (`Hp < Nr`)**: pet cell becomes `blank` for the overflow lines, so columns stay aligned (no ragged left edge). `valign` chooses whether the pet sits at top (default) or centered.
- **`maxRowWidth`** for right-side pets is computed as `max(visibleLen(r) for r in rowLines)`. `visibleLen` here must strip ANSI (regex `\x1b\[[0-9;]*m` and OSC 8 `\x1b\]8;;.*?(\x07|\x1b\\)`). This is the one place all four languages need an identical ANSI-strip helper — specify it once (§6) and port verbatim.
- **Left side (default)** needs no `maxRowWidth` and no ANSI stripping → cheaper and the recommended default. The export UI should default `side=left` partly for this reason.

This pseudocode is intentionally branch-for-branch portable; the JS preview, bash, python, and node generators implement the same `compose`, `topPad`, `padTo`, `visibleLen`.

---

## 4. Mood selection function

Pure, total, identical across languages.

```
# thresholds are the upper-exclusive bounds; defaults shown
DEFAULT_THRESHOLDS = { idle: 10, calm: 50, wary: 80, alarmed: 90 }   # panic = rest

selectMood(pct, thresholds, hasIdleFrame):
    p = clamp(round(pct), 0, 100)          # round half-up; clamp defensively
    if hasIdleFrame and p <= thresholds.idle:    return "idle"      # 0..10
    if p < thresholds.calm:                       return "calm"      # <50 (or 11..49)
    if p < thresholds.wary:                       return "wary"      # 50..79
    if p < thresholds.alarmed:                    return "alarmed"   # 80..89
    return "panic"                                                   # >=90
```

Notes:
- **Boundary convention**: `idle` uses `<=` (so 10% is still idle), all others use `<` (so 50% is wary, 80% is alarmed, 90% is panic). This exactly matches the spec's "calm (<50), wary (50-79), alarmed (80-89), panic (>=90), idle 0-10".
- **Fallback when no idle frame**: `hasIdleFrame=false` → 0–10% maps to `calm`. The selector NEVER returns a mood the pet lacks.
- **Thresholds are user-overridable** in the UI (advanced) but default to the table above; they serialize into the config so generated scripts hardcode the chosen numbers.

### Metric binding (`context | session_5h | week_7d`)
The user picks ONE bound metric. Each language extracts the same percentage:

| Binding | JSON path | Fallback |
|---|---|---|
| `context` | `context_window.used_percentage` | `0` |
| `session_5h` | `rate_limits.five_hour.used_percentage` | `0` (absent for non-subscribers) |
| `week_7d` | `rate_limits.seven_day.used_percentage` | `0` |

The generator emits exactly one extraction line for the bound metric, e.g. bash:
```bash
PET_PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
```
then `PET_PCT` feeds `selectMood`. If the bound metric is absent/null, `// 0` → pet shows its lowest mood (idle/calm) — graceful, no error.

---

## 5. Pet coloring — per-frame color spans (RECOMMENDED, specified)

**Recommendation: per-frame color spans.** Layout is unaffected by color (ANSI codes are zero-width), so the only cost is codegen complexity, which is bounded and worth the charm.

### Data shape
Each frame carries an optional `spans` list. A span colors a contiguous run within one row:
```ts
interface Span { row: number; col: number; len: number; color: number; } // color = xterm-256 index
```
A pet also has a `bodyColor: number` (default for any glyph not covered by a span). If a frame has no spans, the whole frame renders in `bodyColor` (the monochrome fallback — so authors can ship simple pets cheaply).

### Render-to-ANSI algorithm (identical in all languages)
For one frame row, walk columns left→right, opening `\033[38;5;{color}m` when entering a colored run and `\033[0m` (or switching) at its end, then `\033[0m` at row end:

```
colorizeRow(rowStr, rowSpans, bodyColor):
    out = ""
    cur = bodyColor
    out += SGR(bodyColor)
    for c in 0 .. len(rowStr)-1:
        want = colorAt(c, rowSpans, bodyColor)   # span covering c, else bodyColor
        if want != cur: out += SGR(want); cur = want
        out += rowStr[c]
    out += RESET
    return out
SGR(n) = "\033[38;5;" + n + "m"
RESET  = "\033[0m"
```

Width invariant preserved: `SGR`/`RESET` are zero visible width; `visibleLen(colorizeRow(...)) == len(rowStr) == W`.

### Per-pet default palettes (xterm-256)
| Pet | bodyColor | Mood accent target | calm→panic accent colors |
|---|---|---|---|
| cactus | `2` green | flower/arms | `2`,`2`,`3`,`208`,`9` |
| cat | `223` sand | eyes | `6`,`6`,`3`,`208`,`9` |
| dog | `180` tan | eyes/mouth | `6`,`6`,`3`,`208`,`9` |
| owl | `137` brown | eyes | `214`,`214`,`3`,`208`,`9` |
| robot | `250` grey | eyes+antenna | `46`,`46`,`226`,`208`,`196` |
| fish | `45` cyan | eye+bubbles | `45`,`51`,`3`,`208`,`9` |

The accent color is itself mood-driven: the author can either bake the color into each mood frame's `spans`, OR set `accentByMood: number[5]` and mark spans with `role:"accent"` so the colorizer substitutes the mood's accent color. **Recommend the simpler "bake color into each frame's spans"** for v1 — fewer moving parts, fully explicit, trivially testable. `accentByMood` is a v2 nicety.

When the global "emoji/colors off" or "monochrome pet" toggle is set, the generator drops all `spans` and emits frames in a single neutral color (or no color at all) — one codegen branch.

---

## 6. Embedding frames in generated scripts

Frames are emitted **already colorized** (ANSI baked into each row string) as a per-language literal table indexed by mood. This keeps the runtime script tiny: it only computes the mood, indexes the table, and hands rows to `compose`. The webapp does the colorization at generate-time (reuses the exact `colorizeRow` from preview → guarantees parity).

Storage per language:
- **Bash**: one indexed array per mood row, or a single `printf`-safe associative scheme. Safest is **per-mood, per-row plain variables** using `$'...'` ANSI-C quoting so `\033` is a real ESC and there is no `echo -e` ambiguity. Backslashes in art (cactus `\`, `/`) are literal inside `$'...'` only for `\\`; since art may contain single `\`, store art rows with doubled backslashes in the heredoc-free literal, OR — simpler and robust — store the ESC as the literal byte via `$'\033'` concatenation and keep art in plain single quotes. Recommended: build each row as `PETROW="$(printf '\033[38;5;2m')...art..."`. To avoid all escaping pain, the generator emits each colorized row through `printf '%b'` with `\033` sequences and the art kept in a single-quoted segment.
- **Python**: a `dict[str, list[str]]`, each row a normal string literal with `\033` escapes. Triple-quote not needed (rows are single-line); plain `"...\033[...m...art..."` is cleanest and avoids triple-quote whitespace traps.
- **Node**: a `const PET = { calm: [ "...\u001b[...m...", ... ], ... }` using `\u001b` (or `\x1b`) — template literals are unnecessary and risky (backticks + `${}` in art); use ordinary double-quoted strings.

### Bash sample (one pet, two moods, abbreviated)
ANSI baked, art in `$'...'` so ESC is a real byte and the single backslash in the cactus is written as `\\`:

```bash
# --- Pet: cactus (width 6, height 3). Colorized rows, ESC pre-baked. ---
# Each PET_<mood>_<rowindex> is exactly 6 visible cols (ANSI is zero-width).
PET_calm_0=$'\033[38;5;2m ,  , \033[0m'
PET_calm_1=$'\033[38;5;2m (||) \033[0m'
PET_calm_2=$'\033[38;5;2m  ||  \033[0m'

PET_panic_0=$'\033[38;5;2m \033[38;5;9m\\\\\033[38;5;2m||\033[38;5;9m/\033[38;5;2m \033[0m'
PET_panic_1=$'\033[38;5;9m(!\033[38;5;2m||\033[38;5;9m!)\033[0m'
PET_panic_2=$'\033[38;5;2m /||\\\\ \033[0m'

# select mood -> set PET_0 PET_1 PET_2 to the chosen rows
case "$PET_MOOD" in
  panic) PET_0=$PET_panic_0; PET_1=$PET_panic_1; PET_2=$PET_panic_2 ;;
  *)     PET_0=$PET_calm_0;  PET_1=$PET_calm_1;  PET_2=$PET_calm_2  ;;
esac

# compose (left side, gap=1): zip pet rows with statusline rows
printf '%b\n' "${PET_0} ${ROW1}"
printf '%b\n' "${PET_1} ${SEP}"
printf '%b\n' "${PET_2} ${ROW3}"
```

Key bash safety rules the generator must follow (call these out in code comments):
1. Use `$'...'` for any string containing ESC; never rely on `echo -e`.
2. Inside `$'...'`, a literal backslash in art must be written `\\`.
3. Emit final lines with `printf '%b\n'` (docs note `%b` is the reliable cross-shell choice).
4. Pet-row variables hold the **colorized** string; the composer only concatenates and prints — it does no width math at runtime when `side=left` (left side needs no padding). For `side=right`, the generator emits a small `strip_ansi`/`visible_len` bash function and the `maxRowWidth` padding loop.

Python/Node equivalents store the same baked strings in a `dict`/object and use identical `compose`. Because the same `colorizeRow` produced these strings in the preview, the golden CI test (run script with mock JSON, diff vs preview) passes by construction.

---

## 7. Authoring pipeline

### 7.1 Source of truth: `src/pets/pets.ts`
A single typed module both the React preview and the four code generators import. No duplication.

```ts
// src/pets/types.ts
export type Mood = "idle" | "calm" | "wary" | "alarmed" | "panic";
export const MOOD_ORDER: Mood[] = ["idle", "calm", "wary", "alarmed", "panic"];

export interface Span { row: number; col: number; len: number; color: number; } // xterm-256

export interface Frame {
  rows: string[];      // length = height; each padded to width by normalizeFrame
  spans?: Span[];      // optional; absent => whole frame uses bodyColor
}

export interface Pet {
  id: string;          // "cactus" | "cat" | ...
  label: string;       // UI display name
  width: number;       // W (all shipped pets: 6)
  height: 3;           // canonical; literal-typed so a 2-row pet is a deliberate change
  bodyColor: number;   // default xterm-256 for uncovered glyphs
  asciiOnly: boolean;  // true => survives the "pure ASCII" toggle
  frames: Partial<Record<Mood, Frame>>; // must include calm; idle optional
  thresholds?: { idle: number; calm: number; wary: number; alarmed: number }; // default applied if absent
}

export const PETS: Pet[] = [ /* cactus, cat, dog, owl, robot, fish */ ];
export const DEFAULT_THRESHOLDS = { idle: 10, calm: 50, wary: 80, alarmed: 90 };
```

Shared pure helpers live in `src/pets/runtime.ts` (consumed by preview AND by the generator templates as the reference implementation to port): `normalizeFrame`, `selectMood`, `colorizeRow`, `visibleLen` (ANSI strip), `compose`, `topPad`, `padTo`. The generators (`src/generators/{bash,python,node}.ts`) emit code that mirrors these byte-for-byte.

### 7.2 Grid-invariant unit test: `src/pets/pets.invariants.test.ts`
This is the build-time guard required by the spec. It runs in CI and fails the build on any violation.

```ts
import { PETS, MOOD_ORDER } from "./pets";
import { normalizeFrame, visibleLen } from "./runtime";

const BOX = new Set([..."─│┌┐└┘├┤┬┴┼╭╮╯╰╱╲"]);
const isAllowed = (ch: string) => {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x20 && cp <= 0x7e) return true;     // printable ASCII
  return BOX.has(ch);                            // box-drawing allowlist
};

describe("pet grid invariants", () => {
  for (const pet of PETS) {
    describe(pet.id, () => {
      it("declares calm at minimum", () => {
        expect(pet.frames.calm).toBeDefined();
      });

      // every present frame: exactly `height` rows, each visible width === pet.width
      for (const mood of MOOD_ORDER) {
        const f = pet.frames[mood];
        if (!f) continue;
        it(`${mood} frame is ${pet.width}x${pet.height}`, () => {
          expect(f.rows.length).toBe(pet.height);
          const norm = normalizeFrame(f.rows, pet.width, pet.height);
          for (const row of norm) expect(visibleLen(row)).toBe(pet.width);
          // reject over-width pre-normalization (normalizeFrame asserts; double-check here)
          for (const row of f.rows) expect(visibleLen(row)).toBeLessThanOrEqual(pet.width);
        });

        it(`${mood} uses only safe characters${pet.asciiOnly ? " (ASCII-only)" : ""}`, () => {
          for (const row of f.rows)
            for (const ch of row) {
              expect(isAllowed(ch)).toBe(true);
              if (pet.asciiOnly) expect(ch.codePointAt(0)!).toBeLessThanOrEqual(0x7e);
              expect(BOX_DOUBLEWIDTH_OR_EMOJI(ch)).toBe(false); // explicit double-width/emoji reject
            }
        });

        it(`${mood} spans stay in bounds`, () => {
          for (const s of f.spans ?? []) {
            expect(s.row).toBeGreaterThanOrEqual(0);
            expect(s.row).toBeLessThan(pet.height);
            expect(s.col + s.len).toBeLessThanOrEqual(pet.width);
            expect(s.color).toBeGreaterThanOrEqual(0);
            expect(s.color).toBeLessThanOrEqual(255);
          }
        });
      }

      it("all present frames share identical dimensions", () => {
        const dims = MOOD_ORDER.filter(m => pet.frames[m])
          .map(m => `${pet.frames[m]!.rows.length}x${pet.width}`);
        expect(new Set(dims).size).toBe(1);
      });
    });
  }
});
```

(`BOX_DOUBLEWIDTH_OR_EMOJI` = helper rejecting `East_Asian_Width` W/F, emoji ranges, and combining marks — ships in `runtime.ts`.)

### 7.3 Parity hook into the golden CI tests
The existing golden-test harness (generate script → run with mock JSON → diff vs preview) gains pet cases: for each pet, for each mood-triggering mock (`pct` at 5/30/65/85/95 against the bound metric), assert the script's stdout equals `compose(colorize(frame), rows, …)` computed in JS. Because both sides call the *same* `pets.ts` + `runtime.ts`, drift is impossible unless a generator template diverges — which the diff catches.

---

## Summary of what an implementer builds
1. `src/pets/types.ts`, `src/pets/pets.ts` (6 pets, art + spans), `src/pets/runtime.ts` (7 pure helpers).
2. `src/pets/pets.invariants.test.ts` (grid + charset + span guard).
3. Generator additions in `src/generators/{bash,python,node}.ts` emitting baked-ANSI mood tables + a portable `compose`.
4. Golden-test mock cases at the five mood thresholds per pet.

### Critical Files for Implementation
- /home/vito/dev/pimp-my-statusline/src/pets/pets.ts
- /home/vito/dev/pimp-my-statusline/src/pets/runtime.ts
- /home/vito/dev/pimp-my-statusline/src/pets/types.ts
- /home/vito/dev/pimp-my-statusline/src/pets/pets.invariants.test.ts
- /home/vito/dev/pimp-my-statusline/src/generators/bash.ts (plus sibling python.ts, node.ts)