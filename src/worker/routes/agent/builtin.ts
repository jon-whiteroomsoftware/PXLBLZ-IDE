import type { WorkerEnv } from '../../apiRoutes'
import { dispatchAgentDelivery, queryAgentEditor } from '../../agent/accountDelivery'
import { handleBuiltinHttp } from '../../agent/builtinHttp'

export function onRequestPost({ request, env }: { request: Request; env: WorkerEnv }): Promise<Response> {
  return handleBuiltinHttp(request, env, { deliver: dispatchAgentDelivery, query: queryAgentEditor })
}
