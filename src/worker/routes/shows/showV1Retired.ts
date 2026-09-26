/**
 * Version-1 Show routes remain unavailable after the version-2 storage cutover
 * (#1042). File import still converts version-1 Show documents explicitly.
 */
export function isShowV2Request(request: Request): boolean {
  return new URL(request.url).searchParams.get('show-version') === '2'
}

export function showV1RetiredResponse(): Response {
  return Response.json({
    error: 'show-v1-retired',
    message: 'Show version 1 records are no longer read or written; convert them with the operator migration.',
  }, { status: 410 })
}
