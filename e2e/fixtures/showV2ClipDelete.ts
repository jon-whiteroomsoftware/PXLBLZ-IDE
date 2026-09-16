import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'
export const clipDeleteRecord:ShowRecordV2=JSON.parse(readFileSync(new URL('./showV2ClipDelete.json',import.meta.url),'utf8'))
export const clipDeletePattern={id:'deletion-voice',name:'Deletion Voice',src:'export var elapsed=0;var level=.4;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,.1+.6*x,.1+.6*y)}',controls:{},updatedAt:1}
export async function exerciseShowV2ClipDelete(page:Page){
 const legacy=convertibleV1Show();legacy.id=clipDeleteRecord.id;legacy.name=clipDeleteRecord.name
 for(const [resource,data] of [['patterns',clipDeletePattern],['shows',legacy]] as const){const response=await page.request.post(`/api/${resource}`,{data});expect(response.ok(),await response.text()).toBe(true)}
 const seeded=await page.request.put(`/api/shows/${legacy.id}?show-version=2`,{data:clipDeleteRecord});expect(seeded.ok(),await seeded.text()).toBe(true)
 let writes=0,settled=0;const matches=(url:string)=>url.includes(`/api/shows/${legacy.id}?show-version=2`)
 page.on('request',request=>{if(request.method()==='PUT'&&matches(request.url()))writes++});page.on('response',response=>{if(response.request().method()==='PUT'&&matches(response.url())&&response.ok())settled++})
 await page.goto(`studio/shows/${legacy.id}?show-v2-pilot=1&capture`)
 const route=page.getByTestId('show-v2-route-pilot'),stage=page.getByTestId('show-stage-preview'),timing=route.getByTestId('show-v2-clip-timing')
 await expect(stage).toBeVisible();await expect(route.getByRole('button',{name:'Delete Clip',exact:true})).toBeEnabled()
 const readSaved=async():Promise<ShowRecordV2>=>{const response=await page.request.get('/api/shows?show-version=2');expect(response.ok()).toBe(true);return(await response.json()).shows.find((row:ShowRecordV2)=>row.id===legacy.id)}
 const runWrite=async(button:Locator,count:number,postcondition:(record:ShowRecordV2)=>boolean,status:string)=>{
  const responsePromise=page.waitForResponse(response=>response.request().method()==='PUT'&&matches(response.url()))
  await button.click();const response=await responsePromise;expect(response.ok(),await response.text()).toBe(true)
  await expect.poll(()=>writes).toBe(count);await expect.poll(()=>settled).toBe(count);await expect.poll(async()=>postcondition(await readSaved())).toBe(true);await expect(route.getByText(status,{exact:true})).toBeVisible()
 }
 // Explicitly select the later linked bar; deleting it must leave the first user's authored interval and animation.
 await route.getByTestId('show-v2-timeline').getByRole('button',{name:/10000–20000 ms$/}).click()
 await runWrite(route.getByRole('button',{name:'Delete Clip',exact:true}),1,record=>record.composition.clips.length===1&&record.composition.clips[0].id===clipDeleteRecord.composition.clips[0].id,'Clip deleted.')
 const deleted=await readSaved();expect(deleted.composition.clips).toEqual([clipDeleteRecord.composition.clips[0]]);expect(deleted.composition.propertyTracks).toEqual(clipDeleteRecord.composition.propertyTracks);expect(deleted.composition.patternInstances).toEqual(clipDeleteRecord.composition.patternInstances)
 await runWrite(route.getByRole('button',{name:'Undo',exact:true}),2,record=>record.composition.clips.length===2,'Undo saved.')
 await runWrite(route.getByRole('button',{name:'Redo',exact:true}),3,record=>record.composition.clips.length===1,'Redo saved.')
 await route.getByRole('button',{name:'Reload saved v2',exact:true}).click();await expect(route).toContainText('Reloaded v2 bytes from the provider.');await page.reload();await expect(stage).toBeVisible()
 await runWrite(route.getByRole('button',{name:'Delete Clip',exact:true}),4,record=>record.composition.clips.length===0&&record.composition.propertyTracks.length===0,'Clip deleted.')
 await expect(route.getByRole('button',{name:'Delete Clip',exact:true})).toHaveCount(0);await expect(route.getByRole('button',{name:'Reopen artifacts',exact:true})).toBeDisabled();await expect(route.getByText('Add content to preview or export this Show.',{exact:true})).toBeVisible();await expect(stage).toHaveCount(0)
 const empty=await readSaved();expect(empty.composition.patternInstances).toEqual(clipDeleteRecord.composition.patternInstances);expect(empty.composition.showEndMs).toBe(30000)
 // This capture records the explicit empty capability before content is re-added.
 await timing.getByRole('button',{name:'Add Clip',exact:true}).click();await timing.getByRole('combobox',{name:'Clip Pattern'}).click();await page.getByRole('option',{name:'Deletion Voice',exact:true}).click();await expect(timing.getByLabel('Clip runtime')).toHaveValue('runtime:instance')
 await timing.getByRole('textbox',{name:'New Clip start',exact:true}).fill('0');await timing.getByRole('textbox',{name:'New Clip start',exact:true}).press('Enter')
 await timing.getByRole('textbox',{name:'New Clip duration',exact:true}).fill('30000');await timing.getByRole('textbox',{name:'New Clip duration',exact:true}).press('Enter')
 await runWrite(timing.getByRole('button',{name:'Add',exact:true}),5,record=>record.composition.clips.length===1&&record.composition.clips[0].durationMs===30000&&record.composition.clips[0].instanceId==='instance','Clip saved.')
 const added=await readSaved();expect(added.composition.patternInstances).toEqual(clipDeleteRecord.composition.patternInstances);expect(added.composition.propertyTracks).toEqual([]);expect(added.composition.transitions).toEqual([]);expect(added.composition.clips[0].appearance.keys).toEqual([expect.objectContaining({timeMs:0,value:{opacity:1,view:{mirror:false,phase:0,brightness:1},effects:[]}})])
 expect(added.composition.clips[0].id).not.toBe(clipDeleteRecord.composition.clips[0].id);expect(added.composition.clips[0].appearance.keys[0].id).not.toBe(clipDeleteRecord.composition.clips[0].appearance.keys[0].id)
 await expect(stage).toBeVisible();await route.getByRole('button',{name:'Reload saved v2',exact:true}).click();await expect(route).toContainText('Reloaded v2 bytes from the provider.');await page.reload();await expect(stage).toBeVisible()
 await route.getByRole('button',{name:'Reopen artifacts',exact:true}).click();await expect(route).toContainText('Reopened .pxlshow v2 and .epe');expect(writes).toBe(5)
 return {route,stage,timing,empty,saved:added,readWrites:()=>writes}
}
