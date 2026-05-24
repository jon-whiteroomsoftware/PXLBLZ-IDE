const rawLibs = import.meta.glob('./lib/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const LIBRARIES: Record<string, string> = Object.fromEntries(
  Object.entries(rawLibs).map(([path, src]) => {
    const name = path.replace('./lib/', '').replace('.js', '')
    return [name, src as string]
  }),
)
