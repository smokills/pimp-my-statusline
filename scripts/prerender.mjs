// Prerender the landing route into dist/index.html.
//
// GitHub Pages can't SSR, but the landing is identical for every visitor, so we
// render it ONCE at build time: serve dist/ locally under the production base
// path, load the page in headless Chrome, and overwrite dist/index.html with
// the serialized DOM. Crawlers, social scrapers and AI fetchers (none of which
// execute JS) get the full markup; in a real browser the module script still
// loads and React mounts over the static content as usual.
//
// Wired as `postbuild`, so a plain `npm run build` produces the prerendered
// HTML both locally and in CI (ubuntu runners ship google-chrome).

import { createServer } from 'node:http'
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

const DIST = fileURLToPath(new URL('../dist', import.meta.url))
const BASE = '/'
const PORT = 4179

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
}

// Minimal static server for dist/ mounted at the production base path, so the
// built absolute asset URLs (/assets/…) resolve as deployed.
const server = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0]
  if (!path.startsWith(BASE)) {
    res.writeHead(404)
    res.end()
    return
  }
  const rel = path.slice(BASE.length) || 'index.html'
  const file = normalize(join(DIST, rel))
  if (!file.startsWith(DIST + sep) || !existsSync(file)) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

function findChrome() {
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' })
      return bin
    } catch {
      /* try the next one */
    }
  }
  throw new Error('prerender: no Chrome/Chromium binary found on PATH')
}

try {
  const chrome = findChrome()
  // --virtual-time-budget fast-forwards timers so the page settles instantly;
  // --no-sandbox + --disable-dev-shm-usage keep CI runners happy. Chrome MUST
  // be spawned async: a sync call would block the event loop, and the static
  // server above could never answer Chrome's requests (deadlock).
  const { stdout: html } = await execFileAsync(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--virtual-time-budget=10000',
      '--dump-dom',
      `http://127.0.0.1:${PORT}${BASE}`,
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60_000 },
  )

  // Never deploy a silently-blank prerender: the landing copy and the module
  // script (which boots the real app) must both be in the output. Checks use
  // stable classNames (not CTA copy, which changes) to avoid false failures.
  if (!html.includes('hero-sub') || !html.includes('hero-ctas')) {
    throw new Error('prerender: landing content missing from the dumped DOM')
  }
  if (!html.includes(`${BASE}assets/`)) {
    throw new Error('prerender: bundle script tag missing from the dumped DOM')
  }

  // --dump-dom serializes documentElement.outerHTML without the doctype; put it
  // back or the page renders in quirks mode.
  const out = html.trimStart().startsWith('<!') ? html : '<!doctype html>\n' + html
  writeFileSync(join(DIST, 'index.html'), out)
  console.log(`prerender: dist/index.html written (${out.length} bytes, via ${chrome})`)
} finally {
  server.close()
}
