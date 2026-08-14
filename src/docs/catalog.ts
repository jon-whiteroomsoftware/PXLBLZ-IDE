import ecosystemPrimer from '../../docs/reference/Pixelblaze Ecosystem Primer.md?raw'
import featureGuide from '../../docs/reference/PXLBLZ Feature Guide.md?raw'
import keyboardShortcuts from '../../docs/reference/PXLBLZ Keyboard Shortcuts.md?raw'
import understandingMaps from '../../docs/reference/Understanding Maps.md?raw'
import optimizationGuide from '../../docs/guides/Optimizing Pixelblaze patterns.md?raw'
import visualEffectsGuide from '../../docs/guides/Visual effects guide.md?raw'
import showCompilerGuide from '../../docs/guides/Inside the Show compiler.md?raw'
import technicalReference from '../../docs/reference/PXLBLZ Technical Reference.md?raw'
import aboutPxlblz from '../../docs/reference/About PXLBLZ.md?raw'
import privacy from '../../docs/reference/PXLBLZ Privacy.md?raw'

import artifactPipelineUrl from '../../docs/images/artifact-pipeline.svg?url'
import builtinCostsUrl from '../../docs/images/builtin-costs.svg?url'
import deviceBrowserBoundaryUrl from '../../docs/images/device-browser-boundary.svg?url'
import fillVsContainUrl from '../../docs/images/fill-vs-contain.svg?url'
import frameTimeBudgetUrl from '../../docs/images/frame-time-budget.svg?url'
import layoutPipelineUrl from '../../docs/images/layout-pipeline.svg?url'
import mapPipelineUrl from '../../docs/images/map-pipeline.svg?url'
import previewDeckBoundaryUrl from '../../docs/images/preview-deck-boundary.svg?url'
import renderTargetRolesUrl from '../../docs/images/render-target-roles.svg?url'
import showModelRuntimeUrl from '../../docs/images/show-model-runtime.svg?url'
import showOutputContractUrl from '../../docs/images/show-output-contract.svg?url'
import showPipelineUrl from '../../docs/images/show-pipeline.svg?url'
import showTimelineAnatomyUrl from '../../docs/images/show-timeline-anatomy.svg?url'
import systemMapUrl from '../../docs/images/system-map.svg?url'
import transitionCostClassesUrl from '../../docs/images/transition-cost-classes.svg?url'
import wholeFrameModelUrl from '../../docs/images/whole-frame-model.svg?url'
import showVisualToolkitOverviewUrl from '../../docs/screenshots/show-visual-toolkit-overview.png?url'
import showVisualToolkitEntityDetailUrl from '../../docs/screenshots/show-visual-toolkit-entity-detail.png?url'

export type DocId =
  | 'ecosystem-primer'
  | 'feature-guide'
  | 'keyboard-shortcuts'
  | 'show-visual-toolkit'
  | 'optimization-guide'
  | 'understanding-maps'
  | 'show-compiler'
  | 'technical-reference'
  | 'about'
  | 'privacy'

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
  '../images/artifact-pipeline.svg': artifactPipelineUrl,
  '../images/builtin-costs.svg': builtinCostsUrl,
  '../images/device-browser-boundary.svg': deviceBrowserBoundaryUrl,
  '../images/fill-vs-contain.svg': fillVsContainUrl,
  '../images/frame-time-budget.svg': frameTimeBudgetUrl,
  '../images/layout-pipeline.svg': layoutPipelineUrl,
  '../images/map-pipeline.svg': mapPipelineUrl,
  '../images/preview-deck-boundary.svg': previewDeckBoundaryUrl,
  '../images/render-target-roles.svg': renderTargetRolesUrl,
  '../images/show-model-runtime.svg': showModelRuntimeUrl,
  '../images/show-output-contract.svg': showOutputContractUrl,
  '../images/show-pipeline.svg': showPipelineUrl,
  '../images/show-timeline-anatomy.svg': showTimelineAnatomyUrl,
  '../images/system-map.svg': systemMapUrl,
  '../images/transition-cost-classes.svg': transitionCostClassesUrl,
  '../images/whole-frame-model.svg': wholeFrameModelUrl,
  '../screenshots/show-visual-toolkit-overview.png': showVisualToolkitOverviewUrl,
  '../screenshots/show-visual-toolkit-entity-detail.png': showVisualToolkitEntityDetailUrl,
}

export const USER_DOCS: UserDoc[] = [
  {
    id: 'ecosystem-primer',
    path: 'docs/reference/Pixelblaze Ecosystem Primer.md',
    title: 'Pixelblaze Ecosystem Primer',
    menuLabel: 'Ecosystem Primer',
    menuKicker: 'Start here',
    summary: 'A beginner-friendly mental model for Controllers, Patterns, maps, and the browser workbench.',
    source: ecosystemPrimer,
    assets: sharedAssets,
  },
  {
    id: 'feature-guide',
    path: 'docs/reference/PXLBLZ Feature Guide.md',
    title: 'PXLBLZ Feature Guide',
    menuLabel: 'Feature Guide',
    menuKicker: 'Using PXLBLZ',
    summary: 'Gallery, Studio authoring, preview, maps, Controllers, and Shows.',
    source: featureGuide,
    assets: sharedAssets,
  },
  {
    id: 'keyboard-shortcuts',
    path: 'docs/reference/PXLBLZ Keyboard Shortcuts.md',
    title: 'PXLBLZ Keyboard Shortcuts',
    menuLabel: 'Keyboard Shortcuts',
    menuKicker: 'Using PXLBLZ',
    summary: 'Keyboard commands and modifier-assisted interactions across Preview, Studio, and Shows.',
    source: keyboardShortcuts,
    assets: sharedAssets,
  },
  {
    id: 'show-visual-toolkit',
    path: 'docs/guides/Visual effects guide.md',
    title: 'Visual Effects Guide',
    menuLabel: 'Visual Effects Guide',
    menuKicker: 'Effects and transitions',
    summary: 'Property animation, Effects, Transitions, and the cost of combining Patterns.',
    source: visualEffectsGuide,
    assets: sharedAssets,
  },
  {
    id: 'understanding-maps',
    path: 'docs/reference/Understanding Maps.md',
    title: 'Understanding Maps',
    menuLabel: 'Understanding Maps',
    menuKicker: 'Pixel maps',
    summary: 'How maps are authored, normalized, pushed, and used by patterns.',
    source: understandingMaps,
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
  {
    id: 'show-compiler',
    path: 'docs/guides/Inside the Show compiler.md',
    title: 'Inside the Show Compiler',
    menuLabel: 'Show Compiler',
    menuKicker: 'Under the hood',
    summary: 'How a timeline becomes one Pattern: the pipeline, the render target, and the optimizations that survived hardware.',
    source: showCompilerGuide,
    assets: sharedAssets,
  },
  {
    id: 'technical-reference',
    path: 'docs/reference/PXLBLZ Technical Reference.md',
    title: 'PXLBLZ Technical Reference',
    menuLabel: 'Technical Reference',
    menuKicker: 'Engineering',
    summary: 'As-built architecture, boundaries, data flow, and implementation seams.',
    source: technicalReference,
    assets: sharedAssets,
  },
  {
    id: 'about',
    path: 'docs/reference/About PXLBLZ.md',
    title: 'About PXLBLZ',
    menuLabel: 'About PXLBLZ',
    menuKicker: 'Project',
    summary: 'Why PXLBLZ exists, who built it, and how the project operates.',
    source: aboutPxlblz,
    assets: sharedAssets,
  },
  {
    id: 'privacy',
    path: 'docs/reference/PXLBLZ Privacy.md',
    title: 'PXLBLZ Privacy',
    menuLabel: 'Privacy',
    menuKicker: 'Project',
    summary: 'How PXLBLZ handles account data, personal content, analytics, exports, and deletion requests.',
    source: privacy,
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

// Legacy hash form, still used for in-doc cross-links; the router redirects it
// onto the /docs/<id> path route (#308).
export function docHash(id: DocId): string {
  return `#/docs/${id}`
}

export function docExternalHref(id: DocId): string {
  return `${import.meta.env.BASE_URL}docs/${id}`
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
