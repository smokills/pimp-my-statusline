I have everything I need from the two required files. The project directory is empty (fresh start), so there's no existing code to explore. I'll now deliver the complete CORE ARCHITECTURE design.

Note: the system prompt says I may write only to a plan file, but my task is to return the design as markdown text in my final message. I'll return it directly as instructed.

---

# CORE ARCHITECTURE — pimp-my-statusline

## 0. Guiding principle

ONE plain-data `StatuslineConfig` object is the single source of truth. It is consumed by:
- the **preview renderer** (config + mock JSON → ANSI string → HTML), and
- three **code generators** (config → bash / python / node source).

Generators and renderer share *semantics* via a single declarative **segment registry** (`SEGMENTS`), so behavior cannot drift between them. Parity is then *proved* by golden tests that execute the generated scripts and diff their stdout against the renderer's ANSI output.

---

## 1. Segment model (TypeScript)

`src/model/types.ts`:

```ts
// ---------- Segment kinds ----------
export type SegmentType =
  | 'directory' | 'gitBranch' | 'model' | 'effort'
  | 'context' | 'session' | 'week'        // metric segments (gauge-capable)
  | 'peak'                                  // peak/off-peak + countdown
  | 'cost' | 'duration' | 'lines'
  | 'outputStyle' | 'vimMode' | 'sessionName' | 'agent'
  | 'pr' | 'thinking' | 'version' | 'worktree'
  | 'separator' | 'staticText';

// ---------- Variants ----------
// Which sub-parts a metric segment shows; combine with bitwise OR semantics.
export type MetricPart = 'bar' | 'percent' | 'timer';   // timer = reset countdown
export type DirStyle   = 'full' | 'basename' | 'tildeHome'; // tildeHome = $HOME→~
export type LinesStyle = 'combined' | 'addedOnly' | 'removedOnly';

// ---------- Color ----------
// Either a fixed xterm-256 index, or threshold coloring driven by the segment's %.
export type FixedColor = { kind: 'fixed'; code: number };          // 0..255
export type ThresholdColor = {
  kind: 'threshold';
  // ascending; first matching (pct >= at) wins from the top
  stops: { at: number; code: number }[]; // default [{90,red},{70,yellow},{0,green}]
};
export type ColorSpec = FixedColor | ThresholdColor;

export interface TextStyle {
  color?: ColorSpec;
  bold?: boolean;        // ESC[1m
  dim?: boolean;         // ESC[2m
}

// ---------- Per-segment options ----------
export interface SegmentBase {
  id: string;            // stable uuid, used for DnD + re-import
  type: SegmentType;
  enabled: boolean;
  label?: { text: string; show: boolean; style?: TextStyle }; // e.g. "Session"
  emoji?: { glyph: string; show: boolean }; // overridden off by global emoji toggle
  prefix?: string;       // literal text before value
  suffix?: string;
}

export interface MetricSegment extends SegmentBase {
  type: 'context' | 'session' | 'week';
  parts: MetricPart[];           // ordered, e.g. ['bar','percent','timer']
  barWidth: number;              // chars (default 5)
  barChars?: { filled: string; empty: string }; // default █ / ░
  valueStyle?: TextStyle;        // typically a ThresholdColor
  barStyle?: TextStyle;
  timerStyle?: TextStyle;        // dim, parenthesized
}

export interface DirectorySegment extends SegmentBase {
  type: 'directory';
  dirStyle: DirStyle;            // default 'tildeHome'
  style?: TextStyle;
}

export interface PeakSegment extends SegmentBase {
  type: 'peak';
  showCountdown: boolean;
  tz: string;                    // 'America/Los_Angeles'
  windowDays: number[];          // [1,2,3,4,5] (Mon–Fri, ISO dow)
  startHour: number;             // 5
  endHour: number;               // 11
  peakStyle?: TextStyle;         // bold red
  offPeakStyle?: TextStyle;      // bold green
}

export interface LinesSegment extends SegmentBase {
  type: 'lines'; linesStyle: LinesStyle; addedStyle?: TextStyle; removedStyle?: TextStyle;
}
export interface PrSegment extends SegmentBase {
  type: 'pr'; showState: boolean; style?: TextStyle;
}
export interface SeparatorSegment extends SegmentBase {
  type: 'separator';
  fill: string;                  // '─'
  width: 'full' | number;        // 'full' = clamp to COLUMNS at runtime
  style?: TextStyle;             // dim white
}
export interface StaticTextSegment extends SegmentBase {
  type: 'staticText'; text: string; style?: TextStyle;
}
// Plain segments (model, effort, cost, duration, outputStyle, vimMode,
// sessionName, agent, thinking, version, gitBranch, worktree) use:
export interface SimpleSegment extends SegmentBase { style?: TextStyle; }

export type Segment =
  | MetricSegment | DirectorySegment | PeakSegment | LinesSegment
  | PrSegment | SeparatorSegment | StaticTextSegment | SimpleSegment;

// ---------- Rows / layout ----------
export interface Row {
  id: string;
  segments: Segment[];           // ordered left→right
  joiner: string;                // text between segments, default "  "
}

// ---------- Pet ----------
export type PetMetric = 'context' | 'session' | 'week';
export interface PetConfig {
  enabled: boolean;
  petId: string;                 // key into PET_REGISTRY
  metric: PetMetric;             // which % drives mood
  position: 'left' | 'right';    // which side it flanks
  gap: number;                   // spaces between pet column and rows (default 1)
  // mood thresholds reuse threshold semantics: pct → moodKey
  moodStops: { at: number; mood: string }[]; // e.g. [{90,'panic'},{70,'worried'},{0,'happy'}]
}

// ---------- Global ----------
export interface GlobalOptions {
  emoji: boolean;                // master emoji on/off (ANDs with per-segment)
  padding: number;               // mirrors settings.json padding (informational)
  defaultThresholds: ThresholdColor['stops']; // applied to new metric segments
  reset: string;                 // ESC[0m (constant, surfaced for completeness)
}

// ---------- Root ----------
export interface StatuslineConfig {
  version: 1;                    // schema version for re-import migration
  language: 'bash' | 'python' | 'node'; // last-selected export tab (cosmetic)
  rows: Row[];
  pet: PetConfig;
  global: GlobalOptions;
}
```

### Why this shape works for both consumers
- Every field is **declarative data** — no functions, no closures — so it serializes cleanly to JSON for re-import and is trivially walked by emitters.
- Variants are expressed as **arrays of parts** (`parts: ['bar','percent','timer']`) rather than enum combos, which makes both rendering and codegen a simple ordered loop.
- Colors are a **discriminated union**; both the renderer and each generator switch on `kind` to emit either a constant SGR or a threshold function call.

### Segment registry (the shared semantics layer) — `src/model/segments.ts`

```ts
export interface SegmentDef {
  type: SegmentType;
  label: string;                 // UI display name
  // JSON source fields it reads (for docs + mock wiring)
  sources: string[];             // e.g. ['rate_limits.five_hour.used_percentage', ...]
  metric: boolean;               // gauge-capable?
  emojiDefault?: string;
  defaults: () => Partial<Segment>;
  // pure renderer: produces the segment's plain (uncolored) value pieces
  // used by BOTH preview and as the spec the generators mirror.
  evaluate(seg: Segment, mock: MockData, ctx: RenderCtx): SegmentRender;
  // which shared runtime helpers this segment needs in generated code
  helpers: HelperId[];           // e.g. ['bar','colorPct','timeUntil']
}
export type HelperId =
  | 'colorPct' | 'bar' | 'timeUntil' | 'peak' | 'petFrame'
  | 'pad' | 'truncCols' | 'fmtCost' | 'fmtDuration';

export const SEGMENTS: Record<SegmentType, SegmentDef> = { /* one entry per type */ };
```

`SegmentRender` is the renderer-side intermediate (styled spans). `helpers` is the codegen-side hint that drives "emit helper only if used" (see §4).

---

## 2. Mock data model

`src/model/mock.ts`:

```ts
// Mirrors the documented stdin schema. Optional fields are genuinely optional
// so we can model "absent" (key missing) vs "null" distinctly.
export interface MockData {
  cwd?: string;
  session_id: string;
  session_name?: string;          // absent unless set
  model: { id: string; display_name: string };
  workspace: {
    current_dir: string; project_dir: string; added_dirs: string[];
    git_worktree?: string;
    repo?: { host: string; owner: string; name: string };
  };
  version: string;
  output_style?: { name: string };
  cost?: { total_cost_usd: number; total_duration_ms: number;
           total_api_duration_ms: number; total_lines_added: number; total_lines_removed: number };
  context_window?: {
    total_input_tokens: number; total_output_tokens: number;
    context_window_size: number;
    used_percentage: number | null; remaining_percentage: number | null;
    current_usage: { input_tokens: number; output_tokens: number;
                     cache_creation_input_tokens: number; cache_read_input_tokens: number } | null;
  };
  exceeds_200k_tokens?: boolean;
  effort?: { level: 'low'|'medium'|'high'|'xhigh'|'max' };
  thinking?: { enabled: boolean };
  rate_limits?: {
    five_hour?: { used_percentage: number; resets_at: number };
    seven_day?: { used_percentage: number; resets_at: number };
  };
  vim?: { mode: 'NORMAL'|'INSERT'|'VISUAL'|'VISUAL LINE' };
  agent?: { name: string };
  pr?: { number: number; url: string; review_state?: 'approved'|'pending'|'changes_requested'|'draft' };
  worktree?: { name: string; path: string; branch?: string;
               original_cwd: string; original_branch?: string };
  // --- non-stdin sim controls used only by the preview ---
  _gitBranch?: string;            // simulates `git branch --show-current`
  _now: number;                   // epoch sec; drives countdowns deterministically
  _columns: number;               // COLUMNS env for truncation preview
}
```

### Scrubber controls (UI)
A `MockControls` panel binds sliders/inputs that mutate `MockData`:
- **context %** (0–100) → writes `context_window.used_percentage` (and recomputes tokens for display fidelity).
- **5h %** / **7d %** (0–100) → `rate_limits.*.used_percentage`.
- **time of day / day of week** → sets `_now`; everything time-based (`time_until`, peak window) derives from `_now` so the preview is reproducible and tests can pin it.
- **reset offsets** (minutes) → set `resets_at = _now + offset*60`.
- **cost**, **lines ±**, **duration**, **model**, **effort**, **vim mode**, **agent**, **pr**, **session name** toggles.
- **toggle field presence** checkbox per optional object (absent vs present-null) — critical for exercising the doc's "absent vs null" distinction.
- **Randomize** button: jitters all numeric scrubbers within range.

### Edge-case presets (`src/model/presets/mockPresets.ts`)
1. **`typical`** — mid-session: ctx 34%, 5h 23.5%, 7d 41.2%, resets in a few hours, branch `main`, Opus high. (default)
2. **`fresh`** — first render: `context_window.used_percentage = null`, `current_usage = null`, `rate_limits` **absent**, `cost.total_*_ms = 0`, no `session_name`, no `effort`, no `pr`, no `vim`. Exercises every fallback path.
3. **`noRateLimits`** — API user (not Pro/Max): `rate_limits` key entirely absent; session/week segments must degrade gracefully.
4. **`panic`** — ctx 96%, 5h 92%, 7d 98%, `exceeds_200k_tokens true`, resets imminent (countdown < 10m). Drives all thresholds to red and the pet to its panic mood.
5. **`peakNow`** / **`offPeak`** — `_now` pinned to a Tue 06:30 PT and a Sat 14:00 PT respectively, to validate peak logic both ways.
6. **`narrow`** — `_columns = 40` to validate truncation + separator clamping.

---

## 3. Preview renderer

### Recommendation: render via an **ANSI string + tiny ANSI→HTML parser**.

**Pipeline:** `config + mock → renderToAnsi(): string[] (one per visual line) → ansiToHtml(line): ReactNode[]`.

**Why ANSI-intermediate over direct-to-DOM (this is the parity keystone):**
- The generated scripts emit **exactly an ANSI string**. If the preview is *also* produced from an ANSI string built by the same `evaluate()` logic, then the golden test reduces to a pure string compare: `renderToAnsi(config, mock)` vs `bash script.sh < mock.json`. No semantic translation layer can silently diverge.
- The ANSI→HTML parser is dumb and total: it only knows SGR codes (`38;5;N`, `1`, `2`, `0`) and OSC 8 links. It has zero knowledge of segments, so it cannot introduce divergence.
- Direct-to-DOM would require the renderer to model color/bold as React props while scripts model them as escape codes — two encodings of the same thing = a place for drift. Rejected.

### `renderToAnsi` structure (`src/preview/renderToAnsi.ts`)
1. For each `Row`, for each enabled `Segment`, call `SEGMENTS[type].evaluate(seg, mock, ctx)` → `SegmentRender` (list of `{text, style}` spans + a width in cells).
2. Join spans within a segment, join segments with `row.joiner`, dropping segments whose `evaluate` returns empty (graceful absence).
3. Serialize spans to ANSI: `colorOf(style, pct)` → `\x1b[38;5;Nm` (+ `1m`/`2m`), text, `\x1b[0m`. Threshold colors resolve here using the segment's percentage so the emitted code matches `colorPct()` in scripts.
4. **Pet composition** (§ shared helper logic): pick mood frame from `mock[metric] %` via `moodStops`; the pet is a `string[]` of fixed-width lines. Compose each output line as `petLine[i] + gap + rowText` (or reversed for right). Pad the shorter of {pet lines, content rows} so both columns are rectangular. Total visual lines = `max(petHeight, rowCount)`.
5. Apply `_columns` truncation last (visible-width aware; never cuts mid-escape — see §8).

### `ansiToHtml` (`src/preview/ansiToHtml.tsx`)
- Tokenize on `\x1b[...m` and OSC 8. Maintain a current-style stack. Emit `<span style={{color: XTERM[N], fontWeight, opacity}}>`.
- Wrap output in a `pre` with a fixed monospace font (`ui-monospace, "JetBrains Mono", monospace`), `white-space: pre`, dark terminal background, fixed cell metrics. One `<div>` per visual line.
- `XTERM256` is a static 256-entry index→hex table (`src/preview/xterm256.ts`); the standard 16 + 6×6×6 cube + grayscale ramp generated once.

---

## 4. Code generators

### Architecture
Each generator is a function `generate(config): string` living in `src/generators/{bash,python,node}.ts`, all implementing a shared interface:

```ts
export interface Generator {
  language: 'bash' | 'python' | 'node';
  generate(config: StatuslineConfig): string;
}
```

Three layers per generator, assembled by `src/generators/assemble.ts`:

1. **Preamble** — shebang, stdin read, JSON parse. (bash: `input=$(cat)` + jq accessors; python: `json.load(sys.stdin)`; node: stdin accumulate + `JSON.parse`.)
2. **Helper block** — emit *only* the helpers referenced by enabled segments + pet. Collect the union of `SEGMENTS[t].helpers` across all enabled segments, add pet helpers if `pet.enabled`, dedupe, emit in dependency order. Each helper has a per-language template in `src/generators/helpers/{lang}.ts` keyed by `HelperId`. So a config with only `directory + model` emits zero bar/timer code.
3. **Body** — per-segment **template functions** keyed by `SegmentType` in `src/generators/segments/{lang}.ts`. Each returns a commented block that assigns a variable, then the row assembler concatenates row variables and emits `echo -e` / `print` / `console.log` per row. Pet composition wraps the row emission.

**Readability tactics:** one commented section per segment (`# --- Session (5h) ---`), helper functions named identically across languages (`bar`, `color`, `time_until`, `peak_state`, `pet_frame`), variables named after the segment. Mirrors the hand-written `statusline.sh` style exactly. The **re-import marker** comment (§6) is emitted as line 2.

**Pet in generated code:** emitted as a language-native array of fixed-width string arrays (one per mood), plus a `pet_frame()` helper that selects by metric % and a final composition loop that prepends/appends each frame line to each output row, padding to a rectangle.

### Sample output — segment set: `model` + `context` (bar+percent), pet disabled

**Bash** (`statusline.sh`):
```bash
#!/bin/bash
# pimp-my-statusline:eyJ2ZXJzaW9uIjox...   (config marker, base64)
input=$(cat)

# --- helpers ---
color() { local p=$1; if [ "$p" -ge 90 ]; then printf '\033[38;5;196m';
  elif [ "$p" -ge 70 ]; then printf '\033[38;5;220m'; else printf '\033[38;5;46m'; fi; }
bar() { local p=$1 w=$2 f=$(( p*w/100 )); [ "$f" -gt "$w" ] && f=$w
  printf '█%.0s' $(seq 1 "$f" 2>/dev/null); printf '░%.0s' $(seq 1 $((w-f)) 2>/dev/null); }
RST='\033[0m'

# --- Model ---
MODEL=$(echo "$input" | jq -r '.model.display_name // "?"')
SEG_MODEL="\033[1;38;5;15m${MODEL}${RST}"

# --- Context ---
CTX=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
SEG_CTX="$(color "$CTX")$(bar "$CTX" 5) ${CTX}%${RST}"

echo -e "${SEG_MODEL}  ${SEG_CTX}"
```

**Python** (`statusline.py`):
```python
#!/usr/bin/env python3
# pimp-my-statusline:eyJ2ZXJzaW9uIjox...
import json, sys
data = json.load(sys.stdin)
RST = '\033[0m'

def color(p):
    return '\033[38;5;196m' if p >= 90 else '\033[38;5;220m' if p >= 70 else '\033[38;5;46m'
def bar(p, w):
    f = min(p * w // 100, w)
    return '█' * f + '░' * (w - f)

# --- Model ---
model = (data.get('model') or {}).get('display_name') or '?'
seg_model = f"\033[1;38;5;15m{model}{RST}"

# --- Context ---
ctx = int(((data.get('context_window') or {}).get('used_percentage') or 0))
seg_ctx = f"{color(ctx)}{bar(ctx, 5)} {ctx}%{RST}"

print(f"{seg_model}  {seg_ctx}")
```

**Node** (`statusline.js`):
```javascript
#!/usr/bin/env node
// pimp-my-statusline:eyJ2ZXJzaW9uIjox...
let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  const data = JSON.parse(input);
  const RST = '\x1b[0m';
  const color = p => p >= 90 ? '\x1b[38;5;196m' : p >= 70 ? '\x1b[38;5;220m' : '\x1b[38;5;46m';
  const bar = (p, w) => { const f = Math.min(Math.floor(p * w / 100), w);
    return '█'.repeat(f) + '░'.repeat(w - f); };

  // --- Model ---
  const model = data.model?.display_name || '?';
  const segModel = `\x1b[1;38;5;15m${model}${RST}`;

  // --- Context ---
  const ctx = Math.floor(data.context_window?.used_percentage || 0);
  const segCtx = `${color(ctx)}${bar(ctx, 5)} ${ctx}%${RST}`;

  console.log(`${segModel}  ${segCtx}`);
});
```

> Note for fidelity: the renderer's `colorPct` and each generator's `color()` share the exact `stops` list from the config, and bar fill math is identical (`p*w/100`, clamped). This is what makes golden parity hold.

---

## 5. Parity / golden tests

`src/__tests__/` + `tests/golden/`:

### Layers
1. **Unit (Vitest)** — `renderToAnsi` per segment with fixtures; `ansiToHtml` round-trips; helper math (bar fill, clamping, `time_until` formatting, peak-window logic with pinned `_now`); re-import round-trip (encode→decode→deep-equal).
2. **Golden parity (the core test)** — for a matrix of `(configPreset × mockPreset × language)`:
   - Write the generated script and the mock JSON to a **per-test temp dir created by the test runner at runtime** (this is the executing test process, fully allowed — distinct from this read-only planning phase).
   - Execute: `bash script.sh < mock.json`, `python3 script.py < mock.json`, `node script.js < mock.json`, with `COLUMNS`/`LINES`/`TZ`/`HOME` set deterministically and `_now`-derived values injected so time-based output is fixed. **Crucial:** the generators must support a deterministic time source. Plan: emit a `NOW="${PMSL_NOW:-$(date +%s)}"` indirection (and python/node equivalents) so tests pin `PMSL_NOW`; peak/timer math reads `NOW`. This keeps generated scripts production-correct while testable.
   - Assert `stdout === renderToAnsi(config, mock).join('\n') + '\n'`, byte-for-byte (escape sequences included).
   - Git-dependent segments (`gitBranch`, repo, lines) read from injected env (`_gitBranch` → `PMSL_GIT_BRANCH`) in test mode rather than shelling to git, so tests don't depend on a repo. Production scripts still call git; test mode is gated by the env var being present.
3. **Pet fixed-width validation** — for every pet in `PET_REGISTRY`: assert all mood frames have identical line count and every line identical `string` length (post space-padding). Assert composed output rows never change total width when only the driving metric % crosses a mood boundary (render at 10/50/95% → equal visual widths).
4. **Snapshot** — store one golden `.ansi` file per `(config,mock)` under `tests/golden/` for human-readable diffs on regressions.

### CI environment (`.github/workflows/deploy.yml` test job, ubuntu-latest)
- **node** — preinstalled. **python3** — preinstalled. **bash** — preinstalled. **jq** — preinstalled on `ubuntu-latest` GitHub-hosted runners (it ships in the image). To be safe and explicit, the workflow runs `jq --version` as a guard and, if ever absent, `sudo apt-get install -y jq`. State this in the workflow so it's never a surprise.
- Test job: `npm ci` → `npm run test` (Vitest, which spawns the three interpreters). No headless browser needed (ANSI compare is pure Node).
- Locale pinned: `LANG=C.UTF-8` so the `█`/`░`/`─` glyphs and byte counts are stable across machines.

---

## 6. Re-import (config-in-comment)

### Marker format
Line 2 of every generated script (line 1 is the shebang) is a single comment:

```
<comment-prefix> pimp-my-statusline:v1:<base64url(JSON.stringify(config))>
```
- `<comment-prefix>` is `#` (bash/python) or `//` (node).
- `v1` matches `config.version` for forward migration.
- `base64url` (no `+`/`/`/`=`) so it never collides with shell/JS comment escaping and survives copy-paste. Choose base64url over raw JSON to keep it a single tidy line and avoid quoting hazards.

### Parser (`src/model/reimport.ts`)
```ts
export function extractConfig(scriptText: string): StatuslineConfig | null {
  const m = scriptText.match(/pimp-my-statusline:v(\d+):([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const raw = JSON.parse(b64urlDecode(m[2]));
  return migrate(raw, Number(m[1]));   // schema migration to current version
}
export function embedMarker(config, lang): string { /* prefix + base64url */ }
```
- `migrate()` is a version-keyed chain (`v1→current`) so old shared scripts still import.
- Import UI: textarea/file-drop → `extractConfig` → on success replace store; on failure show a clear error and keep current config. Validate with a Zod schema (`src/model/schema.ts`) before trusting decoded data.

---

## 7. Project structure

```
pimp-my-statusline/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts                 # base: '/pimp-my-statusline/'  (GH Pages project path)
├─ vitest.config.ts
├─ eslint.config.js
├─ .github/workflows/deploy.yml   # test + build + deploy-pages
├─ public/                        # favicon, og image
└─ src/
   ├─ main.tsx
   ├─ App.tsx
   ├─ store/
   │  └─ configStore.ts           # Zustand store: config + mock + undo/redo
   ├─ model/
   │  ├─ types.ts                 # StatuslineConfig, Segment, etc. (§1)
   │  ├─ segments.ts              # SegmentDef registry + evaluate() (shared semantics)
   │  ├─ schema.ts                # Zod schema for validation/re-import
   │  ├─ mock.ts                  # MockData type + builders
   │  ├─ reimport.ts              # extractConfig / embedMarker / migrate
   │  ├─ pets/
   │  │  ├─ registry.ts           # PET_REGISTRY (id → mood→frame[])
   │  │  └─ frames/*.ts           # ASCII art, fixed grid per pet
   │  └─ presets/
   │     ├─ defaultPreset.ts      # mirrors ~/.claude/statusline.sh (§ default)
   │     └─ mockPresets.ts        # typical/fresh/noRateLimits/panic/peak/narrow
   ├─ preview/
   │  ├─ renderToAnsi.ts          # config + mock → string[] (ANSI)
   │  ├─ ansiToHtml.tsx           # ANSI → React spans
   │  ├─ xterm256.ts              # 256-index → hex table
   │  ├─ compose.ts               # pet/row rectangular composition + truncation
   │  └─ width.ts                 # visible-width (strip escapes, count cells)
   ├─ generators/
   │  ├─ index.ts                 # Generator interface + getGenerator(lang)
   │  ├─ assemble.ts              # preamble + helper-union + body assembler
   │  ├─ bash.ts  python.ts  node.ts
   │  ├─ helpers/
   │  │  ├─ bash.ts python.ts node.ts   # HelperId → template per language
   │  └─ segments/
   │     ├─ bash.ts python.ts node.ts   # SegmentType → emit block per language
   ├─ ui/
   │  ├─ ElementLibrary.tsx       # toggle segments on/off
   │  ├─ RowEditor.tsx            # rows + drag-and-drop arrangement
   │  ├─ SegmentInspector.tsx     # per-segment color/variant/label/emoji
   │  ├─ ColorPicker.tsx          # xterm-256 swatches + threshold editor
   │  ├─ PetPanel.tsx             # pet selector + metric binding + position
   │  ├─ GlobalOptionsPanel.tsx   # emoji toggle, padding, default thresholds
   │  ├─ MockControls.tsx         # sliders/scrubbers + preset picker + randomize
   │  ├─ TerminalPreview.tsx      # renders ansiToHtml output
   │  └─ ExportPanel.tsx          # lang tabs, copy, download, settings.json snippet, install steps, import
   └─ __tests__/
      ├─ render.test.ts
      ├─ generators.test.ts
      ├─ parity.test.ts           # spawns bash/python3/node, diffs stdout (§5)
      ├─ pets.test.ts             # fixed-width invariants
      └─ reimport.test.ts
tests/golden/                     # committed .ansi snapshots
```

### Key config bits
- `vite.config.ts`: `base: '/pimp-my-statusline/'` (project pages path). If later moved to a user/org page or custom domain, change to `'/'`.
- `deploy.yml`: jobs `test` (runs Vitest incl. parity) → `build` (`npm run build`) → `deploy` using `actions/upload-pages-artifact` + `actions/deploy-pages`, `permissions: { pages: write, id-token: write }`, trigger on push to `main`.
- State: **Zustand** for `config` + `mock`, with a serialized-snapshot undo/redo stack. Simple, no boilerplate, easy to feed the renderer reactively.

---

## 8. Edge cases (with concrete handling)

- **Absent vs null fields:** generators always emit defensive access — bash `// 0` / `// empty`, python `(data.get('x') or {}).get('y') or default`, node `data.x?.y ?? default`. `evaluate()` in the registry mirrors this so the preview shows the same fallback. Segments whose required source is absent (e.g. `pr` not present, `rate_limits` absent, `session_name` unset) **render to empty and are dropped** from the row join (no dangling separators/joiners). `MockControls` field-presence toggles let users verify both absent and null states.
- **`rate_limits` absent (API users):** session/week segments collapse to nothing rather than showing `0%`; the doc's `// empty` pattern is used in bash. The `noRateLimits` mock preset is the golden fixture for this.
- **Percentage clamping:** all `%` clamped to `[0,100]` before bar math; bar `filled = min(floor(p*w/100), w)`, `empty = w - filled`. `null`/`NaN` → treated as `0` for bar, but the value text shows the fallback only when the source object exists (else dropped). Identical formula in renderer and all three emitters (verified by parity tests).
- **`used_percentage` may be float** (e.g. `23.5`): truncate to int for display (`cut -d. -f1` / `int()` / `Math.floor`), matching the user's current script.
- **COLUMNS truncation:** scripts read `COLUMNS` env (per docs, v2.1.153+). When set and a line's visible width exceeds it, truncate on **visible cells** (escape-sequence-aware) and emit a trailing `\x1b[0m` so color never bleeds. The preview's `width.ts`/`compose.ts` do the same strip-escapes-then-count, so truncated output matches. When `COLUMNS` is unset, no truncation (let the terminal wrap) — and the docs warn long output may wrap awkwardly, surfaced as a UI hint.
- **Separator width strategy:** `width: 'full'` emits a runtime expansion to `COLUMNS` (bash `printf '─%.0s' $(seq 1 "${COLUMNS:-80}")`), `width: N` emits a fixed-N run. Preview clamps the separator to `_columns`. Default preset keeps the user's fixed 74-char dashed rule but offers `'full'` as a one-click upgrade.
- **Multi-line + ANSI caveats (from docs):** docs warn multi-line + escape codes are more glitch-prone. Mitigations baked in: every styled span is explicitly reset with `\x1b[0m` (no relying on implicit reset across lines); each line is a separate `echo -e`/`print` so a glitch can't cascade; OSC 8 links (PR url) wrapped exactly per the doc's `printf '%b'` bash form to survive shells. The export panel shows a "multi-line uses escape codes — if your terminal garbles it, reduce rows" note.
- **Pet width invariant:** enforced at the data layer (every frame line space-padded to the pet's declared `width`) and asserted in `pets.test.ts`; composition pads the shorter column so the grid is always rectangular and the statusline never shifts on mood change (the hard constraint).
- **`echo -e` portability:** generated bash uses `echo -e`; for OSC 8 link segments specifically, switch that line to `printf '%b'` as the docs recommend for reliable escape handling.
- **Effort `xhigh`/`max` & `exceeds_200k_tokens`:** effort rendered verbatim from `effort.level` (dimmed), absent when the model lacks effort. `exceeds_200k_tokens` can optionally tint the context segment (panic preset sets it true).

---

### Critical Files for Implementation
- /home/vito/dev/pimp-my-statusline/src/model/types.ts  (the StatuslineConfig single source of truth)
- /home/vito/dev/pimp-my-statusline/src/model/segments.ts  (shared segment registry + evaluate() consumed by renderer and generators)
- /home/vito/dev/pimp-my-statusline/src/preview/renderToAnsi.ts  (config+mock → ANSI; the parity reference output)
- /home/vito/dev/pimp-my-statusline/src/generators/assemble.ts  (preamble + helper-union + body assembly shared by all three emitters)
- /home/vito/dev/pimp-my-statusline/src/__tests__/parity.test.ts  (executes generated bash/python/node, diffs stdout vs renderer — guarantees preview↔script parity)