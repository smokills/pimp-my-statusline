import { describe, it, expect } from 'vitest'
import { parseRoute } from './useHashRoute'

describe('parseRoute', () => {
  it('maps the empty hash to landing', () => {
    expect(parseRoute('')).toBe('landing')
    expect(parseRoute('#')).toBe('landing')
    expect(parseRoute('#/')).toBe('landing')
  })

  it('maps #/build to build', () => {
    expect(parseRoute('#/build')).toBe('build')
  })

  it('tolerates the hash without a slash', () => {
    expect(parseRoute('#build')).toBe('build')
  })

  it('tolerates a trailing slash', () => {
    expect(parseRoute('#/build/')).toBe('build')
  })

  it('ignores a query suffix on the build route', () => {
    expect(parseRoute('#/build?from=hero')).toBe('build')
  })

  it('is case-insensitive', () => {
    expect(parseRoute('#/BUILD')).toBe('build')
  })

  it('treats unknown routes as landing', () => {
    expect(parseRoute('#/features')).toBe('landing')
    expect(parseRoute('#/pricing')).toBe('landing')
    expect(parseRoute('#/buildx')).toBe('landing') // not exactly "build"
  })

  it('treats a bare hash anchor as landing', () => {
    expect(parseRoute('#features')).toBe('landing')
  })
})
