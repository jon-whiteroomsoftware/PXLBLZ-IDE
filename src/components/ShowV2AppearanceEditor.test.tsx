import { useMemo, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { prepareShowStageV2 } from '@/engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { ShowV2AppearanceEditor } from './ShowV2AppearanceEditor'
import * as identity from '@/engine/personalContentMetadata'
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => { resetPersonalContentProvider(); vi.restoreAllMocks() })
function setup(mixed = false, color?: 'uniform' | 'mixed', animatedEffect = false) {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const record = c.record; record.composition.transitions = []; record.composition.clips = record.composition.clips.slice(0, 1)
  const clip = record.composition.clips[0], first = clip.appearance.keys[0]
  first.value.effects = [{ id: 'hue', kind: 'hue', turns: .2 }]
  if (animatedEffect) {
    first.value.effects = [{ id: 'hue', kind: 'hue', turns: .2 }, { id: 'bright', kind: 'brightness', brightness: .8 }]
    record.composition.propertyTracks = [{ id: 'hue-track', target: { kind: 'clip-effect', clipId: clip.id, effectId: 'hue', effectKind: 'hue', parameterId: 'turns' },
      activeStartMs: clip.startMs, activeDurationMs: 200,
      keyframes: [{ id: 'hue-first', timeMs: clip.startMs, value: .2, easing: { curve: 'linear' } }, { id: 'hue-last', timeMs: clip.startMs + 200, value: .4, easing: { curve: 'linear' } }] }]
  }
  if (mixed) clip.appearance.keys = [0, 400].map((timeMs, index) => ({ id: `key-${index}`, timeMs,
    value: { ...structuredClone(first.value), opacity: index ? .8 : .2, view: { mirror: Boolean(index), phase: .1, brightness: index ? .7 : .3 } } }))
  if (color) for (const [index,key] of clip.appearance.keys.entries()) key.value.effects = [{id:'map',kind:'color-map',amount:1,shadowR:color==='mixed' && index ? .101 : .1,shadowG:.2,shadowB:.3,highlightR:.4,highlightG:.5,highlightB:.6}]
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  const dependencies = { patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }], maps: [], libraries: [], profiles: [], stageMap: null }
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'appearance-editor', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  function Harness() {
    const current = useShowStore(state => state.showV2Pilots[record.id]); const [status, setStatus] = useState('')
    const capture = useMemo(() => ({ record: current, dependencies, prepared: prepareShowStageV2(current, dependencies) }), [current])
    return <><ShowV2AppearanceEditor clipId={clip.id} capture={capture} isCurrentCapture={() => useShowStore.getState().showV2Pilots[record.id] === current}
      isCurrentCompletion={(receipt, phase) => phase === 'saved' ? useShowStore.getState().showV2Pilots[record.id] === receipt.record : useShowStore.getState().showV2SaveFailure?.record === receipt.record}
      onStatus={setStatus} /><output>{status}</output></>
  }
  render(<Harness />); return { record, clip, write }
}
it('requires explicit scope and submits only dirty brightness while mixed opacity/mirror stay exact', async () => {
  const { record, clip, write } = setup(true)
  expect(screen.getByLabelText('Appearance scope')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Apply appearance' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Appearance scope'), { target: { value: 'whole-clip' } })
  expect(screen.getByLabelText('Clip opacity')).toHaveAttribute('placeholder', 'Mixed')
  expect(screen.getByLabelText('Clip mirror')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('View brightness'), { target: { value: '.5' } })
  expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' }))
  expect(await screen.findByText('Appearance saved.')).toBeInTheDocument(); expect(write).toHaveBeenCalledTimes(1)
  const keys = useShowStore.getState().showV2Pilots[record.id].composition.clips[0].appearance.keys
  expect(keys.map(key => key.value.opacity)).toEqual([.2, .8]); expect(keys.map(key => key.value.view.mirror)).toEqual([false, true])
  expect(keys.map(key => key.value.view.brightness)).toEqual([.5, .5]); expect(keys.map(key => [key.id, key.timeMs])).toEqual(clip.appearance.keys.map(key => [key.id, key.timeMs]))
})
it('inserts a complete interior held key and excludes exact end without saving', async () => {
  const { record, clip, write } = setup(true)
  fireEvent.change(screen.getByLabelText('Appearance scope'), { target: { value: 'selected-time' } })
  fireEvent.change(screen.getByLabelText('Appearance time'), { target: { value: '200' } })
  fireEvent.change(screen.getByLabelText('Clip opacity'), { target: { value: '.6' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' }))
  expect(await screen.findByText('Appearance saved.')).toBeInTheDocument()
  const key = useShowStore.getState().showV2Pilots[record.id].composition.clips[0].appearance.keys[1]
  expect(key.id).not.toBe(clip.appearance.keys[0].id); expect(key.timeMs).toBe(200)
  expect(key.value).toEqual({ ...clip.appearance.keys[0].value, opacity: .6 })
  fireEvent.change(screen.getByLabelText('Appearance time'), { target: { value: '1000' } })
  expect(screen.getByRole('button', { name: 'Apply appearance' })).toBeDisabled(); expect(write).toHaveBeenCalledTimes(1)
})
it('uses explicit Effect/parameter and target controls for update/duplicate/reorder', async () => {
  const { record, write } = setup()
  fireEvent.change(screen.getByLabelText('Appearance scope'), { target: { value: 'whole-clip' } })
  fireEvent.change(screen.getByLabelText('Selected Effect'), { target: { value: 'hue' } })
  fireEvent.change(screen.getByLabelText('Effect parameter'), { target: { value: 'turns' } })
  fireEvent.change(screen.getByLabelText('Effect value'), { target: { value: '.4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply parameter' })); expect(await screen.findByText('Appearance saved.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate Effect' })); await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  const effects = useShowStore.getState().showV2Pilots[record.id].composition.clips[0].appearance.keys[0].value.effects!
  expect(effects.map(effect => effect.kind === 'hue' ? effect.turns : NaN)).toEqual([.4, .4])
  expect(effects[1].id).not.toBe('hue')
  fireEvent.change(screen.getByLabelText('Effect order target'), { target: { value: effects[1].id } })
  fireEvent.change(screen.getByLabelText('Effect order edge'), { target: { value: 'after' } })
  fireEvent.click(screen.getByRole('button', { name: 'Move Effect' })); await waitFor(() => expect(write).toHaveBeenCalledTimes(3))
  expect(useShowStore.getState().showV2Pilots[record.id].composition.clips[0].appearance.keys[0].value.effects?.map(effect => effect.id)).toEqual([effects[1].id, 'hue'])
})

it('allocates one key and one Effect identity for an interior add and supports color descriptors without clamping', async () => {
  const { record, write } = setup()
  const allocate = vi.spyOn(identity, 'newPersonalContentId').mockReturnValueOnce('new-color').mockReturnValueOnce('new-held')
  fireEvent.change(screen.getByLabelText('Appearance scope'), { target: { value: 'selected-time' } })
  fireEvent.change(screen.getByLabelText('Appearance time'), { target: { value: '200' } })
  fireEvent.change(screen.getByLabelText('New Effect kind'), { target: { value: 'effect:output:color-map' } })
  expect(allocate).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Add Effect' })); expect(await screen.findByText('Appearance saved.')).toBeInTheDocument()
  expect(allocate).toHaveBeenCalledTimes(2)
  const key = useShowStore.getState().showV2Pilots[record.id].composition.clips[0].appearance.keys[1]
  expect(key.id).toBe('new-held'); expect(key.value.effects?.[1]).toMatchObject({ id: 'new-color', kind: 'color-map' })
  fireEvent.change(screen.getByLabelText('Selected Effect'), { target: { value: 'new-color' } })
  fireEvent.change(screen.getByLabelText('Effect parameter'), { target: { value: 'shadowColor' } })
  fireEvent.change(screen.getByLabelText('Effect value'), { target: { value: '#224466' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply parameter' })); await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  expect(allocate).toHaveBeenCalledTimes(2)
  expect(useShowStore.getState().showV2Pilots[record.id].composition.clips[0].appearance.keys[1].value.effects?.[1]).toMatchObject({ shadowR: 34 / 255, shadowG: 68 / 255, shadowB: 102 / 255 })
})

it('keeps numeric string drafts, reset and same-value submission free of silent normalization or writes', async () => {
  const { record, write } = setup()
  fireEvent.change(screen.getByLabelText('Appearance scope'), { target: { value: 'whole-clip' } })
  fireEvent.change(screen.getByLabelText('Clip opacity'), { target: { value: '-' } })
  expect(screen.getByLabelText('Clip opacity')).toHaveValue('-')
  fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' })); expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' }))
  expect(await screen.findByText('Appearance is unchanged.')).toBeInTheDocument(); expect(write).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Clip opacity'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' }))
  expect(await screen.findByText('Supply finite supported appearance fields.')).toBeInTheDocument()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record); expect(write).not.toHaveBeenCalled()
})


it('never submits an untouched lossy color display; explicit color draft changes the intended held scope once',async()=>{
 const {record,clip,write}=setup(false,'uniform')
 fireEvent.change(screen.getByLabelText('Appearance scope'),{target:{value:'whole-clip'}})
 fireEvent.change(screen.getByLabelText('Selected Effect'),{target:{value:'map'}})
 fireEvent.change(screen.getByLabelText('Effect parameter'),{target:{value:'shadowColor'}})
 expect(screen.getByLabelText('Effect value')).toHaveValue('#1a334d')
 expect(screen.getByRole('button',{name:'Apply parameter'})).toBeDisabled()
 fireEvent.submit(screen.getByRole('button',{name:'Apply parameter'}).closest('form')!)
 await new Promise(resolve=>setTimeout(resolve,0))
 expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
 expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
 fireEvent.change(screen.getByLabelText('Effect value'),{target:{value:'#224466'}})
 fireEvent.click(screen.getByRole('button',{name:'Apply parameter'}));await waitFor(()=>expect(write).toHaveBeenCalledTimes(1))
 const current=useShowStore.getState().showV2Pilots[record.id]
 expect(current.composition.clips[0].appearance.keys[0].value.effects?.[0]).toMatchObject({shadowR:34/255,shadowG:68/255,shadowB:102/255,highlightR:.4,highlightG:.5,highlightB:.6})
 expect(clip.appearance.keys[0].value.effects?.[0]).toHaveProperty('shadowR',.1)
 expect(screen.getByRole('button',{name:'Apply parameter'})).toBeDisabled()
})
it.each(['scope','parameter','Effect'] as const)('clears explicit color dirty state when changing %s',partition=>{
 setup(false,'uniform');fireEvent.change(screen.getByLabelText('Appearance scope'),{target:{value:'whole-clip'}});fireEvent.change(screen.getByLabelText('Selected Effect'),{target:{value:'map'}});fireEvent.change(screen.getByLabelText('Effect parameter'),{target:{value:'shadowColor'}})
 fireEvent.change(screen.getByLabelText('Effect value'),{target:{value:'#224466'}})
 if(partition==='scope'){fireEvent.change(screen.getByLabelText('Appearance scope'),{target:{value:'selected-time'}});fireEvent.change(screen.getByLabelText('Appearance time'),{target:{value:'200'}})}
 if(partition==='parameter')fireEvent.change(screen.getByLabelText('Effect parameter'),{target:{value:'highlightColor'}})
 if(partition==='Effect'){fireEvent.change(screen.getByLabelText('Selected Effect'),{target:{value:''}});fireEvent.change(screen.getByLabelText('Selected Effect'),{target:{value:'map'}});fireEvent.change(screen.getByLabelText('Effect parameter'),{target:{value:'shadowColor'}})}
 expect(screen.getByRole('button',{name:'Apply parameter'})).toBeDisabled()
})

it('keeps rounded-to-the-same-hex mixed RGB channels exact without any submission',()=>{
 const {record,clip,write}=setup(true,'mixed'),before=structuredClone(record)
 fireEvent.change(screen.getByLabelText('Appearance scope'),{target:{value:'whole-clip'}});fireEvent.change(screen.getByLabelText('Selected Effect'),{target:{value:'map'}});fireEvent.change(screen.getByLabelText('Effect parameter'),{target:{value:'shadowColor'}})
 expect(screen.getByLabelText('Effect value')).toHaveAttribute('placeholder','Mixed')
 expect(screen.getByRole('button',{name:'Apply parameter'})).toBeDisabled()
 fireEvent.submit(screen.getByRole('button',{name:'Apply parameter'}).closest('form')!)
 expect(write).not.toHaveBeenCalled();expect(record).toEqual(before);expect(clip.appearance.keys.map(key=>(key.value.effects?.[0] as {shadowR:number}).shadowR)).toEqual([.1,.101])
 expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it('applies dirty Transform/Aperture/Presentation/Blink fields in one patch and clears one component explicitly', async () => {
  const { record, write } = setup()
  fireEvent.change(screen.getByLabelText('Appearance scope'), { target: { value: 'whole-clip' } })
  for (const [label, value] of [['Transform position X', '.1'], ['Transform scale Y', '1.2'], ['Aperture width', '.8'],
    ['Aperture feather', '.2'], ['Blink rate', '2'], ['Blink duty', '.5'], ['Blink phase', '.1']] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.change(screen.getByLabelText('Aperture enabled'), { target: { value: 'true' } })
  fireEvent.change(screen.getByLabelText('Aperture shape'), { target: { value: 'ring' } })
  fireEvent.change(screen.getByLabelText('Presentation mode'), { target: { value: 'freeze' } })
  expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' }))
  expect(await screen.findByText('Appearance saved.')).toBeInTheDocument()
  const value = useShowStore.getState().showV2Pilots[record.id].composition.clips[0].appearance.keys[0].value
  expect(value.transform).toEqual({ positionX: .1, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1.2 })
  expect(value.aperture).toEqual({ enabled: true, x: 0, y: 0, width: .8, height: 1, aperture: 'ring', feather: .2 })
  expect(value.presentation).toEqual({ mode: 'freeze' })
  expect(value.blink).toEqual({ rateHz: 2, duty: .5, phase: .1 })
  fireEvent.change(screen.getByLabelText('Appearance component to clear'), { target: { value: 'aperture.feather' } })
  fireEvent.click(screen.getByRole('button', { name: 'Clear component' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  const cleared = useShowStore.getState().showV2Pilots[record.id].composition.clips[0].appearance.keys[0].value
  expect(cleared.aperture).toEqual({ enabled: true, x: 0, y: 0, width: .8, height: 1, aperture: 'ring' })
  expect(cleared.transform).toEqual(value.transform)
  expect(screen.getByLabelText('Appearance component to clear')).toHaveValue('')
})

it('shows absent optional components as empty drafts and never invents a closed component member', async () => {
  const { record, write } = setup(true)
  fireEvent.change(screen.getByLabelText('Appearance scope'), { target: { value: 'whole-clip' } })
  expect(screen.getByLabelText('Transform position X')).toHaveValue('')
  expect(screen.getByLabelText('Presentation mode')).toHaveValue('')
  expect(screen.getByLabelText('Aperture polygon sides')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('Blink duty'), { target: { value: '.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' }))
  expect(await screen.findByText('Supply finite supported appearance fields.')).toBeInTheDocument()
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(screen.getByRole('button', { name: 'Clear component' })).toBeDisabled()
})

it('removes the selected Effect with its Clip-owned animation and leaves other Effects authored', async () => {
  const { record, write } = setup(false, undefined, true)
  fireEvent.change(screen.getByLabelText('Appearance scope'), { target: { value: 'whole-clip' } })
  fireEvent.change(screen.getByLabelText('Selected Effect'), { target: { value: 'hue' } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove Effect' }))
  expect(await screen.findByText('Appearance saved.')).toBeInTheDocument(); expect(write).toHaveBeenCalledTimes(1)
  const current = useShowStore.getState().showV2Pilots[record.id]
  expect(current.composition.clips[0].appearance.keys[0].value.effects).toEqual([{ id: 'bright', kind: 'brightness', brightness: .8 }])
  expect(current.composition.propertyTracks).toEqual([])
  expect(screen.getByLabelText('Selected Effect')).toHaveValue('')
})
