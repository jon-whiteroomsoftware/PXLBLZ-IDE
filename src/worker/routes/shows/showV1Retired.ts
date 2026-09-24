/**
 * Version-1 Show rows are unreachable from the product (#1042). They wait in
 * D1 for the operator conversion (`npm run show:v2-migrate`, #1105), which
 * reads the table directly rather than through these routes.
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
