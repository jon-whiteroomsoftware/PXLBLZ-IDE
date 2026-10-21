import { test, expect } from './fixtures/authenticated'
import {
  VISUAL_BASELINE_FIXTURES, VISUAL_BASELINE_VIEWPORT, VISUAL_BASELINE_CANVAS_WIDTH,
  VISUAL_BASELINE_FPS, VISUAL_BASELINE_COMPARISON, visualBaselineSnapshotName,
} from '../scripts/visual-baseline-fixtures'
import {
  preparePatternCapture, prepareShowCapture,
  type PxlblzCaptureApi, type PxlblzShowCaptureApi,
} from '../scripts/render-capture-page'
import { sequenceFrameName } from '../src/dev/captureSequence'

test.use({ viewport: VISUAL_BASELINE_VIEWPORT, deviceScaleFactor: 1 })

for (const fixture of VISUAL_BASELINE_FIXTURES) {
  test(`${fixture.id} (${fixture.target}) matches its approved reference images (#970)`, async ({ page }) => {
    test.setTimeout(180_000)
    const frames = new Map<string, Buffer>()
    await page.route(/\/__capture\?/, async (route) => {
      const name = new URL(route.request().url()).searchParams.get('name') ?? ''
      const body = route.request().postDataBuffer()
      if (!body) throw new Error(`capture ${name} arrived without a body`)
      frames.set(name, body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, bytes: body.length }) })
    })
    await page.routeWebSocket(/./, () => undefined)
    await page.goto(`${fixture.route}?capture`, { waitUntil: 'domcontentloaded' })
    const setup = { width: VISUAL_BASELINE_CANVAS_WIDTH, diffusion: null, lightSize: null, fidelity: fixture.fidelity }
    if (fixture.kind === 'pattern') {
      await preparePatternCapture(page, setup, `"${fixture.target}"`)
    } else {
      await prepareShowCapture(page, setup, `Show "${fixture.target}"`)
    }
    for (const frame of fixture.frames) {
      const prefix = `${fixture.id}-${frame.label}`
      const result = await page.evaluate(({ kind, fps, prefix, startMs }) => {
        const api: PxlblzCaptureApi | PxlblzShowCaptureApi = kind === 'pattern' ? window.__pxlblz! : window.__pxlblzShow!
        return api.captureSequence({ frames: 1, fps, prefix, startMs })
      }, { kind: fixture.kind, fps: VISUAL_BASELINE_FPS, prefix, startMs: frame.startMs })
      expect(result.failures).toEqual([])
      const png = frames.get(sequenceFrameName(prefix, 0))
      expect(png, 'frame captured').toBeTruthy()
      const { id, kind, dimension, target, route, map, seed, fidelity } = fixture
      await test.info().attach(`${prefix}-parameters.json`, {
        body: JSON.stringify({
          fixture: { id, kind, dimension, target, route, map, seed, fidelity }, frame,
          fps: VISUAL_BASELINE_FPS, viewport: VISUAL_BASELINE_VIEWPORT, canvasWidth: VISUAL_BASELINE_CANVAS_WIDTH,
        }, null, 2),
        contentType: 'application/json',
      })
      expect.soft(png).toMatchSnapshot(visualBaselineSnapshotName(fixture, frame), VISUAL_BASELINE_COMPARISON)
    }
  })
}
