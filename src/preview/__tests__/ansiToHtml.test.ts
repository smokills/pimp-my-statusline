import { describe, expect, it } from 'vitest'
import { ansiLineToSpans } from '../ansiToHtml'
import { XTERM256 } from '../xterm256'

const ESC = '\x1b'

describe('ansiLineToSpans', () => {
  it('bold + ansi16(34) brightens blue to xterm 12', () => {
    const spans = ansiLineToSpans(`${ESC}[1;34mX${ESC}[0m`)
    expect(spans).toEqual([{ text: 'X', color: XTERM256[12], bold: true }])
  })

  it('bold AFTER the color in the same escape still brightens (34;1)', () => {
    const spans = ansiLineToSpans(`${ESC}[34;1mX${ESC}[0m`)
    expect(spans).toEqual([{ text: 'X', color: XTERM256[12], bold: true }])
  })

  it('non-bold ansi16(34) is plain blue (xterm 4)', () => {
    const spans = ansiLineToSpans(`${ESC}[34mX${ESC}[0m`)
    expect(spans).toEqual([{ text: 'X', color: XTERM256[4] }])
  })

  it('dim ansi16(37): dim flag set, no bold-brighten', () => {
    const spans = ansiLineToSpans(`${ESC}[2;37mY${ESC}[0m`)
    expect(spans).toEqual([{ text: 'Y', color: XTERM256[7], dim: true }])
  })

  it('38;5;196 → bright red #ff0000', () => {
    const spans = ansiLineToSpans(`${ESC}[38;5;196mZ${ESC}[0m`)
    expect(spans).toEqual([{ text: 'Z', color: '#ff0000' }])
  })

  it('38;5;N is NOT affected by bold-brighten', () => {
    const spans = ansiLineToSpans(`${ESC}[1;38;5;196mZ${ESC}[0m`)
    expect(spans).toEqual([{ text: 'Z', color: '#ff0000', bold: true }])
  })

  it('90-97 bright codes map directly to xterm 8-15', () => {
    expect(ansiLineToSpans(`${ESC}[91mR${ESC}[0m`)).toEqual([
      { text: 'R', color: XTERM256[9] },
    ])
  })

  it('reset mid-line splits spans', () => {
    const spans = ansiLineToSpans(`${ESC}[1;34mA${ESC}[0mB`)
    expect(spans).toEqual([
      { text: 'A', color: XTERM256[12], bold: true },
      { text: 'B' },
    ])
  })

  it('plain text with no escapes is a single unstyled span', () => {
    expect(ansiLineToSpans('hello')).toEqual([{ text: 'hello' }])
  })

  it('empty line yields no spans', () => {
    expect(ansiLineToSpans('')).toEqual([])
  })

  it('unknown SGR params are ignored gracefully (e.g. background 44)', () => {
    // 44 is a background color we do not model → ignored; text still emitted.
    const spans = ansiLineToSpans(`${ESC}[44mQ${ESC}[0m`)
    expect(spans).toEqual([{ text: 'Q' }])
  })

  it('truecolor 38;2;r;g;b ignored gracefully (params consumed-less, no crash)', () => {
    const spans = ansiLineToSpans(`${ESC}[38;2;10;20;30mT${ESC}[0m`)
    // We do not handle 38;2; — `38` alone with next param `2` (not `5`) falls
    // through; the run still emits its text.
    expect(spans.map((s) => s.text).join('')).toBe('T')
  })

  it('39 resets to default foreground', () => {
    const spans = ansiLineToSpans(`${ESC}[34mA${ESC}[39mB`)
    expect(spans).toEqual([{ text: 'A', color: XTERM256[4] }, { text: 'B' }])
  })

  it('bare ESC[m is treated as reset', () => {
    const spans = ansiLineToSpans(`${ESC}[34mA${ESC}[mB`)
    expect(spans).toEqual([{ text: 'A', color: XTERM256[4] }, { text: 'B' }])
  })

  it('OSC8 hyperlink sequences are stripped, text preserved', () => {
    const line = `${ESC}]8;;https://example.com${ESC}\\link text${ESC}]8;;${ESC}\\`
    expect(ansiLineToSpans(line)).toEqual([{ text: 'link text' }])
  })

  it('OSC8 with BEL terminator is also stripped', () => {
    const line = `${ESC}]8;;https://x.com\x07click\x1b]8;;\x07`
    expect(ansiLineToSpans(line)).toEqual([{ text: 'click' }])
  })
})
