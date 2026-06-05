import { describe, expect, it } from 'vitest'
import {
  base64urlDecode,
  base64urlEncode,
  embedMarker,
  extractConfig,
} from '../../model/reimport'
import { defaultConfig } from '../../model/presets/defaultPreset'
import { generate } from '../index'
import { buildMaximalConfig } from './fixtures'
import type { Lang } from '../types'

const LANGS: Lang[] = ['bash', 'python', 'node']

describe('base64url', () => {
  it('round-trips UTF-8 including bar/box glyphs', () => {
    const s = '█░─ ~/dev héllo {"a":1} \\ /'
    expect(base64urlDecode(base64urlEncode(s))).toBe(s)
  })
  it('produces no +/=/ characters', () => {
    const enc = base64urlEncode('?'.repeat(50) + '????>>>')
    expect(enc).not.toMatch(/[+/=]/)
  })
})

describe('embedMarker / extractConfig round-trip', () => {
  for (const lang of LANGS) {
    it(`default config round-trips (${lang})`, () => {
      const cfg = { ...defaultConfig(), language: lang }
      const marker = embedMarker(cfg, lang)
      expect(extractConfig(marker)).toEqual(cfg)
    })
    it(`maximal config round-trips (${lang})`, () => {
      const cfg = { ...buildMaximalConfig(true), language: lang }
      const marker = embedMarker(cfg, lang)
      expect(extractConfig(marker)).toEqual(cfg)
    })
    it(`marker prefix is correct (${lang})`, () => {
      const marker = embedMarker({ ...defaultConfig(), language: lang }, lang)
      expect(marker.startsWith(lang === 'node' ? '// ' : '# ')).toBe(true)
      expect(marker).toMatch(/pimp-my-statusline:v1:[A-Za-z0-9_-]+/)
    })
  }

  it('extracts from a full generated script (line 2)', () => {
    const cfg = defaultConfig()
    for (const lang of LANGS) {
      const script = generate({ ...cfg, language: lang }, lang)
      const extracted = extractConfig(script)
      expect(extracted).toEqual({ ...cfg, language: lang })
    }
  })
})

describe('extractConfig failure modes', () => {
  it('missing marker → null', () => {
    expect(extractConfig('#!/usr/bin/env bash\necho hi\n')).toBeNull()
    expect(extractConfig('')).toBeNull()
  })
  it('corrupted base64 → null', () => {
    expect(extractConfig('# pimp-my-statusline:v1:!!!notbase64!!!')).toBeNull()
  })
  it('valid base64url of non-JSON → null', () => {
    const junk = base64urlEncode('this is not json')
    expect(extractConfig(`# pimp-my-statusline:v1:${junk}`)).toBeNull()
  })
  it('valid JSON that fails schema → null', () => {
    const bad = base64urlEncode(JSON.stringify({ version: 1, language: 'klingon' }))
    expect(extractConfig(`# pimp-my-statusline:v1:${bad}`)).toBeNull()
  })
  it('truncated marker payload → null', () => {
    const cfg = defaultConfig()
    const marker = embedMarker(cfg, 'bash')
    // chop the last 10 payload chars
    const truncated = marker.slice(0, marker.length - 10)
    expect(extractConfig(truncated)).toBeNull()
  })
})
