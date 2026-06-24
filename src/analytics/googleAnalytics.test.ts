import { installGoogleAnalytics } from './googleAnalytics'

describe('installGoogleAnalytics', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    delete window.dataLayer
    delete window.gtag
  })

  it('does not install analytics in test/dev builds', () => {
    installGoogleAnalytics()

    expect(document.querySelector('script[src*="googletagmanager.com"]')).toBeNull()
    expect(window.gtag).toBeUndefined()
  })
})
