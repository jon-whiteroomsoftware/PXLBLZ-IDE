import { afterEach, describe, expect, it } from 'vitest'

function mount(className = ''): HTMLDivElement {
  const element = document.createElement('div')
  element.className = className
  document.body.appendChild(element)
  return element
}

describe('real browser layout environment', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('computes geometry instead of returning jsdom zero rectangles', () => {
    const element = mount()
    element.style.width = '137px'
    element.style.height = '23px'

    const box = element.getBoundingClientRect()

    expect(box.width).toBe(137)
    expect(box.height).toBe(23)
  })

  it('loads the production Tailwind stylesheet before measuring', () => {
    const element = mount('w-24')

    // Production raises the root font size to 110%, so Tailwind's 6rem w-24
    // utility is 105.6px rather than the default 96px.
    expect(Number.parseFloat(getComputedStyle(element).width)).toBeCloseTo(105.6, 1)
  })

  it('runs in Chromium rather than a DOM emulator', () => {
    expect(navigator.userAgent).toMatch(/Chrom(?:e|ium)\//)
    expect(navigator.userAgent).not.toContain('jsdom')
  })

  it('waits for production fonts before measurements begin', () => {
    const sans = mount('font-sans')
    const mono = mount('font-mono')
    sans.textContent = 'Pixelblaze sans metrics'
    mono.textContent = 'Pixelblaze mono metrics'

    expect(document.documentElement.dataset.layoutFontsReady).toBe(
      '400 1rem "Geist Variable"|400 1rem "IBM Plex Mono"',
    )
    expect(getComputedStyle(sans).fontFamily).toContain('Geist Variable')
    expect(getComputedStyle(mono).fontFamily).toContain('IBM Plex Mono')
    expect(document.fonts.check('400 1rem "Geist Variable"', sans.textContent)).toBe(true)
    expect(document.fonts.check('400 1rem "IBM Plex Mono"', mono.textContent)).toBe(true)
  })
})
