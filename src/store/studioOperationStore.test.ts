import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  studioOperationInitialState,
  useStudioOperationStore,
  type StudioOperationSpec,
} from './studioOperationStore'

function operation(
  patch: Partial<StudioOperationSpec> & Pick<StudioOperationSpec, 'run'>,
): StudioOperationSpec {
  return {
    surface: 'rail',
    action: 'create',
    entityKind: 'pattern',
    entityName: 'Untitled Pattern',
    ...patch,
  }
}

describe('Studio one-shot operation feedback', () => {
  beforeEach(() => {
    useStudioOperationStore.setState(studioOperationInitialState)
  })

  it.each([
    ['pattern', 'Untitled Pattern'],
    ['map', 'Untitled Map'],
    ['mixin', 'Untitled Mixin'],
    ['library', 'Lib1'],
  ] as const)('reports a rejected %s create without changing the caller-owned durable view', async (entityKind, entityName) => {
    const visibleRecords: string[] = []

    const completed = await useStudioOperationStore.getState().execute(operation({
      entityKind,
      entityName,
      run: async () => {
        throw new Error('offline')
      },
    }))

    expect(completed).toBe(false)
    expect(visibleRecords).toEqual([])
    expect(useStudioOperationStore.getState().failures.rail).toMatchObject({
      action: 'create',
      entityKind,
      entityName,
      message: `Could not create ${entityKind} "${entityName}".`,
    })
  })

  it('retries the same logical intent and clears the notice after success', async () => {
    let offline = true
    const attemptedIds: string[] = []
    const spec = operation({
      action: 'clone',
      entityName: 'KITT copy',
      run: async () => {
        attemptedIds.push('fixed-record-id')
        if (offline) throw new Error('offline')
      },
    })

    await useStudioOperationStore.getState().execute(spec)
    offline = false
    const completed = await useStudioOperationStore.getState().retry('rail')

    expect(completed).toBe(true)
    expect(attemptedIds).toEqual(['fixed-record-id', 'fixed-record-id'])
    expect(useStudioOperationStore.getState().failures.rail).toBeNull()
  })

  it('dismisses without repeating the rejected write', async () => {
    const run = vi.fn(async () => {
      throw new Error('offline')
    })
    await useStudioOperationStore.getState().execute(operation({ run }))

    useStudioOperationStore.getState().dismiss('rail')

    expect(run).toHaveBeenCalledTimes(1)
    expect(useStudioOperationStore.getState().failures.rail).toBeNull()
  })

  it('lets a newer operation supersede an older failure on the same surface', async () => {
    let rejectOlder!: (cause: Error) => void
    const older = new Promise<void>((_resolve, reject) => { rejectOlder = reject })
    const first = useStudioOperationStore.getState().execute(operation({
      entityName: 'First Pattern',
      run: () => older,
    }))

    await useStudioOperationStore.getState().execute(operation({
      action: 'rename',
      entityName: 'Second Pattern',
      run: async () => {
        throw new Error('newer failure')
      },
    }))
    rejectOlder(new Error('older failure'))
    await first

    expect(useStudioOperationStore.getState().failures.rail).toMatchObject({
      action: 'rename',
      entityName: 'Second Pattern',
    })
  })

  it('keeps rail and editor failures independently actionable', async () => {
    await useStudioOperationStore.getState().execute(operation({
      surface: 'rail',
      entityKind: 'map',
      entityName: 'Wall Map',
      run: async () => { throw new Error('offline') },
    }))
    await useStudioOperationStore.getState().execute(operation({
      surface: 'editor',
      action: 'delete',
      entityKind: 'mixin',
      entityName: 'Brightness bind',
      run: async () => { throw new Error('offline') },
    }))

    expect(useStudioOperationStore.getState().failures.rail?.entityName).toBe('Wall Map')
    expect(useStudioOperationStore.getState().failures.editor?.entityName).toBe('Brightness bind')
  })

  it('clears stale failure state when a later unrelated operation succeeds', async () => {
    await useStudioOperationStore.getState().execute(operation({
      entityName: 'Failed Pattern',
      run: async () => { throw new Error('offline') },
    }))

    const completed = await useStudioOperationStore.getState().execute(operation({
      action: 'rename',
      entityKind: 'map',
      entityName: 'Renamed Map',
      run: async () => {},
    }))

    expect(completed).toBe(true)
    expect(useStudioOperationStore.getState().failures.rail).toBeNull()
  })
})
