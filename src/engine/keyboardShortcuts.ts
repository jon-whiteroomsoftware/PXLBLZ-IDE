const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'tel', 'url'])

export function studioControlOwnsKeyboardEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('textarea, [role="textbox"]')) return true
  const editable = target.closest<HTMLElement>('[contenteditable]')
  if (editable && editable.getAttribute('contenteditable') !== 'false') return true
  const input = target.closest<HTMLInputElement>('input')
  if (input && TEXT_INPUT_TYPES.has(input.type)) return true
  if (target.closest('[data-studio-space-preview="true"]')) return false
  return false
}
