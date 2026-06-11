import ecosystemPrimer from '../../docs/reference/Pixelblaze Ecosystem Primer.md?raw'
import featureGuide from '../../docs/reference/PXLBLZ Feature Guide.md?raw'
import optimizationGuide from '../../docs/guides/Optimizing Pixelblaze patterns.md?raw'

import builtinCostsUrl from '../../docs/images/builtin-costs.svg?url'
import deviceBrowserBoundaryUrl from '../../docs/images/device-browser-boundary.svg?url'
import fillVsContainUrl from '../../docs/images/fill-vs-contain.svg?url'
import mapPipelineUrl from '../../docs/images/map-pipeline.svg?url'
import wholeFrameModelUrl from '../../docs/images/whole-frame-model.svg?url'

export type DocId = 'ecosystem-primer' | 'feature-guide' | 'optimization-guide'

export type UserDoc = {
  id: DocId
  path: string
  title: string
  menuLabel: string
  menuKicker: string
  summary: string
  source: string
  assets: Record<string, string>
}

const sharedAssets = {
  '../images/builtin-costs.svg': builtinCostsUrl,
  '../images/device-browser-boundary.svg': deviceBrowserBoundaryUrl,
  '../images/fill-vs-contain.svg': fillVsContainUrl,
  '../images/map-pipeline.svg': mapPipelineUrl,
  '../images/whole-frame-model.svg': wholeFrameModelUrl,
}

export const USER_DOCS: UserDoc[] = [
  {
    id: 'ecosystem-primer',
    path: 'docs/reference/Pixelblaze Ecosystem Primer.md',
    title: 'Pixelblaze Ecosystem Primer',
    menuLabel: 'Ecosystem Primer',
    menuKicker: 'Start here',
    summary: 'Hardware, maps, fixed-point math, and the device/browser split.',
    source: ecosystemPrimer,
    assets: sharedAssets,
  },
  {
    id: 'feature-guide',
    path: 'docs/reference/PXLBLZ Feature Guide.md',
    title: 'PXLBLZ Feature Guide',
    menuLabel: 'Feature Guide',
    menuKicker: 'Using PXLBLZ',
    summary: 'The screen, preview, editor, controls, maps, and Controller flow.',
    source: featureGuide,
    assets: sharedAssets,
  },
  {
    id: 'optimization-guide',
    path: 'docs/guides/Optimizing Pixelblaze patterns.md',
    title: 'Optimizing Pixelblaze Patterns',
    menuLabel: 'Optimization Guide',
    menuKicker: 'Writing faster patterns',
    summary: 'Frame costs, profiling tools, measured wins, and porting tactics.',
    source: optimizationGuide,
    assets: sharedAssets,
  },
]

export function getUserDoc(id: DocId | null): UserDoc | null {
  if (!id) return null
  return USER_DOCS.find((doc) => doc.id === id) ?? null
}

export function isDocId(value: string): value is DocId {
  return USER_DOCS.some((doc) => doc.id === value)
}

export function docHash(id: DocId): string {
  return `#/docs/${id}`
}

export function docExternalHref(id: DocId): string {
  return `${import.meta.env.BASE_URL}${docHash(id)}`
}

export function resolveDocAsset(doc: UserDoc, src: string): string {
  return doc.assets[src] ?? src
}

function normalizeRelativePath(fromPath: string, href: string): string {
  const fromParts = fromPath.split('/').slice(0, -1)
  for (const part of href.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') fromParts.pop()
    else fromParts.push(part)
  }
  return fromParts.join('/')
}

export function resolveDocHref(doc: UserDoc, href: string): string {
  if (/^(https?:|mailto:|#)/.test(href)) return href
  const normalized = normalizeRelativePath(doc.path, href)
  const targetDoc = USER_DOCS.find((candidate) => candidate.path === normalized)
  if (targetDoc) return docHash(targetDoc.id)
  return `https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/main/${normalized}`
}
