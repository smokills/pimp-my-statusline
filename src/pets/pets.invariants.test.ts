import { describe, it, expect } from 'vitest'
import { PETS, getPet } from './pets.ts'
import { MOOD_ORDER } from './types.ts'
import { visibleLen, colorizeFrame, isAllowedChar } from './runtime.ts'

// This is the build gate: every shipped pet must satisfy the fixed-grid,
// charset, and span invariants. A violation fails CI and blocks the build.

describe('pet roster invariants', () => {
  it('has unique pet ids', () => {
    const ids = PETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('getPet resolves every shipped id and rejects unknowns', () => {
    for (const p of PETS) expect(getPet(p.id)).toBe(p)
    expect(getPet('does-not-exist')).toBeUndefined()
  })

  for (const pet of PETS) {
    describe(pet.id, () => {
      it('defines a calm frame', () => {
        expect(pet.frames.calm).toBeDefined()
      })

      it('all present frames share identical dimensions', () => {
        const dims = MOOD_ORDER.filter((m) => pet.frames[m]).map((m) => {
          const f = pet.frames[m]!
          return `${f.rows.length}x${Math.max(...f.rows.map((r) => visibleLen(r)))}`
        })
        expect(new Set(dims).size).toBe(1)
        expect(dims[0]).toBe(`${pet.height}x${pet.width}`)
      })

      for (const mood of MOOD_ORDER) {
        const f = pet.frames[mood]
        if (!f) continue

        it(`${mood}: ${pet.width}x${pet.height} grid (raw rows)`, () => {
          expect(f.rows.length).toBe(pet.height)
          for (const row of f.rows) {
            expect(visibleLen(row)).toBe(pet.width)
          }
        })

        it(`${mood}: colorized rows keep the visible width invariant`, () => {
          // Correction #2: the width invariant must hold on what actually ships.
          const colored = colorizeFrame(f, pet.bodyColor)
          expect(colored.length).toBe(pet.height)
          for (const row of colored) {
            expect(visibleLen(row)).toBe(pet.width)
          }
        })

        it(`${mood}: only safe characters${pet.asciiOnly ? ' (ASCII-only)' : ''}`, () => {
          for (const row of f.rows) {
            for (const ch of row) {
              expect(isAllowedChar(ch)).toBe(true)
              if (pet.asciiOnly) {
                expect(ch.codePointAt(0)!).toBeLessThanOrEqual(0x7e)
              }
            }
          }
        })

        it(`${mood}: spans stay in bounds`, () => {
          for (const s of f.spans ?? []) {
            expect(s.row).toBeGreaterThanOrEqual(0)
            expect(s.row).toBeLessThan(pet.height)
            expect(s.col).toBeGreaterThanOrEqual(0)
            expect(s.col + s.len).toBeLessThanOrEqual(pet.width)
            expect(s.color).toBeGreaterThanOrEqual(0)
            expect(s.color).toBeLessThanOrEqual(255)
          }
        })
      }
    })
  }
})
