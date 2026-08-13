import { personalStorageGuardResponse } from '../../src/cloudflare/resourceProtection'

interface PagesFunctionContext {
  request: Request
  env?: unknown
  next(): Promise<Response>
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  try {
    return await context.next()
  } catch (error) {
    const response = personalStorageGuardResponse(error)
    if (response) return response
    throw error
  }
}
