type AnalyticsEnv = Pick<ImportMetaEnv, 'PROD' | 'DEV' | 'VITE_GA_MEASUREMENT_ID'>

type EntityCreatedKind = 'pattern' | 'map' | 'mixin' | 'show' | 'controller_profile'

type AnalyticsEventName =
  | 'catalog_clone'
  | 'send_to_controller'
  | 'sign_in'
  | `${EntityCreatedKind}_created`

type AnalyticsEventParams = Record<string, string | number | boolean | null | undefined>

type GtagCommand =
  | ['js', Date]
  | ['config', string, Record<string, unknown>?]
  | ['event', string, Record<string, unknown>?]

type GtagDataLayerEntry = IArguments | Record<string, unknown>

declare global {
  interface Window {
    dataLayer?: GtagDataLayerEntry[]
    gtag?: (...args: GtagCommand) => void
    __pxlblzAnalyticsInitialized?: boolean
  }
}

export function analyticsEnabled(env: AnalyticsEnv = import.meta.env): boolean {
  return Boolean(env.PROD && !env.DEV && env.VITE_GA_MEASUREMENT_ID)
}

export function initAnalytics(
  win: Window = window,
  doc: Document = document,
  env: AnalyticsEnv = import.meta.env,
): boolean {
  const measurementId = env.VITE_GA_MEASUREMENT_ID
  if (!analyticsEnabled(env) || !measurementId) return false
  if (win.__pxlblzAnalyticsInitialized) return true

  win.dataLayer = win.dataLayer ?? []
  win.gtag = function gtag() {
    // gtag.js consumes the canonical Arguments object; a rest-parameter array stays queued.
    // eslint-disable-next-line prefer-rest-params
    win.dataLayer?.push(arguments)
  }

  const script = doc.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  doc.head.appendChild(script)

  win.gtag('js', new Date())
  win.gtag('config', measurementId, { send_page_view: false })
  win.__pxlblzAnalyticsInitialized = true
  return true
}

export function trackPageView(
  path: string,
  title: string,
  win: Window = window,
  env: AnalyticsEnv = import.meta.env,
): void {
  if (!initAnalytics(win, win.document, env)) return
  win.gtag?.('event', 'page_view', {
    page_path: path,
    page_title: title,
  })
}

export function trackEvent(
  name: AnalyticsEventName,
  params: AnalyticsEventParams = {},
  win: Window = window,
  env: AnalyticsEnv = import.meta.env,
): void {
  if (!initAnalytics(win, win.document, env)) return
  win.gtag?.('event', name, compactParams(params))
}

export function trackEntityCreated(
  kind: EntityCreatedKind,
  params: AnalyticsEventParams = {},
  win: Window = window,
  env: AnalyticsEnv = import.meta.env,
): void {
  trackEvent(`${kind}_created`, params, win, env)
}

function compactParams(params: AnalyticsEventParams): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined),
  )
}
