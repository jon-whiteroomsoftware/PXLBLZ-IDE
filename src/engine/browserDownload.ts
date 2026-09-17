/**
 * Hand the browser a file to save. Extracted from the v1 Show editor unchanged
 * so the v2 editor route exports through the same one (#1056 slice 6).
 */
export function downloadBrowserFile(filename: string, body: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 0)
}
