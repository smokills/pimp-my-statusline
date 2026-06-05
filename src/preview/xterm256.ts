// XTERM256 — the STANDARD xterm 256-colour palette, index → '#rrggbb'.
// This is the TERMINAL palette (what a real terminal renders for `38;5;N`),
// NOT the UI chrome palette. The preview must use these exact values so it
// matches what the generated scripts produce in a real terminal.
//
// Layout:
//   0-15    system colours (16 standard xterm values, hardcoded)
//   16-231  6×6×6 colour cube, channel levels [0,95,135,175,215,255]
//   232-255 grayscale ramp, level = 8 + 10*k
//
// Verified: index 3 === '#808000', index 46 === '#00ff00', index 232 ===
// '#080808', index 255 === '#eeeeee'.

// The standard 16 system colours (xterm defaults).
const SYSTEM_16: string[] = [
  '#000000', // 0  black
  '#800000', // 1  red
  '#008000', // 2  green
  '#808000', // 3  yellow (olive)
  '#000080', // 4  blue
  '#800080', // 5  magenta
  '#008080', // 6  cyan
  '#c0c0c0', // 7  white (light gray)
  '#808080', // 8  bright black (gray)
  '#ff0000', // 9  bright red
  '#00ff00', // 10 bright green
  '#ffff00', // 11 bright yellow
  '#0000ff', // 12 bright blue
  '#ff00ff', // 13 bright magenta
  '#00ffff', // 14 bright cyan
  '#ffffff', // 15 bright white
]

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const

function hex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function buildPalette(): string[] {
  const palette: string[] = [...SYSTEM_16]

  // 16-231: 6×6×6 cube.
  for (let i = 0; i < 216; i++) {
    const r = Math.floor(i / 36) % 6
    const g = Math.floor(i / 6) % 6
    const b = i % 6
    palette.push(hex(CUBE_LEVELS[r], CUBE_LEVELS[g], CUBE_LEVELS[b]))
  }

  // 232-255: grayscale ramp.
  for (let k = 0; k < 24; k++) {
    const v = 8 + 10 * k
    palette.push(hex(v, v, v))
  }

  return palette
}

export const XTERM256: string[] = buildPalette()

/** Maps an ANSI-16 SGR foreground code to its xterm-256 palette index.
 *  30-37 → 0-7 (normal), 90-97 → 8-15 (bright). */
export const ANSI16_TO_XTERM: Record<number, number> = {
  30: 0,
  31: 1,
  32: 2,
  33: 3,
  34: 4,
  35: 5,
  36: 6,
  37: 7,
  90: 8,
  91: 9,
  92: 10,
  93: 11,
  94: 12,
  95: 13,
  96: 14,
  97: 15,
}
