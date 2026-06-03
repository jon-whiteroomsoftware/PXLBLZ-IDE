import { describe, it, expect } from 'vitest'
import { resolvePushTarget, withBinding, type BindingStore } from './controllerBinding'

const mint = () => 'NEWID00000000000'

describe('resolvePushTarget', () => {
  it('mints a fresh id on the first push for a pattern', () => {
    const r = resolvePushTarget(undefined, 'pat-1', [], mint)
    expect(r).toEqual({ programId: 'NEWID00000000000', isNew: true })
  })

  it('reuses a bound id that is still present on the device (overwrite-in-place)', () => {
    const r = resolvePushTarget({ 'pat-1': 'DEVPROG1' }, 'pat-1', ['DEVPROG1', 'OTHER'], mint)
    expect(r).toEqual({ programId: 'DEVPROG1', isNew: false })
  })

  it('silently re-creates when the bound id was deleted on the device', () => {
    const r = resolvePushTarget({ 'pat-1': 'DEVPROG1' }, 'pat-1', ['OTHER'], mint)
    expect(r).toEqual({ programId: 'NEWID00000000000', isNew: true })
  })

  it('mints for an unbound pattern even when the Controller has other bindings', () => {
    const r = resolvePushTarget({ 'pat-other': 'DEVX' }, 'pat-1', ['DEVX'], mint)
    expect(r).toEqual({ programId: 'NEWID00000000000', isNew: true })
  })
})

describe('withBinding', () => {
  it('records a binding without mutating the input', () => {
    const store: BindingStore = {}
    const next = withBinding(store, 'ctrl-A', 'pat-1', 'DEVPROG1')
    expect(next).toEqual({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } })
    expect(store).toEqual({})
  })

  it('preserves sibling controllers and sibling patterns', () => {
    const store: BindingStore = {
      'ctrl-A': { 'pat-1': 'D1' },
      'ctrl-B': { 'pat-9': 'D9' },
    }
    const next = withBinding(store, 'ctrl-A', 'pat-2', 'D2')
    expect(next).toEqual({
      'ctrl-A': { 'pat-1': 'D1', 'pat-2': 'D2' },
      'ctrl-B': { 'pat-9': 'D9' },
    })
  })

  it('overwrites an existing binding for the same pair', () => {
    const store: BindingStore = { 'ctrl-A': { 'pat-1': 'OLD' } }
    expect(withBinding(store, 'ctrl-A', 'pat-1', 'NEW')).toEqual({
      'ctrl-A': { 'pat-1': 'NEW' },
    })
  })
})
