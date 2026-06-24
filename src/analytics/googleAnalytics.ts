const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function installGoogleAnalytics() {
  if (!import.meta.env.PROD || !measurementId) return
  if (typeof document === 'undefined') return
  if (document.querySelector(`script[data-ga-measurement-id="${measurementId}"]`)) return

  window.dataLayer = window.dataLayer ?? []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args)
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  script.dataset.gaMeasurementId = measurementId
  document.head.appendChild(script)

  window.gtag('js', new Date())
  window.gtag('config', measurementId, {
    page_path: window.location.pathname + window.location.search,
  })
}
