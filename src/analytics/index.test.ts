import { analyticsEnabled, initAnalytics, trackEntityCreated, trackEvent, trackPageView } from './index'

describe('analytics', () => {
  it('is disabled unless a production build has a measurement id', () => {
    expect(analyticsEnabled({ PROD: false, DEV: true, VITE_GA_MEASUREMENT_ID: 'G-TEST' })).toBe(false)
    expect(analyticsEnabled({ PROD: true, DEV: false })).toBe(false)
    expect(analyticsEnabled({ PROD: true, DEV: false, VITE_GA_MEASUREMENT_ID: 'G-TEST' })).toBe(true)
  })

  it('installs gtag without sending an automatic page view', () => {
    const win = windowForAnalytics()

    expect(initAnalytics(win, win.document, { PROD: true, DEV: false, VITE_GA_MEASUREMENT_ID: 'G-TEST' })).toBe(true)

    expect(win.document.head.querySelector('script')?.getAttribute('src')).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-TEST',
    )
    expect(win.dataLayer?.[0][0]).toBe('js')
    expect(win.dataLayer?.[1]).toEqual(['config', 'G-TEST', { send_page_view: false }])
  })

  it('records page views and custom events through gtag', () => {
    const win = windowForAnalytics()
    const env = { PROD: true, DEV: false, VITE_GA_MEASUREMENT_ID: 'G-TEST' }

    trackPageView('/studio/patterns/p1', 'studio:patterns', win, env)
    trackEvent('send_to_controller', { mode: 'run', ignored: null }, win, env)
    trackEntityCreated('map', { ignored: undefined }, win, env)

    expect(win.dataLayer?.[2]).toEqual([
      'event',
      'page_view',
      { page_path: '/studio/patterns/p1', page_title: 'studio:patterns' },
    ])
    expect(win.dataLayer?.[3]).toEqual(['event', 'send_to_controller', { mode: 'run' }])
    expect(win.dataLayer?.[4]).toEqual(['event', 'map_created', {}])
  })
})

function windowForAnalytics(): Window {
  const doc = document.implementation.createHTMLDocument()
  return {
    document: doc,
    dataLayer: undefined,
    gtag: undefined,
    __pxlblzAnalyticsInitialized: false,
  } as unknown as Window
}
