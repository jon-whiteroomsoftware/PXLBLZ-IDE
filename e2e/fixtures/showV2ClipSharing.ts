import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'
// Extends the landed Property fixture's authored held Group/stock-plane shape.
export const clipSharingRecord:ShowRecordV2=JSON.parse(readFileSync(new URL('./showV2ClipSharing.json',import.meta.url),'utf8'))
export const clipSharingPattern={id:'sharing-voice',name:'Sharing Voice',src:'export var elapsed=0;var level=.4;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,.1+.6*x,.1+.6*y)}',controls:{},updatedAt:1}
export async function exerciseShowV2ClipSharing(page:Page){
 const legacy=convertibleV1Show();legacy.id=clipSharingRecord.id;legacy.name=clipSharingRecord.name
 for(const [resource,data] of [['patterns',clipSharingPattern],['shows',legacy]] as const){const response=await page.request.post(`/api/${resource}`,{data});expect(response.ok(),await response.text()).toBe(true)}
 const seeded=await page.request.put(`/api/shows/${legacy.id}?show-version=2`,{data:clipSharingRecord});expect(seeded.ok(),await seeded.text()).toBe(true)
 let writes=0,settled=0;const matches=(url:string)=>url.includes(`/api/shows/${legacy.id}?show-version=2`)
 page.on('request',request=>{if(request.method()==='PUT'&&matches(request.url()))writes++});page.on('response',response=>{if(response.request().method()==='PUT'&&matches(response.url())&&response.ok())settled++})
 await page.goto(`studio/shows/${legacy.id}?show-v2-pilot=1&capture`)
 const route=page.getByTestId('show-v2-route-pilot'),stage=page.getByTestId('show-stage-preview'),editor=route.getByRole('region',{name:'Pattern sharing',exact:true})
 await expect(stage).toBeVisible();await expect(editor.getByLabel('Duplicate Zone')).toHaveValue('');await expect(editor.getByLabel('Rejoin instance')).toHaveValue('');await expect(editor).toContainText('Instance instance · 3 Clip uses')
 const readSaved=async():Promise<ShowRecordV2>=>{const response=await page.request.get('/api/shows?show-version=2');expect(response.ok()).toBe(true);const record=(await response.json()).shows.find((record:ShowRecordV2)=>record.id===legacy.id);expect(record).toBeDefined();return record}
 const runWrite=async(button:Locator,count:number,postcondition:(record:ShowRecordV2)=>boolean,status='Clip sharing saved.')=>{
  const responsePromise=page.waitForResponse(response=>response.request().method()==='PUT'&&matches(response.url()))
  await button.click();const response=await responsePromise;expect(response.ok(),await response.text()).toBe(true)
  await expect.poll(()=>writes).toBe(count);await expect.poll(()=>settled).toBe(count);await expect.poll(async()=>postcondition(await readSaved())).toBe(true);await expect(route.getByText(status,{exact:true})).toBeVisible()
 }
 const original=clipSharingRecord.composition.clips[0]
 await editor.getByLabel('Duplicate Zone').selectOption(original.zoneId);await editor.getByLabel('Duplicate Layer').selectOption(original.layerId);await editor.getByLabel('Duplicate start').fill('10000')
 await runWrite(editor.getByRole('button',{name:'Duplicate linked Clip',exact:true}),1,record=>record.composition.clips.length===2&&record.composition.clips[1].instanceId==='instance'&&record.composition.clips[1].startMs===10000)
 const linked=await readSaved(),copy=linked.composition.clips[1];expect(copy.durationMs).toBe(10000);expect(copy.entryPolicy).toBe(original.entryPolicy);expect(copy.appearance.keys.map(key=>[key.timeMs,key.value])).toEqual(original.appearance.keys.map(key=>[key.timeMs+10000,key.value]));expect(linked.composition.patternInstances).toEqual(clipSharingRecord.composition.patternInstances)
 const copiedTrack=linked.composition.propertyTracks.find(track=>'clipId'in track.target&&track.target.clipId===copy.id)!;expect(copiedTrack.activeStartMs).toBe(10000);expect(copiedTrack.keyframes.map(key=>key.timeMs)).toEqual([10000,20000])
 await runWrite(editor.getByRole('button',{name:'Make Pattern Independent',exact:true}),2,record=>record.composition.clips[0].instanceId!=='instance'&&record.composition.patternInstances.length===2)
 const independent=await readSaved(),instanceId=independent.composition.clips[0].instanceId;expect(independent.composition.clips[1].instanceId).toBe('instance');expect(independent.composition.patternInstances.find(instance=>instance.id===instanceId)).toEqual({...clipSharingRecord.composition.patternInstances[0],id:instanceId})
 expect(independent.composition.propertyTracks.filter(track=>'instanceId'in track.target&&track.target.instanceId===instanceId)).toHaveLength(3)
 for(const record of [linked,independent]){expect(record.composition.groupDefinitions).toEqual(clipSharingRecord.composition.groupDefinitions);expect(record.composition.groupOccurrences).toEqual(clipSharingRecord.composition.groupOccurrences)}
 await editor.getByLabel('Rejoin instance').selectOption('instance');await runWrite(editor.getByRole('button',{name:'Rejoin Pattern',exact:true}),3,record=>record.composition.clips[0].instanceId==='instance'&&record.composition.patternInstances.length===1)
 await editor.getByLabel('Rejoin instance').selectOption('instance');await editor.getByRole('button',{name:'Rejoin Pattern',exact:true}).click();await expect(route).toContainText('Clip sharing is unchanged.');expect(writes).toBe(3)
 await editor.getByLabel('Duplicate Zone').selectOption(original.zoneId);await editor.getByLabel('Duplicate Layer').selectOption(original.layerId);await editor.getByLabel('Duplicate start').fill('.5');await editor.getByRole('button',{name:'Duplicate linked Clip',exact:true}).click();await expect(route).toContainText('Choose a destination Zone, Layer and integer start within Show End.');expect(writes).toBe(3)
 await runWrite(route.getByRole('button',{name:'Undo',exact:true}),4,record=>record.composition.clips[0].instanceId===instanceId,'Undo saved.');await runWrite(route.getByRole('button',{name:'Redo',exact:true}),5,record=>record.composition.clips[0].instanceId==='instance'&&record.composition.patternInstances.length===1,'Redo saved.')
 const saved=await readSaved();expect(saved.composition.patternInstances).toEqual(clipSharingRecord.composition.patternInstances);expect(saved.composition.groupDefinitions).toEqual(clipSharingRecord.composition.groupDefinitions);expect(saved.composition.groupOccurrences).toEqual(clipSharingRecord.composition.groupOccurrences);expect(saved.composition.propertyTracks).toEqual(linked.composition.propertyTracks)
 await route.getByRole('button',{name:'Reload saved v2',exact:true}).click();await expect(route).toContainText('Reloaded v2 bytes from the provider.');await page.reload();await expect(stage).toBeVisible();await expect(editor).toContainText('Instance instance · 4 Clip uses')
 await route.getByRole('button',{name:'Reopen artifacts',exact:true}).click();await expect(route).toContainText('Reopened .pxlshow v2 and .epe');expect(writes).toBe(5)
 return {route,stage,editor,saved,readWrites:()=>writes}
}
