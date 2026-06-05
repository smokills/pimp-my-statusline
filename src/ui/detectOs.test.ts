import { describe, it, expect } from 'vitest'
import { detectOs } from './detectOs'

describe('detectOs', () => {
  it('macOS via userAgentData/platform', () => {
    expect(detectOs({ platform: 'macOS' })).toBe('macos')
    expect(detectOs({ platform: 'MacIntel' })).toBe('macos')
  })

  it('macOS via legacy userAgent only', () => {
    expect(
      detectOs({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }),
    ).toBe('macos')
  })

  it('iOS devices get the macOS chrome (closest match)', () => {
    expect(
      detectOs({ platform: '', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }),
    ).toBe('macos')
  })

  it('Windows via platform or userAgent', () => {
    expect(detectOs({ platform: 'Win32' })).toBe('windows')
    expect(detectOs({ platform: 'Windows' })).toBe('windows')
    expect(detectOs({ platform: '', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe(
      'windows',
    )
  })

  it('Linux and anything unknown fall back to the Linux chrome', () => {
    expect(detectOs({ platform: 'Linux x86_64' })).toBe('linux')
    expect(detectOs({ platform: 'X11' })).toBe('linux')
    expect(detectOs({})).toBe('linux')
  })
})
