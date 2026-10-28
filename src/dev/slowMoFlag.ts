export function slowMoEnabled(): boolean {
  return (
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('slowmo') === '1'
  )
}
