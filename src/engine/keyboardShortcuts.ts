const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'tel', 'url'])
const SPACE_ACTIVATED_INPUT_TYPES = new Set(['checkbox', 'radio'])
const claimedPreviewSpaceEvents = new WeakSet<KeyboardEvent>()

/** A Space keydown may cross nested preview surfaces, but it toggles playback once. */
export function claimStudioPreviewSpace(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.code !== 'Space' || claimedPreviewSpaceEvents.has(event)) return false
  claimedPreviewSpaceEvents.add(event)
  event.preventDefault()
  return true
}

export function studioControlOwnsKeyboardEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('textarea, [role="textbox"]')) return true
  const editable = target.closest<HTMLElement>('[contenteditable]')
  if (editable && editable.getAttribute('contenteditable') !== 'false') return true
  const input = target.closest<HTMLInputElement>('input')
  if (input && (TEXT_INPUT_TYPES.has(input.type) || SPACE_ACTIVATED_INPUT_TYPES.has(input.type))) return true
  if (target.closest('[data-studio-space-preview="true"]')) return false
  return false
}
