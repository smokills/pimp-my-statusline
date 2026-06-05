# Pimp My Statusline

**A visual workbench for the bottom line of your terminal.**

Build your [Claude Code statusline](https://code.claude.com/docs/en/statusline) by dragging elements around, picking colors from the xterm-256 palette, adopting a reactive ASCII pet — and export a clean, readable script you can install in seconds and keep hacking by hand.

![Pimp My Statusline — the product landing](docs/screenshot.png)

## Features

- **Live terminal preview** — wrapped in a macOS / Windows / Linux window chrome, the preview renders your statusline exactly as your terminal will, fed by a scrubbable mock session (drag the context % slider, watch everything react)
- **Element library** — directory, git branch, model, effort, context window, 5h/7d rate limits with gauge bars + reset countdowns, cost, duration, lines ±, vim mode, PR info, and more
- **Multi-row layout** — arrange elements across any number of rows with drag & drop (keyboard accessible)
- **Per-element styling** — fixed xterm-256 colors, basic ANSI-16 colors, or threshold mode (green → yellow → red as a percentage climbs, with editable breakpoints)
- **Display variants** — gauge bar, percentage, and countdown timer per metric, with configurable bar width and glyphs
- **Reactive ASCII pets** — a cactus, cat, dog, owl, robot or fish flanks your statusline and changes mood with your context usage (or rate limits). Every frame occupies an identical fixed grid, so your statusline **never shifts** when the pet panics
- **Three export targets** — Bash (+jq), Python 3 (stdlib only), Node.js (stdlib only). Scripts are tailored (only the code your elements need), commented, and pleasant to edit by hand
- **Re-import** — every exported script embeds your config in a comment marker; paste it back to resume editing
- **Your work survives refresh** — the config persists in localStorage

## Parity, guaranteed

The preview is not an approximation. The same declarative config drives both the in-browser renderer and the three code generators, and CI executes every generated script (bash, python3, node) against mock session JSON with a frozen clock, asserting the output is **byte-identical** to the preview — across a matrix of configs, edge percentages (0%, 100%, ties, `1e-06`), and pet moods.

## Install an exported script

1. Open the **EXPORT** modal, pick your language, **COPY** or **DOWNLOAD**
2. Save it as `~/.claude/statusline.sh` (or `.py` / `.js`)
3. Bash only: `chmod +x ~/.claude/statusline.sh` and make sure `jq` is installed (`brew install jq` / `apt install jq`). Python/Node exports have zero dependencies
4. Add the snippet from the export panel to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 0
  }
}
```

The export panel adds `"refreshInterval": 10` automatically when your statusline shows time-based data (reset countdowns).

## Development

```bash
npm install
npm run dev        # workbench at http://localhost:5173/pimp-my-statusline/
npm test           # unit + pet invariants + full execution-parity matrix
npm run build      # production build (deployed to GitHub Pages by CI)
```

Requires `bash`, `python3`, `node` and `jq` on PATH for the parity tests.

### How it's put together

```
src/model/       StatuslineConfig — the single source of truth, segment
                 registry with shared evaluate() semantics, zod schema,
                 mock-session presets, re-import marker
src/pets/        pet roster + pure runtime (mood selection, colorize,
                 compose) with build-gate grid invariants
src/preview/     config + mock → ANSI string → HTML; the canonical bytes
src/generators/  config → readable bash / python / node scripts that
                 reproduce the preview byte-for-byte
src/ui/          the landing page + builder workbench (React + zustand + dnd-kit)
tests/golden/    committed .ansi snapshots (trailing whitespace matters!)
```
