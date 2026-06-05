import { describe, expect, it } from 'vitest'
import { stripAnsi, visibleWidth } from '../width'
import { visibleLen, stripAnsi as runtimeStrip } from '../../pets/runtime'

const ESC = '\x1b'

describe('width re-exports from pets/runtime', () => {
  it('stripAnsi is the same implementation as pets/runtime', () => {
    expect(stripAnsi).toBe(runtimeStrip)
  })

  it('visibleWidth equals pets/runtime visibleLen', () => {
    const s = `${ESC}[1;34m~/dev/x${ESC}[0m`
    expect(visibleWidth(s)).toBe(visibleLen(s))
    expect(visibleWidth(s)).toBe('~/dev/x'.length)
  })

  it('stripAnsi removes SGR and OSC8', () => {
    const s = `${ESC}[32mok${ESC}[0m${ESC}]8;;http://x${ESC}\\link${ESC}]8;;${ESC}\\`
    expect(stripAnsi(s)).toBe('oklink')
  })
})
