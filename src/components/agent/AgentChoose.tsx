export function AgentChoose({ builtin, external }: { builtin: () => void; external: () => void }) {
  return <div className="divide-y divide-seam px-4">
    <button type="button" data-drawer-initial-focus onClick={builtin} className="w-full py-4 text-left"><b className="block text-xs font-semibold text-zinc-200">Use the Pixelblaze agent</b><span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">Ask for edits here. It works on this Show with you.</span></button>
    <button type="button" onClick={external} className="w-full py-4 text-left"><b className="block text-xs font-semibold text-zinc-200">Connect an MCP agent</b><span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">Claude Code, Codex, or a Claude connector edits this Show from where you already talk to it.</span></button>
  </div>
}
