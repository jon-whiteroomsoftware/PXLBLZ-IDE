export function AgentCall({ name, answer, decline }: { name: string; answer: () => void; decline: () => void }) {
  return <div className="m-4 border-l-2 border-amber-300 pl-3 text-xs"><p className="font-semibold text-zinc-200">{name} is calling.</p><p className="mt-1 text-zinc-400">It wants to edit this Show from here.</p><div className="mt-3 flex gap-2"><button className="agent-button agent-primary" type="button" onClick={answer}>Answer</button><button className="agent-button" type="button" onClick={decline}>Not now</button></div></div>
}
