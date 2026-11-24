export const CONTROLLER_HELPER_STORE_URL =
  'https://chromewebstore.google.com/detail/pxlblz-ide-controller-hel/hjdkmngopeofakdbjfkaomcmgkcidoeg'

export const CONTROLLER_HELPER_CONFLICT_MESSAGE =
  'More than one PXLBLZ-IDE Controller Helper is enabled. In chrome://extensions, turn off all but one, then reload this page.'

export class ControllerHelperConflictError extends Error {
  constructor() {
    super(CONTROLLER_HELPER_CONFLICT_MESSAGE)
    this.name = 'ControllerHelperConflictError'
  }
}
