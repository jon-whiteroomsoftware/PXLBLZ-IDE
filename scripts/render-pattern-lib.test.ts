import { describe, it, expect } from 'vitest'
import { parseRenderArgs, ffmpegArgs, renderSlug } from './render-pattern-lib'

describe('parseRenderArgs', () => {
  it('parses a demo render with defaults', () => {
    const config = parseRenderArgs(['--demo', 'PlasmaNebula'])
    expect(config).toEqual({
      demo: 'PlasmaNebula',
      file: null,
      seconds: 10,
      fps: 60,
      width: 2000,
      out: null,
      keepFrames: false,
      baseUrl: 'http://localhost:5174/PXLBLZ-IDE/',
      name: 'plasmanebula',
      diffusion: null,
    })
  })

  it('parses a file render, naming it from the file basename', () => {
    const config = parseRenderArgs(['--file', '/tmp/My Cool Pattern.js', '--seconds', '4', '--fps', '30'])
    expect(config.file).toBe('/tmp/My Cool Pattern.js')
    expect(config.demo).toBeNull()
    expect(config.seconds).toBe(4)
    expect(config.fps).toBe(30)
    expect(config.name).toBe('my-cool-pattern')
  })

  it('accepts width, out, name, base-url, and keep-frames overrides', () => {
    const config = parseRenderArgs([
      '--demo', 'Kishimisu', '--width', '3000', '--out', '/tmp/x.mp4',
      '--name', 'teaser', '--base-url', 'http://localhost:9999/app/', '--keep-frames',
    ])
    expect(config.width).toBe(3000)
    expect(config.out).toBe('/tmp/x.mp4')
    expect(config.name).toBe('teaser')
    expect(config.baseUrl).toBe('http://localhost:9999/app/')
    expect(config.keepFrames).toBe(true)
  })

  it('defaults diffusion to null (keep the pattern\'s own setting) and accepts 0..1 overrides', () => {
    expect(parseRenderArgs(['--demo', 'A']).diffusion).toBeNull()
    expect(parseRenderArgs(['--demo', 'A', '--diffusion', '0.44']).diffusion).toBe(0.44)
    expect(parseRenderArgs(['--demo', 'A', '--diffusion', '0']).diffusion).toBe(0)
    expect(() => parseRenderArgs(['--demo', 'A', '--diffusion', '1.5'])).toThrow()
    expect(() => parseRenderArgs(['--demo', 'A', '--diffusion', 'soft'])).toThrow()
  })

  it('requires exactly one of --demo and --file', () => {
    expect(() => parseRenderArgs([])).toThrow(/--demo|--file/)
    expect(() => parseRenderArgs(['--demo', 'A', '--file', 'b.js'])).toThrow(/--demo|--file/)
  })

  it('rejects non-positive or non-numeric seconds, fps, and width', () => {
    expect(() => parseRenderArgs(['--demo', 'A', '--seconds', '0'])).toThrow()
    expect(() => parseRenderArgs(['--demo', 'A', '--fps', 'fast'])).toThrow()
    expect(() => parseRenderArgs(['--demo', 'A', '--width', '-5'])).toThrow()
  })

  it('rejects an unknown flag', () => {
    expect(() => parseRenderArgs(['--demo', 'A', '--wat'])).toThrow(/--wat/)
  })
})

describe('renderSlug', () => {
  it('lowercases and squashes non-alphanumerics to single hyphens', () => {
    expect(renderSlug('My Cool  Pattern!')).toBe('my-cool-pattern')
    expect(renderSlug('PlasmaNebula')).toBe('plasmanebula')
  })
})

describe('ffmpegArgs', () => {
  const args = ffmpegArgs({ fps: 60, framePattern: '/tmp/c/x-%05d.png', outFile: '/tmp/out.mp4' })

  it('encodes a constant-frame-rate high-quality H.264 mp4', () => {
    expect(args).toContain('-framerate')
    expect(args[args.indexOf('-framerate') + 1]).toBe('60')
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/c/x-%05d.png')
    expect(args[args.indexOf('-crf') + 1]).toBe('12')
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p')
    expect(args[args.length - 1]).toBe('/tmp/out.mp4')
  })

  it('pads to even dimensions so yuv420p accepts any canvas size', () => {
    expect(args[args.indexOf('-vf') + 1]).toBe('pad=ceil(iw/2)*2:ceil(ih/2)*2')
  })
})
