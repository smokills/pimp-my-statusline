# Pimp My Statusline — Configuratore web per Claude Code statusline

## Contesto

Vito vuole un **configuratore visuale di statusline per Claude Code**, pubblicato su **GitHub Pages** (statico). L'utente compone la statusline scegliendo elementi, righe, colori, varianti e un pet ASCII reattivo; vede una **preview live in stile terminale** e **esporta uno script pronto** per `~/.claude/`.

- Directory progetto: `/home/vito/dev/pimp-my-statusline` (vuota, da inizializzare come repo git)
- Fonte dati: schema JSON stdin della doc ufficiale statusline (model, workspace, cost, context_window, effort, thinking, rate_limits, vim, agent, pr, worktree, session_name, output_style, version, exceeds_200k_tokens)
- Design prodotto da workflow multi-agente (3 designer + 2 reviewer avversariali); output integrali in `~/.claude/projects/-home-vito-dev-pimp-my-statusline/f617809e-f44c-4545-adfd-cad84e6c49f7/subagents/workflows/wf_f681709e-2da/` e copie in `/tmp/claude-1000/wf-design/*.md` (core, uiux, pets, techReview, productReview — da copiare in `docs/` allo step 0)

## Decisioni vincolanti (concordate con l'utente)

1. **Export multi-linguaggio**: Bash (+jq), Python 3 (stdlib), Node.js (stdlib)
2. **Codegen leggibile su misura**: solo il codice degli elementi scelti, commentato, hand-editable. Parità preview↔script via **golden test in CI** (esecuzione reale degli script con JSON mock)
3. **Pet ASCII reattivo** multi-riga affiancato; **vincolo hard: griglia fissa W×H identica per tutti i frame** (mai layout shift)
4. **Colori xterm-256** + threshold mode (verde/giallo/rosso per %); **più supporto ansi16** (`kind:'ansi16'`, codici 30–37/90–97 + bold/dim) necessario per fedeltà al preset default
5. **Stack**: Vite + React + TS; deploy GitHub Pages via Actions
6. **UI inglese**; preset default = statusline attuale di Vito, byte-fedele
7. **Re-import**: marker commento con config serializzata

---

## 1. Architettura core

### Modello (single source of truth)
`StatuslineConfig` (plain data, serializzabile) → consumato da preview renderer E dai 3 generatori.

- `SegmentType`: `directory | gitBranch | model | effort | context | session | week | peak | cost | duration | lines | outputStyle | vimMode | sessionName | agent | pr | thinking | version | worktree | separator | staticText` (NO segmento `repo` per v1 — YAGNI)
- **UN solo segmento per metrica** (context/session/week = `MetricSegment` con `parts: ('bar'|'percent'|'timer')[]` ordinati, `barWidth`, `barChars`); la libreria UI mostra UNA voce per segmento, la scelta gauge/percent/timer sta nell'inspector
- `ColorSpec` = `{kind:'fixed', code:0..255}` | `{kind:'ansi16', code:30..37|90..97}` | `{kind:'threshold', stops:[{at,code}]}` (primo match `pct >= at` dall'alto; default `[{90,rosso},{70,giallo},{0,verde}]`)
- `TextStyle` = `{color?, bold?, dim?}`; `SegmentBase` = `{id, type, enabled, label?, emoji?{glyph,show}, prefix?, suffix?}`
- `Row` = `{id, segments[], joiner}` (default joiner `"  "`); rows riordinabili
- `PetConfig` = `{enabled, petId, metric: 'context'|'session_5h'|'week_7d', position:'left'|'right' (default left), gap:0..3 (default 1), thresholds:{idle:10,calm:50,wary:80,alarmed:90}}` — vocabolario mood canonico: `idle|calm|wary|alarmed|panic` (da `src/pets/types.ts`, unico punto di definizione)
- `GlobalOptions` = `{emoji:boolean (default false), defaultThresholds}`
- Registry `SEGMENTS: Record<SegmentType, SegmentDef>` con `sources` (path JSON), `evaluate()` (semantica condivisa), `helpers: HelperId[]` (per emettere solo gli helper usati)

### Preview renderer (chiave della parità)
Pipeline: `config + mock → renderToAnsi(): string[] → ansiToHtml() → <pre> spans`.
La preview è generata da una **stringa ANSI** identica a ciò che emettono gli script → golden test = confronto di stringhe puro. Il parser ANSI→HTML conosce solo SGR (`38;5;N`, ansi16, `1`, `2`, `0`) e OSC 8, zero conoscenza dei segmenti.
- **`XTERM256` table = valori hex xterm standard** (color 3 = `#808000`, ecc.) — MAI i colori "estetici" del chrome UI. Palette chrome ≠ palette terminale.
- Mock data `MockData` rispecchia lo schema stdin + campi sim (`_gitBranch`, `_now`, `_columns`); distinzione **absent vs null** con checkbox di presenza per campo. Preset mock: `typical` (default), `fresh` (null/assenti), `noRateLimits`, `panic` (96%+), `peakNow`/`offPeak` (orari pinnati), `narrow` (COLUMNS 40).

### Generatori (bash/python/node)
3 layer assemblati: preamble (stdin+parse) → helper block (**solo gli helper usati**, dedupe, ordine di dipendenza) → body (un blocco commentato per segmento `# --- Session (5h) ---`, variabile per segmento, emissione riga per riga). Helper con nomi identici nei 3 linguaggi (`color`, `bar`, `time_until`, `peak_state`, `pet_frame`, `compose`).

**Regole di portabilità bash (vincolanti, dalla review tecnica):**
- Shebang `#!/usr/bin/env bash`; MAI `echo -e` → sempre `printf '%b\n'`; stringhe con ESC in `$'...'`
- Guard preflight: `command -v jq >/dev/null 2>&1 || { echo "statusline: jq not found (brew/apt install jq)"; exit 0; }` (exit 0, non 1)
- **MAI `date -d`** (GNU-only, rompe macOS; il dev box usa uutils che lo maschera — non fidarsi dei test locali). Peak portabile: da `TZ=America/Los_Angeles date +%u/%H/%M/%S` sull'ORA CORRENTE deriva `pt_midnight = now − (H*3600+M*60+S)`; bounds = `pt_midnight + 5h/11h`; prossimo giorno feriale = scan `pt_midnight + k*86400` con `dow_k = (dow_oggi + k − 1) % 7 + 1` (aritmetica sul dow noto, zero `date -d`). Seam DST ±1h accettato e documentato in commento.
- Python peak: `zoneinfo` (richiede ≥3.9; commento con hint `pip install tzdata` se `ZoneInfoNotFoundError`). Node: `Intl.DateTimeFormat` con `timeZone`.
- **Clock iniettabile universale**: ogni lettura del tempo (timer, peak, countdown) passa da `NOW="${PMSL_NOW:-$(date +%s)}"` (e equivalenti py/node) — anche la decomposizione wall-clock PT deriva da `NOW`. Senza questo i golden test non possono congelare il tempo.
- **Arrotondamento unico: troncamento (floor)** ovunque — display % E mood del pet. In bash: `jq -r '... // 0 | floor'` (MAI `cut -d. -f1`: esplode con notazione scientifica tipo `1e-06`). Py: `int(float(x))`, Node: `Math.trunc(Number(x))`.
- **Bug `printf '█%.0s'` con 0 argomenti stampa 1 blocco** (presente anche nello script attuale di Vito!): guard `[ "$f" -gt 0 ] && printf ...`. Bar formula unica: `filled = floor(p*w/100)` (≡ `pct/20` a w=5, quindi preset fedele).
- `LC_NUMERIC=C` per ogni `printf '%f'` (costo USD) in bash.
- `COLUMNS` può non essere esportata → fallback `${COLUMNS:-80}` documentato; separatore `width:'full'` usa il fallback.

### Re-import + persistenza
- Marker UNICO (riga 2 dello script): `<prefix> pimp-my-statusline:v1:<base64url(JSON config)>` (`#` bash/py, `//` node). Flusso import: decode → `migrate()` → **poi** validazione Zod. All'import, rigenerare lo script dalla config e diffarlo col testo incollato → se differiscono, warning "hand edits will be lost".
- **localStorage**: Zustand `persist` middleware, chiave `pms:config:v1`, SOLO la config (non il mock), debounce 250ms; al load passa da migrate+Zod, su failure fallback al preset default + toast.

### Golden / parity test
- Vitest unit (helpers, renderToAnsi, invarianti pet, round-trip re-import)
- **Parity**: matrice `(configPreset × mockPreset × linguaggio)` → scrive script+mock in tmp, esegue `bash/python3/node script < mock.json` con `PMSL_NOW`, `TZ`, `PMSL_GIT_BRANCH`, `COLUMNS`, `LANG=C.UTF-8` pinnati → `stdout === renderToAnsi(...).join('\n')+'\n'` byte-per-byte
- Matrice include: **0% e 100% esatti**, **.5** (49.5/48.5), **near-zero** (`1e-06`), confine DST, peak/off-peak, `noRateLimits`, `fresh`. Golden file `.ansi` committati con `.gitattributes` + `.editorconfig` che preservano trailing whitespace in `tests/golden/**`
- CI ubuntu-latest: node/python3/bash/jq preinstallati (guard `jq --version` + fallback apt). Nota in CI: mai validare la portabilità di `date` sul box locale.

---

## 2. Sistema pet

- **Griglia canonica: H=3 righe, W per-pet (6ch per tutti i pet shipped)**, frame paddati a spazi; charset: ASCII stampabile + allowlist box-drawing (NO emoji, NO double-width, NO combining)
- **6 pet**: cactus, cat, dog (required v1) + owl, robot, fish (stretch, stessa infrastruttura). Mood: `idle(≤10) calm(<50) wary(<80) alarmed(<90) panic(≥90)`; `idle` opzionale con fallback a `calm`. Art di partenza nei design doc (da rifinire rispettando il validator)
- **Color spans per-frame** (`{row,col,len,color}` + `bodyColor` fallback): ANSI è zero-width → invariante di larghezza intatto. `colorizeRow` cammina le colonne aprendo/chiudendo SGR
- **Composizione**: `Lout = max(Hp, Nr)`; pet cell = frame row o `blank` (spazi W); `valign` hardcoded `top` (no opzione UI v1). Lato `left` default (niente width math runtime); **lato `right` marcato "experimental"** in UI (i terminali possono strippare trailing space). Composer bash generale (Lout variabile) specificato, non solo happy-path 3 righe
- **Mood selection**: `p = clamp(trunc(pct), 0, 100)` (TRUNC, non round — coerente col display) → confini `<` (50→wary, 90→panic), `idle` con `<=`
- **Invariant test (build-gate)**: per ogni pet/mood: H esatta, `visibleLen(row) == W` sia sull'art RAW sia sulla **riga COLORIZZATA** (ANSI-strip), charset allowlist, spans in bounds, dimensioni identiche tra frame
- Embedding negli script: righe pre-colorizzate a generate-time (riusa `colorizeRow` della preview → parità by construction). Bash: variabili `$'...'` con `\\` per backslash letterali; py: dict di stringhe; node: oggetto con double-quoted strings (NO template literal — backtick nell'art)
- Pet emette UNA estrazione metrica (es. `jq '.context_window.used_percentage // 0 | floor'`); metrica assente → mood più basso (graceful)

## 3. UI/UX — concept "PHOSPHOR / The Statusline Workbench"

Terminale CRT fosforo-verde reinventato come strumento di precisione (NO cliché neon-purple hacker). Da implementare invocando la skill **frontend-design** + database **ui-ux-pro-max** (`/home/vito/.claude/plugins/marketplaces/ui-ux-pro-max-skill/`, entries citate nel design doc: styles #80 Cyberpunk HUD, #73 Terminal CLI; colors #87; typography #56/#61).

- **Palette chrome**: bg `#0D1117`, surface `#161B22`/`#182424`, border `#30363D`, phosphor `#00FF41`/dim `#008F11`, fg `#E6EDF3`, threshold ok/warn/crit `#00FF41`/`#FFB000`/`#FF3333` (SOLO chrome — la preview usa la tabella xterm standard)
- **Font**: Syncopate (wordmark/header), JetBrains Mono (UI workhorse, **self-hosted woff2 in `public/`, `font-display:block`, path via `import.meta.env.BASE_URL`**), IBM Plex Sans (prose istruzioni)
- **Effetti**: pannelli chamfered (clip-path 45°, border-radius 0), corner bracket HUD, bezel CRT con LED per la preview, glow phosphor solo su elementi attivi. **Scanline statica default OFF**; cursore lampeggiante solo nel wordmark. **TAGLIATI (YAGNI, da review)**: boot sequence, CRT flicker, typewriter reveal — la preview deve essere istantanea
- **Layout desktop** (≥1100px): rail sinistra = libreria elementi (categorie + search); centro = canvas righe (dnd-kit, drag tra righe, righe riordinabili, `[+ ADD ROW]`); colonna destra **sticky** = preview CRT + scrubber mock (slider ctx/5h/7d/clock, dropdown model/effort/vim/pr, checkbox presenza campi, randomize/reset, slider width). Inspector = **bottom drawer** (tab `ELEMENT · PET · DISPLAY`) che non copre mai la preview
- **Color picker 256**: griglia 16×16 a bande (STANDARD 0–15 / CUBE 16–231 / GRAYSCALE 232–255), hover preview live, recents (localStorage), suggested (i default della statusline di Vito), input indice 0–255 (NO hex/CIEDE2000 — tagliato), threshold mode con 3 swatch + breakpoint editabili (70/90)
- **Pet tab**: lista pet con bio one-liner, "mood theater" con outline della griglia fissa che dimostra visivamente il no-shift, scrubber mood 0–100, radio metrica
- **Export modal**: tab `BASH (+jq) · PYTHON 3 · NODE.JS`, codice syntax-highlighted (Shiki tema phosphor), `[COPY]`/`[DOWNLOAD]`, snippet settings.json **con path/comando giusto per linguaggio** (`~/.claude/statusline.sh` chmod+x; `python3 ~/.claude/statusline.py`; `node ~/.claude/statusline.js`), **`refreshInterval` incluso SOLO se ci sono segmenti time-based** (timer/peak), **jq install hint prominente sul tab bash** + nudge "Python/Node = zero dipendenze", marker re-import spiegato
- **Import modal**: textarea/file-drop → parse marker → migrate → Zod → hydrate; warning hand-edits
- **A11y**: keyboard DnD completo (dnd-kit KeyboardSensor + aria-live), focus ring 2px phosphor, contrasti ≥4.5:1, reduced-motion disattiva tutto il motion, touch target ≥44px, mirror aria-live testuale della preview
- **Mobile** (<760px): mini-preview sticky top + tab `BUILD · STYLE · PET · EXPORT`, FX off
- Microcopy terminale: bottoni bracketed `[ EXPORT ]`, empty state `// drop an element here`, toast `copied → clipboard`
- Component inventory completo nel design doc uiux.md (≈45 componenti, riusare come checklist)

## 4. Preset default (fedeltà byte-per-byte a `~/.claude/statusline.sh`)

- Row 1: directory (`tildeHome`, **ansi16 bold blu 34**) + gitBranch (**ansi16 bold verde 32**, joiner 2 spazi)
- Row 2: separator **74×`─`** (contare gli char esatti dalla riga 129 dello script!), dim white `2;37`
- Row 3 (joiner 2 spazi): model (bold white `1;37`) + effort (dim `2;37`, assente se mancante) + context **`['percent']` SENZA bar** (threshold ansi16 32/33/31) + Session (label cyan `36`) `['bar','percent','timer']` bar 5ch + Week (label magenta `35`) `['bar','percent']` **senza timer** + Peak (`1;31`/`1;32` + countdown dim)
- `time_until` formato esatto: `${h}h${m}m` o `${m}m`, vuoto se ≤0; roll-forward al prossimo feriale 05:00 LA
- **Pet disabilitato di default**; emoji global OFF
- `gitBranch` = subprocess git nei 3 linguaggi (`git -C dir branch --show-current`, stdlib subprocess/child_process); in test override `PMSL_GIT_BRANCH`; nota UI "requires git, empty outside a repo"
- Golden test dedicato: preset default × mock typical ≡ output atteso derivato dallo script attuale (al netto del fix del bug 0%-bar)

## 5. Struttura progetto

```
pimp-my-statusline/
├─ index.html · package.json · tsconfig.json · vite.config.ts (base:'/pimp-my-statusline/')
├─ vitest.config.ts · eslint.config.js · .editorconfig · .gitattributes
├─ .github/workflows/deploy.yml   # test → build → deploy-pages, concurrency group
├─ public/                        # .nojekyll, fonts/ (JetBrains Mono woff2), favicon
├─ docs/superpowers/specs/        # spec + design doc del workflow (copiati allo step 0)
├─ src/
│  ├─ model/      types.ts · segments.ts (registry) · schema.ts (zod) · mock.ts ·
│  │              reimport.ts · presets/{defaultPreset,mockPresets}.ts
│  ├─ pets/       types.ts · pets.ts (roster) · runtime.ts (normalizeFrame, selectMood,
│  │              colorizeRow, visibleLen, compose, topPad, padTo)
│  ├─ preview/    renderToAnsi.ts · ansiToHtml.tsx · xterm256.ts · compose.ts · width.ts
│  ├─ generators/ index.ts · assemble.ts · {bash,python,node}.ts ·
│  │              helpers/{bash,python,node}.ts · segments/{bash,python,node}.ts
│  ├─ store/      configStore.ts (zustand + persist) · mockStore.ts
│  ├─ theme/      phosphor.css
│  ├─ ui/         (component inventory dal design uiux)
│  └─ __tests__/  render · generators · parity · pets.invariants · reimport
└─ tests/golden/  *.ansi (trailing-whitespace preservato)
```

Niente client-side routing (solo modali) → niente hack 404. Asset sempre via `BASE_URL`.

## 6. Fasi di implementazione

0. **Bootstrap**: `git init`, scaffold Vite React TS + vitest + zustand + dnd-kit + zod + shiki, `.nojekyll`, font self-hosted, deploy.yml, copia design doc in `docs/superpowers/specs/`, primo commit
1. **Model**: types, registry SEGMENTS (21 tipi), schema zod, mock + 7 preset, defaultPreset fedele, xterm256 standard
2. **Pets**: types, runtime helpers puri, cactus/cat/dog (+owl/robot/fish se fluidi), invariant test (gate)
3. **Preview**: renderToAnsi, compose, width (ANSI-strip), ansiToHtml, TerminalPreview component
4. **Generators**: helper templates ×3 lingue (con tutte le regole di portabilità §1), segment templates ×3, assemble, marker; smoke test manuale `echo mock | bash out.sh`
5. **Parity/golden**: runner spawn, matrice fixture completa (0/100/.5/1e-06/DST/peak/noRateLimits/fresh), golden committati — **gate: tutta la matrice verde nei 3 linguaggi**
6. **UI**: invocare skill frontend-design + leggere db ui-ux-pro-max; theme phosphor, store+persist, libreria, canvas dnd (con keyboard), inspector drawer, color picker, pet tab, mock scrubber, export/import modali, a11y, mobile
7. **Deploy**: `gh repo create` (pubblico), push, abilitare Pages (workflow), verificare URL live, README con screenshot
8. **Verifica finale** (sotto)

## 7. Verifica end-to-end

1. `npm test` — unit + invarianti pet + **parity matrix completa** (3 linguaggi × preset × mock) verde
2. `npm run build && npm run preview` — app servita con base path corretto, font caricati, niente 404 asset
3. Test reale: esportare il preset default in bash → `echo '<mock typical>' | bash statusline.sh` sul box locale → output identico alla preview (confronto visivo + diff con golden)
4. Esportare anche py/node e ripetere; verificare guard jq (con PATH senza jq → exit 0 silenzioso)
5. Re-import round-trip: export → import → config identica (deep-equal); hand-edit → warning mostrato
6. Pet: scrubber 5→95% → frame cambiano, larghezza colonne INVARIATA (test visivo + invariant test)
7. localStorage: configurare, F5, config preservata
8. Deploy live: aprire l'URL GitHub Pages, smoke test completo, test mobile via devtools
9. Installazione reale opzionale: Vito monta lo script generato nella sua `~/.claude/settings.json` e verifica nella sessione Claude Code

## Fuori scope v1 (deferiti consapevolmente)

Boot sequence/flicker/typewriter · CIEDE2000 hex snapping · contrast badge live · varianti pet 1/2 righe · `accentByMood` · segmento `repo` owner/name · valign middle · client-side routing · OSC 8 link PR di default con pet attivo (off) · multi-config salvate con nome
