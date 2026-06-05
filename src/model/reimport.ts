// Re-import: the config-in-comment round-trip. Every generated script carries,
// on line 2, a single comment of the form
//
//   <prefix> pimp-my-statusline:v1:<base64url(JSON.stringify(config))>
//
// where <prefix> is `#` (bash/python) or `//` (node). embedMarker() produces
// that line; extractConfig() recovers the config from any script text (or any
// blob that merely contains the marker).
//
// Decode order is load-bearing (from the technical review §I): base64url-decode
// → JSON.parse → migrate(raw, version) → parseConfig (zod). The marker is the
// SOURCE OF TRUTH; hand edits to the script body are not round-tripped.
//
// This module is BROWSER-SAFE and NODE-SAFE: it uses TextEncoder/TextDecoder
// plus btoa/atob when present, and falls back to Buffer under Node. No npm deps.

import type { StatuslineConfig } from './types'
import { parseConfig } from './schema'

// ---------------------------------------------------------------------------
// base64url (no `+` `/` `=`), UTF-8 aware
// ---------------------------------------------------------------------------

// btoa/atob operate on "binary strings" (one char per byte). We bridge through
// a Uint8Array so multi-byte UTF-8 (e.g. the █/░ bar glyphs, box-drawing) round
// trips losslessly. Under Node where btoa/atob may be absent we use Buffer.

function bytesToBinaryString(bytes: Uint8Array): string {
  let s = ''
  // Chunk to avoid blowing the call stack on String.fromCharCode(...spread).
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return s
}

function binaryStringToBytes(bin: string): Uint8Array {
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff
  return bytes
}

function base64Encode(bytes: Uint8Array): string {
  const g = globalThis as unknown as {
    btoa?: (s: string) => string
    Buffer?: { from(b: Uint8Array): { toString(enc: string): string } }
  }
  if (typeof g.btoa === 'function') return g.btoa(bytesToBinaryString(bytes))
  if (g.Buffer) return g.Buffer.from(bytes).toString('base64')
  throw new Error('no base64 encoder available')
}

function base64Decode(b64: string): Uint8Array {
  const g = globalThis as unknown as {
    atob?: (s: string) => string
    Buffer?: {
      from(s: string, enc: string): { length: number; [i: number]: number }
    }
  }
  if (typeof g.atob === 'function') return binaryStringToBytes(g.atob(b64))
  if (g.Buffer) {
    const buf = g.Buffer.from(b64, 'base64')
    const out = new Uint8Array(buf.length)
    for (let i = 0; i < buf.length; i++) out[i] = buf[i]
    return out
  }
  throw new Error('no base64 decoder available')
}

/** Encode a UTF-8 string to base64url (no padding). */
export function base64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  return base64Encode(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Decode a base64url string back to UTF-8. */
export function base64urlDecode(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  // Restore padding so atob/Buffer accept it.
  const pad = b64.length % 4
  if (pad === 2) b64 += '=='
  else if (pad === 3) b64 += '='
  else if (pad === 1) throw new Error('invalid base64url length')
  return new TextDecoder().decode(base64Decode(b64))
}

// ---------------------------------------------------------------------------
// Marker
// ---------------------------------------------------------------------------

const MARKER_RE = /pimp-my-statusline:v(\d+):([A-Za-z0-9_-]+)/

function commentPrefix(lang: 'bash' | 'python' | 'node'): string {
  return lang === 'node' ? '//' : '#'
}

/** The single line-2 marker comment for `config` in the given language. */
export function embedMarker(
  config: StatuslineConfig,
  lang: 'bash' | 'python' | 'node',
): string {
  const payload = base64urlEncode(JSON.stringify(config))
  return `${commentPrefix(lang)} pimp-my-statusline:v${config.version}:${payload}`
}

// ---------------------------------------------------------------------------
// Migration chain (v1 = identity; future versions chain here)
// ---------------------------------------------------------------------------

/** Migrate a decoded config object from its stored version up to the current
 *  schema. v1 is the current version, so v1 → v1 is the identity. Unknown /
 *  newer versions pass through untouched (parseConfig is the final gate). */
function migrate(raw: unknown, version: number): unknown {
  // No migrations needed yet; future steps go here, e.g.:
  //   if (version < 2) raw = migrateV1toV2(raw)
  void version
  return raw
}

/** Recover a StatuslineConfig from any text containing the marker.
 *  Returns null on a missing marker or ANY decode/parse/validation failure. */
export function extractConfig(scriptText: string): StatuslineConfig | null {
  const m = scriptText.match(MARKER_RE)
  if (!m) return null
  try {
    const version = Number(m[1])
    const json = base64urlDecode(m[2])
    const raw = JSON.parse(json)
    const migrated = migrate(raw, version)
    return parseConfig(migrated)
  } catch {
    return null
  }
}
