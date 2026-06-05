import { describe, expect, it } from 'vitest'
import { ANSI16_TO_XTERM, XTERM256 } from '../xterm256'

describe('XTERM256 palette', () => {
  it('has exactly 256 entries', () => {
    expect(XTERM256).toHaveLength(256)
  })

  it('every entry is a #rrggbb hex string', () => {
    for (const c of XTERM256) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('system color 3 is olive #808000', () => {
    expect(XTERM256[3]).toBe('#808000')
  })

  it('cube index 46 is #00ff00 (computed standard value)', () => {
    // 46-16=30 → r=0,g=5,b=0 → levels 0,255,0
    expect(XTERM256[46]).toBe('#00ff00')
  })

  it('cube start (16) is black, cube end (231) is white', () => {
    expect(XTERM256[16]).toBe('#000000')
    expect(XTERM256[231]).toBe('#ffffff')
  })

  it('grayscale endpoints', () => {
    expect(XTERM256[232]).toBe('#080808')
    expect(XTERM256[255]).toBe('#eeeeee')
  })
})

describe('ANSI16_TO_XTERM', () => {
  it('maps normal 30-37 → 0-7', () => {
    expect(ANSI16_TO_XTERM[34]).toBe(4)
    expect(ANSI16_TO_XTERM[37]).toBe(7)
  })
  it('maps bright 90-97 → 8-15', () => {
    expect(ANSI16_TO_XTERM[90]).toBe(8)
    expect(ANSI16_TO_XTERM[97]).toBe(15)
  })
})
