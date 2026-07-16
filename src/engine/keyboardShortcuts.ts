const STUDIO_EDITING_CONTROL_SELECTOR = [
  'input',
  'select',
  'textarea',
  'button',
  'a[href]',
  'summary',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="slider"]',
].join(', ')

export function studioControlOwnsKeyboardEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-studio-space-preview="true"]')) return false
  return target.closest(STUDIO_EDITING_CONTROL_SELECTOR) !== null
}
