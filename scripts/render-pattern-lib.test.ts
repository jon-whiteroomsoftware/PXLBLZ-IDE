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
      lightSize: null,
      fidelity: null,
      slowMo: null,
      show: null,
      startSeconds: 0,
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

  it('defaults light size to null and accepts the complete 0.15..0.95 preview range (#881)', () => {
    expect(parseRenderArgs(['--demo', 'A']).lightSize).toBeNull()
    expect(parseRenderArgs(['--demo', 'A', '--light-size', '0.7']).lightSize).toBe(0.7)
    expect(parseRenderArgs(['--demo', 'A', '--light-size', '0.15']).lightSize).toBe(0.15)
    expect(parseRenderArgs(['--show', 'stock-show-x', '--light-size', '0.95']).lightSize).toBe(0.95)
    expect(() => parseRenderArgs(['--demo', 'A', '--light-size', '0.149'])).toThrow(/--light-size/)
    expect(() => parseRenderArgs(['--demo', 'A', '--light-size', '0.951'])).toThrow(/--light-size/)
    expect(() => parseRenderArgs(['--demo', 'A', '--light-size', 'large'])).toThrow(/--light-size/)
  })

  it('preserves stored fidelity when omitted for Patterns and Shows', () => {
    expect(parseRenderArgs(['--demo', 'A']).fidelity).toBeNull()
    expect(parseRenderArgs(['--show', 'stock-show-x']).fidelity).toBeNull()
  })

  it.each(['fast', 'precise'])('accepts Pattern fidelity %s', (fidelity) => {
    expect(parseRenderArgs(['--file', '/tmp/a.js', '--fidelity', fidelity]).fidelity).toBe(fidelity)
  })

  it.each(['', 'fidelity', 'PRECISE', 'slow'])('rejects invalid fidelity %s', (fidelity) => {
    expect(() => parseRenderArgs(['--demo', 'A', '--fidelity', fidelity]))
      .toThrow('--fidelity requires fast or precise.')
  })

  it('requires a fidelity value', () => {
    expect(() => parseRenderArgs(['--demo', 'A', '--fidelity']))
      .toThrow('--fidelity requires a value.')
  })

  it.each(['fast', 'precise'])('rejects explicit Show fidelity %s', (fidelity) => {
    expect(() => parseRenderArgs(['--show', 'stock-show-x', '--fidelity', fidelity]))
      .toThrow('--fidelity is supported for Pattern renders only.')
  })

  describe('--slowmo', () => {
    const settings = { rate: 0.25, stepMs: 16, inBetween: 'blend', stagger: { shape: 'sweep', width: 0 }, persistence: null }
    const parse = (input: unknown) => parseRenderArgs(['--demo', 'A', '--slowmo', JSON.stringify(input)]).slowMo

    it.each(['clock', 'hold', 'blend', 'eased'])('accepts complete %s settings across rates and steps', inBetween => {
      for (const rate of [1, 1 / 4, 1 / 32]) for (const stepMs of [16, 32]) {
        const expected = { ...settings, rate, stepMs, inBetween }
        expect(parse(expected)).toEqual(expected)
      }
    })
    it.each(['sweep', 'radial', 'scatter'])('copies only known fields for %s', shape => {
      for (const width of [0, 0.5, 0.9]) {
        const expected = { ...settings, stagger: { shape, width } }
        expect(parse({ ...expected, extra: true, stagger: { ...expected.stagger, extra: true } })).toEqual(expected)
      }
    })
    it.each([null, { attackMs: 0, decayMs: 0 }, { attackMs: 1500, decayMs: 1500 },
      { attackMs: 0, decayMs: 2000 }, { attackMs: 5000, decayMs: 10000 }])('accepts persistence %j and strips unknown fields', persistence => {
      const expected = { ...settings, stagger: { shape: 'scatter', width: 0.5 }, persistence }
      expect(parse({ ...expected, extra: true, persistence: persistence === null ? null : { ...persistence, extra: true } }))
        .toEqual(expected)
    })
    it('accepts the runtime numeric bounds beyond the lab stops', () => {
      expect(parse({ ...settings, rate: Number.MIN_VALUE, stepMs: 32767 })).toEqual({ ...settings, rate: Number.MIN_VALUE, stepMs: 32767 })
    })
    it('preserves omission for Patterns and Shows', () => {
      expect(parseRenderArgs(['--demo', 'A']).slowMo).toBeNull()
      expect(parseRenderArgs(['--show', 'stock-show-x']).slowMo).toBeNull()
    })
    it('requires a flag value', () => {
      expect(() => parseRenderArgs(['--demo', 'A', '--slowmo'])).toThrow('--slowmo requires a value.')
    })
    it.each(['{', 'null', '[]', '1', '"settings"'])('rejects non-object JSON %s', raw => {
      expect(() => parseRenderArgs(['--demo', 'A', '--slowmo', raw])).toThrow('--slowmo requires a SlowMoSettings JSON object.')
    })
    it.each([
      ['rate', [undefined, 0, -1, 1.1, '0.25', 1e308], '--slowmo rate must be finite and in (0, 1].'],
      ['stepMs', [undefined, 0, -1, 32768, '16', 1e308], '--slowmo stepMs must be finite and in (0, 32767].'],
      ['inBetween', [undefined, 'future'], '--slowmo inBetween must be clock, hold, blend, or eased.'],
    ] as const)('rejects invalid or missing %s', (field, values, message) => {
      for (const value of values) expect(() => parse({ ...settings, [field]: value })).toThrow(message)
    })
    it.each([
      undefined, null, [], 1, 'sweep', {}, { width: 0 }, { shape: 'future', width: 0 },
      { shape: 'sweep' }, { shape: 'sweep', width: '0.5' }, { shape: 'sweep', width: -0.001 },
      { shape: 'sweep', width: 0.9001 },
    ])('rejects invalid or missing stagger %j', stagger => {
      expect(() => parse({ ...settings, stagger })).toThrow(new Error(
        '--slowmo stagger must have shape sweep, radial, or scatter and finite width in [0, 0.9].',
      ))
    })
    it.each([
      undefined, [], 1, 'persistence', {}, { attackMs: 0 }, { decayMs: 0 },
      { attackMs: '0', decayMs: 0 }, { attackMs: 0, decayMs: '0' },
      { attackMs: -0.001, decayMs: 0 }, { attackMs: 0, decayMs: -0.001 },
      { attackMs: 5000.001, decayMs: 0 }, { attackMs: 0, decayMs: 10000.001 },
    ])('rejects invalid or missing persistence %j', persistence => {
      expect(() => parse({ ...settings, persistence })).toThrow(new Error(
        '--slowmo persistence must be null or have finite attackMs in [0, 5000] and decayMs in [0, 10000].',
      ))
    })
    it.each([
      ['"width":0', '"width":1e309', '--slowmo stagger must have shape sweep, radial, or scatter and finite width in [0, 0.9].'],
      ['"attackMs":0', '"attackMs":1e309', '--slowmo persistence must be null or have finite attackMs in [0, 5000] and decayMs in [0, 10000].'],
      ['"decayMs":0', '"decayMs":1e309', '--slowmo persistence must be null or have finite attackMs in [0, 5000] and decayMs in [0, 10000].'],
    ])('rejects nonfinite JSON literal in %s', (field, overflow, message) => {
      const raw = JSON.stringify({ ...settings, persistence: { attackMs: 0, decayMs: 0 } }).replace(field, overflow)
      expect(() => parseRenderArgs(['--demo', 'A', '--slowmo', raw])).toThrow(new Error(message))
    })
    it.each([false, true])('rejects Show settings in either argument order (first=%s)', first => {
      const slowMo = ['--slowmo', JSON.stringify(settings)]
      const show = ['--show', 'stock-show-x']
      expect(() => parseRenderArgs(first ? [...slowMo, ...show] : [...show, ...slowMo]))
        .toThrow('--slowmo is supported for Pattern renders only.')
    })
    it('rejects Show slow-mo independently of explicit fidelity', () => {
      expect(() => parseRenderArgs(['--show', 'stock-show-x', '--fidelity', 'precise', '--slowmo', JSON.stringify(settings)]))
        .toThrow('--slowmo is supported for Pattern renders only.')
    })
    it.each([false, true])('rejects Show B/C settings in either argument order (first=%s)', first => {
      for (const advanced of [
        { ...settings, stagger: { shape: 'sweep', width: 0.5 } },
        { ...settings, persistence: { attackMs: 1500, decayMs: 1500 } },
        { ...settings, stagger: { shape: 'scatter', width: 0.5 }, persistence: { attackMs: 0, decayMs: 2000 } },
      ]) {
        const slowMo = ['--slowmo', JSON.stringify(advanced)]
        const show = ['--show', 'stock-show-x']
        expect(() => parseRenderArgs(first ? [...slowMo, ...show] : [...show, ...slowMo]))
          .toThrow(new Error('--slowmo is supported for Pattern renders only.'))
      }
    })
  })

  it('accepts --file with --demo naming the mount point, keeping the file name', () => {
    const config = parseRenderArgs(['--file', '/tmp/Aurora Calm.js', '--demo', 'AuroraSphere'])
    expect(config.file).toBe('/tmp/Aurora Calm.js')
    expect(config.demo).toBe('AuroraSphere')
    expect(config.name).toBe('aurora-calm')
  })

  it('requires at least one of --demo, --file, and --show', () => {
    expect(() => parseRenderArgs([])).toThrow(/--demo|--file|--show/)
  })

  describe('--show and --start (#879)', () => {
    it('parses a Show render, naming it from the show id without the stock prefix', () => {
      const config = parseRenderArgs(['--show', 'stock-show-showcase-distortion-effects'])
      expect(config.show).toBe('stock-show-showcase-distortion-effects')
      expect(config.demo).toBeNull()
      expect(config.file).toBeNull()
      expect(config.name).toBe('showcase-distortion-effects')
    })

    it('keeps a non-stock show id as the name verbatim (slugged)', () => {
      expect(parseRenderArgs(['--show', 'My Show 01']).name).toBe('my-show-01')
    })

    it('rejects --show combined with --demo or --file', () => {
      expect(() => parseRenderArgs(['--show', 'stock-show-x', '--demo', 'PlasmaNebula'])).toThrow(/--show/)
      expect(() => parseRenderArgs(['--show', 'stock-show-x', '--file', '/tmp/a.js'])).toThrow(/--show/)
    })

    it('defaults --start to 0 seconds and accepts a non-negative offset in either mode', () => {
      expect(parseRenderArgs(['--demo', 'A']).startSeconds).toBe(0)
      expect(parseRenderArgs(['--demo', 'A', '--start', '12.5']).startSeconds).toBe(12.5)
      expect(parseRenderArgs(['--show', 'stock-show-x', '--start', '0']).startSeconds).toBe(0)
      expect(parseRenderArgs(['--file', '/tmp/a.js', '--start', '3']).startSeconds).toBe(3)
    })

    it('rejects a negative or non-numeric --start', () => {
      expect(() => parseRenderArgs(['--demo', 'A', '--start', '-1'])).toThrow(/--start/)
      expect(() => parseRenderArgs(['--demo', 'A', '--start', 'later'])).toThrow(/--start/)
      expect(() => parseRenderArgs(['--demo', 'A', '--start'])).toThrow(/--start/)
    })

    it('rejects a Show render narrower than the stage-preview breakpoint', () => {
      expect(() => parseRenderArgs(['--show', 'stock-show-x', '--width', '980'])).toThrow(/--width/)
      expect(parseRenderArgs(['--show', 'stock-show-x', '--width', '981']).width).toBe(981)
      expect(parseRenderArgs(['--demo', 'A', '--width', '560']).width).toBe(560)
    })
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
