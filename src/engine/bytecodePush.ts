// Pure helpers for the Send-to-Controller push pipeline (H10, issue #202).
//
// The push of a compiled pattern to a Pixelblaze is: a `setCode` JSON frame
// (carrying the blob's size + CRC + a program id + name), the bytecode itself as
// chunked binary `putByteCode` frames, then `setControls`/unpause to save + run.
// This module holds only the *pure* pieces of that — the CRC32 the firmware
// expects over the blob, the program-id minting, and a header sanity check —
// extracted from the proven H8 spike (test/h8-compiler-spike) so they are unit-
// testable with no socket. The socket-bound save sequence itself lives on
// `PixelblazeConnection.pushByteCode`.
//
// Zero React, zero transport specifics.

/** CRC-32 (IEEE 802.3, the zlib/PNG polynomial) over a byte blob — the checksum
 *  the firmware validates a pushed `setCode` payload against. Ported verbatim
 *  from the spike; matches `pixelblaze-client`'s crc. */
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// The firmware's program-id alphabet: unambiguous base-53 (no 0/1/I/O/l/v). A
// pushed program needs an id; reusing the same id on a later push overwrites in
// place (the #202 contract) instead of piling up copies.
const ID_CHARS = '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz'
const ID_LENGTH = 17

/** Mint a fresh program id matching the firmware's format. `rng` is injectable
 *  so tests are deterministic; defaults to `Math.random`. */
export function makeProgramId(rng: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < ID_LENGTH; i++) s += ID_CHARS[Math.floor(rng() * ID_CHARS.length)]
  return s
}

/** A compiled-bytecode header reconciles when its declared opcode + export byte
 *  counts, plus the 8-byte header, equal the blob length. The spike's GO bar:
 *  `8 + opcodeBytes + exportBytes === len`. Guards against pushing a truncated or
 *  mis-framed blob. */
export function bytecodeHeaderReconciles(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const opcodeBytes = dv.getUint32(0, true)
  const exportBytes = dv.getUint32(4, true)
  return 8 + opcodeBytes + exportBytes === bytes.length
}
