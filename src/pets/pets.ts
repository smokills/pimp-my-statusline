// The pet roster. Each pet is a fixed 6x3 character grid whose every mood frame
// has identical dimensions, so the statusline never shifts when the mood
// changes. Art is authored as plain ASCII (a couple use only ASCII); colour is
// applied separately via per-frame spans, and ANSI is zero-width so it never
// affects the grid. Frames are pushed through normalizeFrame at module load so
// stored rows are guaranteed padded to exactly `width`.
//
// Authoring discipline: count VISIBLE characters per row to exactly 6. In a TS
// string literal '\\' is ONE visible backslash.

import type { Pet, Frame, Span } from './types.ts'
import { normalizeFrame } from './runtime.ts'

const WIDTH = 6
const HEIGHT = 3 as const

/** Build a normalized frame, asserting the 6x3 grid at module-load time. */
function frame(rows: string[], spans?: Span[]): Frame {
  return { rows: normalizeFrame(rows, WIDTH, HEIGHT), spans }
}

// ---------------------------------------------------------------------------
// cactus — chills at low usage, flails and sweats near the rate limit.
// body green (2); the arms/flower accent shifts 2 -> 3 -> 208 -> 9 with stress.
// ---------------------------------------------------------------------------
const cactus: Pet = {
  id: 'cactus',
  label: 'Cactus',
  bio: '// chills at low usage. flails and sweats near the rate limit.',
  width: WIDTH,
  height: HEIGHT,
  bodyColor: 2,
  asciiOnly: true,
  frames: {
    // arms tucked, dozing
    idle: frame(['  ,,  ', ' (||) ', '  ||  '], [{ row: 0, col: 2, len: 2, color: 2 }]),
    // arms relaxed
    calm: frame([' ,  , ', ' (||) ', '  ||  '], [
      { row: 0, col: 1, len: 1, color: 2 },
      { row: 0, col: 4, len: 1, color: 2 },
    ]),
    // arms lift, flower yellows
    wary: frame([' \\  / ', ' (||) ', '  ||  '], [
      { row: 0, col: 1, len: 1, color: 3 },
      { row: 0, col: 4, len: 1, color: 3 },
    ]),
    // arms flail orange
    alarmed: frame([' \\||/ ', ' (||) ', '  ||  '], [{ row: 0, col: 1, len: 4, color: 208 }]),
    // pot strains (!), base splays, all alarm-red
    panic: frame([' \\||/ ', '(!||!)', ' /||\\ '], [
      { row: 0, col: 1, len: 4, color: 9 },
      { row: 1, col: 0, len: 2, color: 9 },
      { row: 1, col: 4, len: 2, color: 9 },
    ]),
  },
}

// ---------------------------------------------------------------------------
// cat — naps when idle, fur stands on end at the limit.
// body warm sand (223); eyes cyan 6 -> 6 -> 3 -> 208 -> 9.
// ---------------------------------------------------------------------------
const cat: Pet = {
  id: 'cat',
  label: 'Cat',
  bio: '// naps when idle. fur stands on end at the limit.',
  width: WIDTH,
  height: HEIGHT,
  bodyColor: 223,
  asciiOnly: true,
  frames: {
    // eyes shut, dozing
    idle: frame(['/\\_/\\ ', ' -.- )', ' ("") '], []),
    // round calm eyes (cyan)
    calm: frame(['/\\_/\\ ', ' o.o )', ' ("") '], [
      { row: 1, col: 1, len: 1, color: 6 },
      { row: 1, col: 3, len: 1, color: 6 },
    ]),
    // eyes widen (yellow)
    wary: frame(['/\\_/\\ ', ' O.O )', ' ("") '], [
      { row: 1, col: 1, len: 1, color: 3 },
      { row: 1, col: 3, len: 1, color: 3 },
    ]),
    // ear flattens, dizzy eyes (orange)
    alarmed: frame(['=/\\_/\\', ' @.@ )', ' ("") '], [
      { row: 1, col: 1, len: 1, color: 208 },
      { row: 1, col: 3, len: 1, color: 208 },
    ]),
    // fur on end, X eyes (red)
    panic: frame(['/\\=/\\=', ' XoX )', '((")")'], [
      { row: 1, col: 1, len: 1, color: 9 },
      { row: 1, col: 3, len: 1, color: 9 },
    ]),
  },
}

// ---------------------------------------------------------------------------
// dog — happy and panting until the limit looms, then yelps.
// body tan (180); eyes/mouth cyan 6 -> 6 -> 3 -> 208 -> 9; calm tongue red 9.
// ---------------------------------------------------------------------------
const dog: Pet = {
  id: 'dog',
  label: 'Dog',
  bio: '// happy and panting until the limit looms, then yelps.',
  width: WIDTH,
  height: HEIGHT,
  bodyColor: 180,
  asciiOnly: true,
  frames: {
    // sleeping
    idle: frame([' /^ ^\\', ' (-.-)', '  u-u '], []),
    // bright eyes, red tongue
    calm: frame([' /^ ^\\', ' (o.o)', '  u-u '], [
      { row: 1, col: 2, len: 1, color: 6 },
      { row: 1, col: 4, len: 1, color: 6 },
      { row: 2, col: 2, len: 3, color: 9 },
    ]),
    // confused (yellow)
    wary: frame([' /^ ^\\', ' (o.o)', '  ?-? '], [
      { row: 1, col: 2, len: 1, color: 3 },
      { row: 1, col: 4, len: 1, color: 3 },
    ]),
    // strained (orange)
    alarmed: frame([' /^ ^\\', ' (>.<)', '  !-! '], [
      { row: 1, col: 2, len: 1, color: 208 },
      { row: 1, col: 4, len: 1, color: 208 },
      { row: 2, col: 2, len: 3, color: 208 },
    ]),
    // ears fly up, X eyes, yelping (red)
    panic: frame(['\\/^ ^\\', ' (X.X)', ' !!!! '], [
      { row: 1, col: 2, len: 1, color: 9 },
      { row: 1, col: 4, len: 1, color: 9 },
      { row: 2, col: 1, len: 4, color: 9 },
    ]),
  },
}

// ---------------------------------------------------------------------------
// owl — watches your context with wide, knowing eyes.
// body brown (137); eyes amber 214 -> 214 -> 3 -> 208 -> 9.
// ---------------------------------------------------------------------------
const owl: Pet = {
  id: 'owl',
  label: 'Owl',
  bio: '// watches your context with wide, knowing eyes.',
  width: WIDTH,
  height: HEIGHT,
  bodyColor: 137,
  asciiOnly: true,
  frames: {
    // eyes shut
    idle: frame([' ,_,  ', '(-.-) ', ' ^^^^ '], []),
    // amber eyes
    calm: frame([' ,_,  ', '(o.o) ', ' ^^^^ '], [
      { row: 1, col: 1, len: 1, color: 214 },
      { row: 1, col: 3, len: 1, color: 214 },
    ]),
    // eyes wide (yellow)
    wary: frame([' ,_,  ', '(O.O) ', ' ^^^^ '], [
      { row: 1, col: 1, len: 1, color: 3 },
      { row: 1, col: 3, len: 1, color: 3 },
    ]),
    // beak flares, alarm (orange)
    alarmed: frame([' ,_,  ', '(@v@) ', ' ^^^^ '], [
      { row: 1, col: 1, len: 1, color: 208 },
      { row: 1, col: 3, len: 1, color: 208 },
    ]),
    // tufts up, X eyes (red)
    panic: frame(['!,_,! ', '(XvX) ', ' ^^^^ '], [
      { row: 0, col: 0, len: 1, color: 9 },
      { row: 0, col: 4, len: 1, color: 9 },
      { row: 1, col: 1, len: 1, color: 9 },
      { row: 1, col: 3, len: 1, color: 9 },
    ]),
  },
}

// ---------------------------------------------------------------------------
// robot — neutral chassis, a loud status light that screams near the limit.
// chassis grey (250); eyes/mouth accent 46 -> 46 -> 226 -> 208 -> 196.
// ---------------------------------------------------------------------------
const robot: Pet = {
  id: 'robot',
  label: 'Robot',
  bio: '// neutral chassis, a loud status light that screams near the limit.',
  width: WIDTH,
  height: HEIGHT,
  bodyColor: 250,
  asciiOnly: true,
  frames: {
    // standby, mouth closed
    idle: frame(['[-.-] ', ' |  | ', ' |  | '], []),
    // green status, readout on
    calm: frame(['[o.o] ', ' |==| ', ' |  | '], [
      { row: 0, col: 1, len: 1, color: 46 },
      { row: 0, col: 3, len: 1, color: 46 },
      { row: 1, col: 2, len: 2, color: 46 },
    ]),
    // yellow status
    wary: frame(['[O.O] ', ' |==| ', ' |  | '], [
      { row: 0, col: 1, len: 1, color: 226 },
      { row: 0, col: 3, len: 1, color: 226 },
      { row: 1, col: 2, len: 2, color: 226 },
    ]),
    // orange alarm
    alarmed: frame(['[>.<] ', ' |==| ', ' |  | '], [
      { row: 0, col: 1, len: 1, color: 208 },
      { row: 0, col: 3, len: 1, color: 208 },
      { row: 1, col: 2, len: 2, color: 208 },
    ]),
    // critical red, warning lamps
    panic: frame(['[XdX] ', '!|==|!', ' |  | '], [
      { row: 0, col: 1, len: 1, color: 196 },
      { row: 0, col: 3, len: 1, color: 196 },
      { row: 1, col: 0, len: 1, color: 196 },
      { row: 1, col: 2, len: 2, color: 196 },
      { row: 1, col: 5, len: 1, color: 196 },
    ]),
  },
}

// ---------------------------------------------------------------------------
// fish — bubbles rise calmly, then thrash as the tank heats up.
// body cyan (45); bubbles 51; eye reddens (9) when distressed.
// ---------------------------------------------------------------------------
const fish: Pet = {
  id: 'fish',
  label: 'Fish',
  bio: '// bubbles rise calmly, then thrash as the tank heats up.',
  width: WIDTH,
  height: HEIGHT,
  bodyColor: 45,
  asciiOnly: true,
  frames: {
    // resting, one bubble, still water
    idle: frame([' .    ', '<o><  ', '      '], [{ row: 0, col: 1, len: 1, color: 51 }]),
    // gentle bubbles, calm eye
    calm: frame([' o    ', '<o><  ', '  ~~  '], [
      { row: 0, col: 1, len: 1, color: 51 },
      { row: 1, col: 1, len: 1, color: 45 },
    ]),
    // more bubbles
    wary: frame([' o O  ', '<o><  ', ' ~~~~ '], [
      { row: 0, col: 1, len: 1, color: 51 },
      { row: 0, col: 3, len: 1, color: 51 },
    ]),
    // thrashing bubbles, eye reddens
    alarmed: frame(['oOo O ', '<X><  ', ' ~~~~ '], [
      { row: 0, col: 0, len: 5, color: 51 },
      { row: 1, col: 1, len: 1, color: 9 },
    ]),
    // boiling, X eye (red)
    panic: frame(['OoOoOo', '<X><  ', '\\~~~~/'], [
      { row: 0, col: 0, len: 6, color: 51 },
      { row: 1, col: 1, len: 1, color: 9 },
    ]),
  },
}

export const PETS: readonly Pet[] = [cactus, cat, dog, owl, robot, fish]

export function getPet(id: string): Pet | undefined {
  return PETS.find((p) => p.id === id)
}
