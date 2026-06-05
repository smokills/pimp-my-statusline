import { describe, it, expect } from 'vitest'
import {
  stripAnsi,
  visibleLen,
  normalizeFrame,
  selectMood,
  colorizeRow,
  colorizeFrame,
  compose,
  isAllowedChar,
} from './runtime.ts'
import { DEFAULT_PET_THRESHOLDS } from './types.ts'
import type { Mood, Frame } from './types.ts'

const ALL: Mood[] = ['idle', 'calm', 'wary', 'alarmed', 'panic']
const NO_IDLE: Mood[] = ['calm', 'wary', 'alarmed', 'panic']

// ---------------------------------------------------------------------------
// stripAnsi / visibleLen
// ---------------------------------------------------------------------------

describe('stripAnsi / visibleLen', () => {
  it('strips SGR colour sequences', () => {
    expect(stripAnsi('\x1b[38;5;2mhi\x1b[0m')).toBe('hi')
    expect(visibleLen('\x1b[38;5;2mhi\x1b[0m')).toBe(2)
  })

  it('strips reset and multi-attribute SGR', () => {
    expect(stripAnsi('\x1b[1;31mX\x1b[0m')).toBe('X')
  })

  it('strips OSC 8 hyperlinks terminated by BEL', () => {
    const s = '\x1b]8;;https://example.com\x07link\x1b]8;;\x07'
    expect(stripAnsi(s)).toBe('link')
    expect(visibleLen(s)).toBe(4)
  })

  it('strips OSC 8 hyperlinks terminated by ST (ESC backslash)', () => {
    const s = '\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\'
    expect(stripAnsi(s)).toBe('link')
    expect(visibleLen(s)).toBe(4)
  })

  it('leaves plain text untouched', () => {
    expect(stripAnsi(' (||) ')).toBe(' (||) ')
    expect(visibleLen(' (||) ')).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// normalizeFrame
// ---------------------------------------------------------------------------

describe('normalizeFrame', () => {
  it('right-pads short rows to width', () => {
    expect(normalizeFrame(['ab', 'c', ''], 4, 3)).toEqual(['ab  ', 'c   ', '    '])
  })

  it('leaves exact-width rows untouched', () => {
    expect(normalizeFrame(['abcd'], 4, 1)).toEqual(['abcd'])
  })

  it('throws on wrong height', () => {
    expect(() => normalizeFrame(['a', 'b'], 4, 3)).toThrow(/expected 3 rows, got 2/)
  })

  it('throws on over-width rows (never crops)', () => {
    expect(() => normalizeFrame(['abcde'], 4, 1)).toThrow(/visible width 5 > width 4/)
  })

  it('accounts for ANSI when measuring width', () => {
    expect(normalizeFrame(['\x1b[31mab\x1b[0m'], 4, 1)).toEqual(['\x1b[31mab\x1b[0m  '])
  })
})

// ---------------------------------------------------------------------------
// selectMood (TRUNCATION, not rounding)
// ---------------------------------------------------------------------------

describe('selectMood', () => {
  const t = DEFAULT_PET_THRESHOLDS // idle:10 calm:50 wary:80 alarmed:90

  it('selects idle at low usage when the pet has an idle frame', () => {
    expect(selectMood(0, t, ALL)).toBe('idle')
    expect(selectMood(10, t, ALL)).toBe('idle')
  })

  it('crosses to calm just past the idle threshold', () => {
    expect(selectMood(11, t, ALL)).toBe('calm')
    expect(selectMood(49, t, ALL)).toBe('calm')
  })

  it('truncates rather than rounds (49.9 -> calm, not wary)', () => {
    expect(selectMood(49.9, t, ALL)).toBe('calm')
  })

  it('selects wary in [50,79]', () => {
    expect(selectMood(50, t, ALL)).toBe('wary')
    expect(selectMood(79, t, ALL)).toBe('wary')
    expect(selectMood(79.9, t, ALL)).toBe('wary')
  })

  it('selects alarmed in [80,89]', () => {
    expect(selectMood(80, t, ALL)).toBe('alarmed')
    expect(selectMood(89, t, ALL)).toBe('alarmed')
  })

  it('selects panic at >=90 and clamps high', () => {
    expect(selectMood(90, t, ALL)).toBe('panic')
    expect(selectMood(100, t, ALL)).toBe('panic')
    expect(selectMood(150, t, ALL)).toBe('panic')
  })

  it('clamps negative input', () => {
    expect(selectMood(-5, t, ALL)).toBe('idle')
    expect(selectMood(-5, t, NO_IDLE)).toBe('calm')
  })

  it('falls back to calm in the idle band when the pet lacks an idle frame', () => {
    expect(selectMood(5, t, NO_IDLE)).toBe('calm')
  })

  it('never returns a mood the pet lacks', () => {
    const only: Mood[] = ['calm', 'panic']
    expect(selectMood(0, t, only)).toBe('calm') // idle -> calm
    expect(selectMood(60, t, only)).toBe('calm') // wary -> nearest lower defined = calm
    expect(selectMood(85, t, only)).toBe('calm') // alarmed -> calm
    expect(selectMood(95, t, only)).toBe('panic') // panic defined
  })

  it('accepts a Set as well as an array', () => {
    expect(selectMood(0, t, new Set<Mood>(ALL))).toBe('idle')
    expect(selectMood(95, t, new Set<Mood>(NO_IDLE))).toBe('panic')
  })
})

// ---------------------------------------------------------------------------
// colorizeRow / colorizeFrame
// ---------------------------------------------------------------------------

describe('colorizeRow', () => {
  it('wraps in bodyColor with no spans and preserves visible width', () => {
    const out = colorizeRow('abc', [], 2)
    expect(out).toBe('\x1b[38;5;2mabc\x1b[0m')
    expect(visibleLen(out)).toBe(3)
  })

  it('emits SGR transitions exactly on colour change', () => {
    // row "ab*c": colour the single '*' at col 2 red(9), rest body green(2)
    const out = colorizeRow('ab*c', [{ row: 0, col: 2, len: 1, color: 9 }], 2)
    expect(out).toBe('\x1b[38;5;2mab\x1b[38;5;9m*\x1b[38;5;2mc\x1b[0m')
    expect(visibleLen(out)).toBe(4)
  })

  it('opens with bodyColor then switches when col 0 differs (matches reference algorithm)', () => {
    const out = colorizeRow('XYZ', [{ row: 0, col: 0, len: 3, color: 5 }], 2)
    // The reference algorithm always emits SGR(bodyColor) first, then switches.
    expect(out).toBe('\x1b[38;5;2m\x1b[38;5;5mXYZ\x1b[0m')
    expect(visibleLen(out)).toBe(3)
  })

  it('preserves visible width regardless of spans', () => {
    const out = colorizeRow(' (||) ', [{ row: 0, col: 1, len: 4, color: 9 }], 2)
    expect(visibleLen(out)).toBe(6)
  })
})

describe('colorizeFrame', () => {
  it('applies each row its own spans and preserves widths', () => {
    const frame: Frame = {
      rows: ['ab', 'cd'],
      spans: [
        { row: 0, col: 1, len: 1, color: 9 },
        { row: 1, col: 0, len: 2, color: 6 },
      ],
    }
    const out = colorizeFrame(frame, 2)
    expect(out[0]).toBe('\x1b[38;5;2ma\x1b[38;5;9mb\x1b[0m')
    // Row 1: col 0 is already accent(6), so a redundant leading body SGR appears.
    expect(out[1]).toBe('\x1b[38;5;2m\x1b[38;5;6mcd\x1b[0m')
    expect(visibleLen(out[0])).toBe(2)
    expect(visibleLen(out[1])).toBe(2)
  })

  it('renders the whole frame in bodyColor when spans are absent', () => {
    const frame: Frame = { rows: ['xy'] }
    expect(colorizeFrame(frame, 7)).toEqual(['\x1b[38;5;7mxy\x1b[0m'])
  })
})

// ---------------------------------------------------------------------------
// compose — the pet is ALWAYS the left column; rows follow
// ---------------------------------------------------------------------------

describe('compose', () => {
  it('pet taller than rows: emits pet-only overflow lines with art intact', () => {
    const pet = ['AAA', 'BBB', 'CCC'] // width 3
    const rows = ['row1']
    const out = compose(pet, 3, rows, 1)
    expect(out).toEqual(['AAA row1', 'BBB ', 'CCC '])
  })

  it('pet shorter than rows: blank pet cells keep column alignment', () => {
    const pet = ['AAA'] // width 3
    const rows = ['row1', 'row2', 'row3']
    const out = compose(pet, 3, rows, 1)
    expect(out).toEqual(['AAA row1', '    row2', '    row3'])
  })

  it('honours gap width', () => {
    const out = compose(['PP'], 2, ['r'], 3)
    expect(out).toEqual(['PP   r'])
  })
})

// ---------------------------------------------------------------------------
// isAllowedChar
// ---------------------------------------------------------------------------

describe('isAllowedChar', () => {
  it('accepts printable ASCII', () => {
    for (const ch of [' ', '!', 'A', 'z', '~', '\\', '/', '(', ')']) {
      expect(isAllowedChar(ch)).toBe(true)
    }
  })

  it('accepts box-drawing allowlist', () => {
    for (const ch of [...'─│┌┐└┘├┤┬┴┼╭╮╯╰╱╲']) {
      expect(isAllowedChar(ch)).toBe(true)
    }
  })

  it('rejects control chars, tabs, emoji, double-width and combining marks', () => {
    expect(isAllowedChar('\t')).toBe(false)
    expect(isAllowedChar('\n')).toBe(false)
    expect(isAllowedChar('\x1b')).toBe(false)
    expect(isAllowedChar('あ')).toBe(false) // double-width
    expect(isAllowedChar('字')).toBe(false) // double-width
    expect(isAllowedChar('🙀')).toBe(false) // emoji
    expect(isAllowedChar('́')).toBe(false) // combining acute
    expect(isAllowedChar('•')).toBe(false) // bullet (not in allowlist)
  })
})
