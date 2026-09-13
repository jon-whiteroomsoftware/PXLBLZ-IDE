/** Canonical hardware identity, independent of display name and transport IP.
 * Discovery may omit leading zeroes from its reversed-MAC hex suffix.
 * Unknown formats remain opaque rather than being guessed into a MAC identity.
 */
export function canonicalControllerDeviceId(id: string): string {
  const match = /^pixelblaze_([a-zA-Z0-9-]+)_([0-9a-fA-F]{1,12})$/.exec(id)
  return match ? `pixelblaze_${match[1]}_${match[2].toLowerCase().padStart(12, '0')}` : id
}

export function sameControllerDeviceId(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return Boolean(left && right && canonicalControllerDeviceId(left) === canonicalControllerDeviceId(right))
}

/** Decode the reversed-MAC suffix into the hardware's conventional byte order. */
export function controllerMacAddress(id: string | null | undefined): string | null {
  if (!id) return null
  const canonical = canonicalControllerDeviceId(id)
  const match = /^pixelblaze_[a-zA-Z0-9-]+_([0-9a-f]{12})$/.exec(canonical)
  return match ? match[1].match(/../g)!.reverse().join(':').toUpperCase() : null
}
