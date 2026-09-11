import type { createAgentEditorAdmission } from '@/agent/editorAdmission'
import type { createProductionAgentSession } from '@/agent/editorSession'
import { createAgentDrawerController, diagnosticBridgeOrigin, type AgentDrawerController } from './agentDrawerController'

/** Explicit DEV-only transport switch; production never reads these globals. */
export function installDiagnosticAgentSession(admission: ReturnType<typeof createAgentEditorAdmission>, production: ReturnType<typeof createProductionAgentSession>): () => void {
  const w = window as unknown as { __pxlblzEditor?: typeof admission; __pxlblzAgentDrawer?: AgentDrawerController; __pxlblzChat?: AgentDrawerController }
  let diagnostic: AgentDrawerController | undefined
  const handle = {
    ...production.controller,
    attachBridge(url: string) {
      const origin = diagnosticBridgeOrigin(url)
      production.controller.dispose()
      diagnostic?.dispose()
      diagnostic = createAgentDrawerController(admission, production.controller.showId)
      diagnostic.attachBridge(origin)
      w.__pxlblzAgentDrawer = diagnostic
    },
    get requests() { return diagnostic?.requests ?? [] },
  }
  w.__pxlblzEditor = admission
  w.__pxlblzAgentDrawer = handle
  return () => {
    diagnostic?.dispose()
    if (w.__pxlblzEditor === admission) delete w.__pxlblzEditor
    if (w.__pxlblzAgentDrawer === handle || w.__pxlblzAgentDrawer === diagnostic) delete w.__pxlblzAgentDrawer
    if (w.__pxlblzChat === handle || w.__pxlblzChat === diagnostic) delete w.__pxlblzChat
  }
}
