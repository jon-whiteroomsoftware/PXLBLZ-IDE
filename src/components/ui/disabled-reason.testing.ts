import { expect } from 'vitest'

/**
 * Assert that a control follows the DisabledReasonTip contract (#796, #871,
 * #875): it stays focusable (no `disabled` attribute), carries
 * `aria-disabled="true"`, and its `aria-describedby` resolves to an element
 * whose text is the disabled reason.
 */
export function expectDisabledReason(control: HTMLElement, reason: string | RegExp): void {
  expect(control).not.toBeDisabled()
  expect(control).toHaveAttribute('aria-disabled', 'true')
  const id = control.getAttribute('aria-describedby')
  expect(id).toBeTruthy()
  const tip = document.getElementById(id!)
  expect(tip).not.toBeNull()
  expect(tip).toHaveTextContent(reason)
}

/** Assert that a control is neither hard-disabled nor gated by a reason. */
export function expectNotGated(control: HTMLElement): void {
  expect(control).not.toBeDisabled()
  expect(control).not.toHaveAttribute('aria-disabled')
  expect(control).not.toHaveAttribute('aria-describedby')
}
