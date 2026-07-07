// Direct Pixelblaze identity probe for issue #327.
//
// Opens one short-lived WebSocket, dumps the complete JSON frames around
// getConfig/listPrograms/ping, then closes before probing local HTTP endpoints.

import WebSocket from 'ws'
import { gunzipSync } from 'node:zlib'

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const DISCOVER_URL = 'https://discover.electromage.com/discover'

interface JsonFrame {
  atMs: number
  json: unknown
}

interface BinaryFrame {
  atMs: number
  bytes: number
  firstBytes: number[]
}

interface HttpResult {
  path: string
  status?: number
  contentType?: string
  bodyPreview?: string
  json?: unknown
  error?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timer])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function probeWebSocket(): Promise<{
  jsonFrames: JsonFrame[]
  binaryFrames: BinaryFrame[]
  candidates: string[]
}> {
  const url = `ws://${IP}:81`
  const jsonFrames: JsonFrame[] = []
  const binaryFrames: BinaryFrame[] = []
  const started = Date.now()

  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  await withTimeout(new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve())
    ws.on('error', (error) => reject(error))
  }), 5000, 'WebSocket open')

  ws.on('message', (data) => {
    const atMs = Date.now() - started
    const text = textFrame(data)
    if (text !== undefined) {
      try {
        jsonFrames.push({ atMs, json: JSON.parse(text) })
      } catch {
        jsonFrames.push({ atMs, json: text })
      }
      return
    }
    const bytes = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer)
    binaryFrames.push({ atMs, bytes: bytes.length, firstBytes: [...bytes.subarray(0, 12)] })
  })

  ws.send(JSON.stringify({ getConfig: true }))
  await sleep(1200)
  ws.send(JSON.stringify({ ping: true }))
  await sleep(500)
  ws.send(JSON.stringify({ getVars: true }))
  await sleep(500)
  ws.send(JSON.stringify({ listPrograms: true }))
  await sleep(1800)

  ws.close()
  await sleep(250)

  return {
    jsonFrames,
    binaryFrames,
    candidates: findCandidateFields(jsonFrames.map((f) => f.json)),
  }
}

async function probeHttp(): Promise<{
  results: HttpResult[]
  webUiEndpointHints: string[]
  candidates: string[]
}> {
  const paths = [
    '/',
    '/index.html',
    '/index.html.gz',
    '/config',
    '/config.json',
    '/discover',
    '/discovery',
    '/settings',
    '/settings.json',
    '/status',
    '/status.json',
    '/info',
    '/info.json',
    '/version',
    '/version.json',
    '/api/config',
    '/api/discover',
    '/api/status',
    '/wifistatus',
    '/pixelmap.dat',
    '/pixelmap.txt',
  ]
  const results: HttpResult[] = []
  let webUiText = ''

  for (const path of paths) {
    try {
      const resp = await withTimeout(fetch(`http://${IP}${path}`), 3500, `GET ${path}`)
      const contentType = resp.headers.get('content-type') ?? undefined
      const buf = Buffer.from(await resp.arrayBuffer())
      const body =
        path.endsWith('.gz') && resp.ok
          ? gunzipSync(buf).toString('utf8')
          : decodeMaybeText(buf, contentType)
      if (path === '/index.html.gz' && body) webUiText = body
      const json = parseJsonMaybe(body)
      results.push({
        path,
        status: resp.status,
        contentType,
        bodyPreview: body ? body.slice(0, 500) : undefined,
        ...(json !== undefined ? { json } : {}),
      })
    } catch (error) {
      results.push({
        path,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    results,
    webUiEndpointHints: extractEndpointHints(webUiText),
    candidates: findCandidateFields(results.map((r) => r.json).filter((v) => v !== undefined)),
  }
}

async function fetchCloudDiscovery(): Promise<unknown> {
  const resp = await withTimeout(fetch(DISCOVER_URL), 5000, 'cloud discovery')
  if (!resp.ok) throw new Error(`GET ${DISCOVER_URL} -> ${resp.status}`)
  return resp.json()
}

function decodeMaybeText(buf: Buffer, contentType?: string): string | undefined {
  if (buf.length === 0) return ''
  const looksText =
    contentType?.includes('text') ||
    contentType?.includes('json') ||
    /^[\t\n\r\x20-\x7e]*$/.test(buf.subarray(0, Math.min(buf.length, 500)).toString('latin1'))
  return looksText ? buf.toString('utf8') : undefined
}

function parseJsonMaybe(value: string | undefined): unknown {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

function textFrame(data: WebSocket.RawData): string | undefined {
  if (typeof data === 'string') return data
  const bytes = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer)
  const prefix = bytes.subarray(0, Math.min(bytes.length, 100)).toString('utf8')
  if (!/^[\t\n\r\x20-\x7e]*$/.test(prefix)) return undefined
  const text = bytes.toString('utf8')
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
  return text
}

function findCandidateFields(values: unknown[]): string[] {
  const out: string[] = []
  for (const value of values) visitCandidate(value, '$', out)
  return [...new Set(out)]
}

function visitCandidate(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitCandidate(item, `${path}[${index}]`, out))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (/(^id$|device|mac|chip|serial|uuid|hardware|board|version|name|localIp)/i.test(key)) {
      out.push(`${childPath} = ${JSON.stringify(child)}`)
    }
    visitCandidate(child, childPath, out)
  }
}

function extractEndpointHints(webUiText: string): string[] {
  if (!webUiText) return []
  const hints = new Set<string>()
  const regex = /["'`](\/[A-Za-z0-9_./?=&%:-]+)["'`]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(webUiText)) !== null) {
    const path = match[1]
    if (/(config|discover|setting|status|info|version|json|dat|map|ws)/i.test(path)) {
      hints.add(path)
    }
  }
  return [...hints].sort()
}

function cloudRecordsForIp(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.filter((record) => {
    return record && typeof record === 'object' && (record as { localIp?: unknown }).localIp === IP
  })
}

async function main(): Promise<void> {
  console.log(`# Pixelblaze direct identity probe (#327)`)
  console.log(`IP: ${IP}`)

  console.log('\n## WebSocket')
  const ws = await probeWebSocket()
  console.log(`JSON frames: ${ws.jsonFrames.length}`)
  for (const frame of ws.jsonFrames) {
    console.log(`- +${frame.atMs}ms ${JSON.stringify(frame.json)}`)
  }
  console.log(`Binary frames: ${ws.binaryFrames.length}`)
  for (const frame of ws.binaryFrames.slice(0, 10)) {
    console.log(`- +${frame.atMs}ms bytes=${frame.bytes} first=${frame.firstBytes.join(',')}`)
  }
  console.log('Candidate WS identity fields:')
  console.log(ws.candidates.length > 0 ? ws.candidates.map((c) => `- ${c}`).join('\n') : '- none')

  console.log('\n## Local HTTP')
  const http = await probeHttp()
  for (const result of http.results) {
    if (result.error) {
      console.log(`- ${result.path}: ERROR ${result.error}`)
    } else {
      console.log(`- ${result.path}: ${result.status} ${result.contentType ?? ''}`)
      if (result.json !== undefined) console.log(`  json=${JSON.stringify(result.json)}`)
    }
  }
  console.log('Web UI endpoint hints:')
  console.log(http.webUiEndpointHints.length > 0 ? http.webUiEndpointHints.map((c) => `- ${c}`).join('\n') : '- none')
  console.log('Candidate HTTP identity fields:')
  console.log(http.candidates.length > 0 ? http.candidates.map((c) => `- ${c}`).join('\n') : '- none')

  console.log('\n## Cloud discovery cross-check')
  const cloud = await fetchCloudDiscovery()
  const matches = cloudRecordsForIp(cloud)
  console.log(`Records for ${IP}: ${JSON.stringify(matches)}`)
}

main().catch((error) => {
  console.error('deviceIdProbe failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
