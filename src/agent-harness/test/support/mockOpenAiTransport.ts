// V2-authored for #945: the one mocked OpenAI transport the adapter-level
// suites share. The node Vitest project runs with isolate: false, so a file
// that hoists its own `openai` mock can find another file's mock already in
// the worker's module cache and feed a queue nobody consumes. Every suite
// that mocks `openai` therefore routes its factory through this module's
// single queue: no network, no credential, one response per queued entry.
export type MockedResponse = (input: unknown[]) => { output: unknown[]; output_text?: string }

export const transport = {
  queue: [] as MockedResponse[],
  requests: [] as unknown[][],
}

/** The `vi.mock('openai', ...)` factory: an OpenAI class whose Responses API pops the shared queue. */
export function mockedOpenAiModule() {
  return {
    default: class FakeOpenAI {
      responses = {
        create: (params: { input: unknown[] }) => ({
          withResponse: async () => {
            const next = transport.queue.shift()
            if (!next) throw new Error('the mocked transport has no response left')
            transport.requests.push([...params.input])
            const data = {
              ...next(params.input),
              usage: {
                input_tokens: 10,
                output_tokens: 5,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
              },
            }
            return { data, response: { headers: { get: () => null } } }
          },
        }),
      }
    },
  }
}

export const functionCall = (id: string, name: string, args: Record<string, unknown>) => ({
  type: 'function_call',
  call_id: id,
  name,
  arguments: JSON.stringify(args),
})
