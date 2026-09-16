import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'
export const clipReplaceRecord:ShowRecordV2=JSON.parse(readFileSync(new URL('./showV2ClipReplace.json',import.meta.url),'utf8'))
export const clipReplacePatterns=[
 {id:'replacement-voice',name:'Replacement Voice',src:'export var elapsed=0;export var gain=.4;var lost=.2;export function sliderGain(v){gain=v}export function sliderLost(v){lost=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(gain,.1+.6*x,.1+.6*y)}',controls:{},updatedAt:1},
 {id:'replacement-other',name:'Replacement Other',src:'export var elapsed=0;export var gain=.9;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(.1+.6*x,.1+.6*y,gain)}',controls:{},updatedAt:1},
 {id:'replacement-bad',name:'Replacement Bad',src:'invalid source !!!',controls:{},updatedAt:1},
]
export async function exerciseShowV2ClipReplace(page:Page){
 const legacy=convertibleV1Show();legacy.id=clipReplaceRecord.id;legacy.name=clipReplaceRecord.name
 for(const pattern of clipReplacePatterns){const response=await page.request.post('/api/patterns',{data:pattern});expect(response.ok(),await response.text()).toBe(true)}
 const seededLegacy=await page.request.post('/api/shows',{data:legacy});expect(seededLegacy.ok(),await seededLegacy.text()).toBe(true)
 const seeded=await page.request.put(`/api/shows/${legacy.id}?show-version=2`,{data:clipReplaceRecord});expect(seeded.ok(),await seeded.text()).toBe(true)
 let writes=0,settled=0;const matches=(url:string)=>url.includes(`/api/shows/${legacy.id}?show-version=2`)
 page.on('request',request=>{if(request.method()==='PUT'&&matches(request.url()))writes++});page.on('response',response=>{if(response.request().method()==='PUT'&&matches(response.url())&&response.ok())settled++})
 await page.goto(`studio/shows/${legacy.id}?show-v2-pilot=1&capture`)
 const route=page.getByTestId('show-v2-route-pilot'),stage=page.getByTestId('show-stage-preview'),panel=route.getByRole('region',{name:'Replace Pattern',exact:true}),replace=panel.getByRole('button',{name:'Replace Pattern',exact:true})
 await expect(stage).toBeVisible();await expect(panel).toBeVisible();await expect(replace).toBeDisabled()
 const readSaved=async():Promise<ShowRecordV2>=>{const response=await page.request.get('/api/shows?show-version=2');expect(response.ok()).toBe(true);return(await response.json()).shows.find((row:ShowRecordV2)=>row.id===legacy.id)}
 const choose=async(name:string)=>{const input=panel.getByRole('combobox',{name:'Replacement Pattern'});await input.click();await input.fill(name);await page.getByRole('option',{name,exact:true}).click()}
 const runWrite=async(button:Locator,count:number,predicate:(record:ShowRecordV2)=>boolean,status:string)=>{const responsePromise=page.waitForResponse(response=>response.request().method()==='PUT'&&matches(response.url()));await button.click();const response=await responsePromise;expect(response.ok(),await response.text()).toBe(true);await expect.poll(()=>writes).toBe(count);await expect.poll(()=>settled).toBe(count);await expect.poll(async()=>predicate(await readSaved())).toBe(true);await expect(route.getByText(status,{exact:true})).toBeVisible()}
 await choose('Replacement Voice');await replace.click();await expect(route.getByText('Pattern is unchanged.',{exact:true})).toBeVisible();expect(writes).toBe(0);expect(await readSaved()).toEqual(clipReplaceRecord)
 await choose('Replacement Bad');await replace.click();await expect(route).toContainText('The selected Pattern cannot be resolved:');expect(writes).toBe(0)
 await choose('Replacement Other');await runWrite(replace,1,record=>record.composition.patternInstances.find(instance=>instance.id===record.composition.clips[0].instanceId)?.pattern.id==='replacement-other','Pattern replacement saved.')
 const changed=await readSaved(),newId=changed.composition.clips[0].instanceId;expect(newId).not.toBe('instance');expect(changed.composition.clips[0]).toEqual({...clipReplaceRecord.composition.clips[0],instanceId:newId});expect(changed.composition.clips[1]).toEqual(clipReplaceRecord.composition.clips[1]);expect(changed.composition.patternInstances[0]).toEqual(clipReplaceRecord.composition.patternInstances[0]);expect(changed.composition.groupDefinitions).toEqual(clipReplaceRecord.composition.groupDefinitions);expect(changed.composition.groupOccurrences).toEqual(clipReplaceRecord.composition.groupOccurrences);expect(changed.composition.propertyTracks.slice(0,3)).toEqual(clipReplaceRecord.composition.propertyTracks)
 expect(changed.composition.patternInstances.find(instance=>instance.id===newId)?.controlTargets).toEqual({sliderGain:.4});expect(changed.composition.propertyTracks.filter(track=>'instanceId'in track.target&&track.target.instanceId===newId)).toEqual([expect.objectContaining({target:{kind:'instance-control',instanceId:newId,exportName:'sliderGain'},activeStartMs:0,activeDurationMs:30000,keyframes:[expect.objectContaining({timeMs:0,value:.4,easing:{curve:'sine',direction:'in-out'}}),expect.objectContaining({timeMs:30000,value:.8,easing:{curve:'linear'}})]})])
 await runWrite(route.getByRole('button',{name:'Undo',exact:true}),2,record=>record.composition.clips[0].instanceId==='instance','Undo saved.')
 await runWrite(route.getByRole('button',{name:'Redo',exact:true}),3,record=>record.composition.clips[0].instanceId===newId,'Redo saved.')
 await choose('Replacement Other');await replace.click();await expect(route.getByText('Pattern is unchanged.',{exact:true})).toBeVisible();expect(writes).toBe(3)
 await choose('LumaStripes');await runWrite(replace,4,record=>record.composition.patternInstances.find(instance=>instance.id===newId)?.pattern.kind==='stock','Pattern replacement saved.')
 const stock=await readSaved();expect(stock.composition.clips[0].instanceId).toBe(newId);expect(stock.composition.patternInstances[0]).toEqual(clipReplaceRecord.composition.patternInstances[0]);expect(stock.composition.propertyTracks).toEqual(clipReplaceRecord.composition.propertyTracks)
 await runWrite(route.getByRole('button',{name:'Undo',exact:true}),5,record=>record.composition.patternInstances.find(instance=>instance.id===newId)?.pattern.id==='replacement-other','Undo saved.')
 await route.getByRole('button',{name:'Reload saved v2',exact:true}).click();await expect(route).toContainText('Reloaded v2 bytes from the provider.');await page.reload();await expect(stage).toBeVisible()
 expect((await readSaved()).composition).toEqual(changed.composition);await route.getByRole('button',{name:'Reopen artifacts',exact:true}).click();await expect(route).toContainText('Reopened .pxlshow v2 and .epe');expect(writes).toBe(5)
 return{route,stage,panel,saved:await readSaved(),readWrites:()=>writes}
}
