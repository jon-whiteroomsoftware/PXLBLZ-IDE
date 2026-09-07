import type { Route, StudioEntityKind } from './routes'

export type StudioPlaceId = StudioEntityKind | 'docs' | 'api-reference'

export interface StudioPlaceDefinition {
  id: StudioPlaceId
  label: string
  shortcut: string
  group: 'primary' | 'studio' | 'reference'
}

export const STUDIO_PLACES: readonly StudioPlaceDefinition[] = [
  { id: 'patterns', label: 'Patterns', shortcut: 'P', group: 'primary' },
  { id: 'shows', label: 'Shows', shortcut: 'S', group: 'primary' },
  { id: 'maps', label: 'Maps', shortcut: 'M', group: 'studio' },
  { id: 'controllers', label: 'Controllers', shortcut: 'C', group: 'studio' },
  { id: 'mixins', label: 'Mixins', shortcut: 'X', group: 'studio' },
  { id: 'libraries', label: 'Libraries', shortcut: 'L', group: 'studio' },
  { id: 'docs', label: 'Docs', shortcut: 'D', group: 'reference' },
  { id: 'api-reference', label: 'API', shortcut: 'R', group: 'reference' },
] as const

export function studioPlaceForRoute(route: Route): StudioPlaceId {
  if (route.kind === 'docs') return 'docs'
  if (route.kind === 'api-reference') return 'api-reference'
  if (route.kind === 'show-detail') return 'shows'
  if (route.kind === 'studio') return route.entity?.kind ?? 'patterns'
  return 'patterns'
}

export function studioPlaceDefinition(id: StudioPlaceId): StudioPlaceDefinition {
  return STUDIO_PLACES.find((place) => place.id === id) ?? STUDIO_PLACES[0]
}

export function moveStudioPlaceFocus(index: number, delta: -1 | 1): number {
  return (index + delta + STUDIO_PLACES.length) % STUDIO_PLACES.length
}

export function studioPlaceTypeaheadIndex(query: string, fromIndex: number): number | null {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return null
  for (let offset = 1; offset <= STUDIO_PLACES.length; offset += 1) {
    const index = (fromIndex + offset) % STUDIO_PLACES.length
    if (STUDIO_PLACES[index].label.toLocaleLowerCase().startsWith(normalized)) return index
  }
  return null
}

export function studioPlaceForShortcut(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): StudioPlaceId | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.key.length !== 1) return null
  const key = event.key.toLocaleLowerCase()
  return STUDIO_PLACES.find((place) => place.shortcut.toLocaleLowerCase() === key)?.id ?? null
}

export function studioPlaceShortcutOwnsEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.closest([
    'input',
    'textarea',
    'select',
    'button',
    'a',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="menu"]',
    '[role="listbox"]',
    '[role="dialog"]',
    '[role="slider"]',
    '[role="treeitem"]',
    '.monaco-editor',
    '[data-studio-place-shortcuts="local"]',
  ].join(', ')) !== null
}
