import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { convertibleV1Show } from '../../src/test/showV2TracerFixture'
export const propertyManagementRecord=JSON.parse(readFileSync(new URL('./showV2PropertyManagement.json',import.meta.url),'utf8'))
export const propertyManagementPattern={id:'property-voice',name:'Property Voice',src:'export var elapsed=0;var level=.4;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,.1+.6*x,.1+.6*y)}',controls:{},updatedAt:1}
export const propertyManagementMap={id:'property-management-map',name:'Property Grid',dim:2,generator:'custom',params:{},points:Array.from({length:256},(_,i)=>[(i%16)/15,Math.floor(i/16)/15]),normalizeMode:'contain',updatedAt:1}
export async function exerciseShowV2PropertyManagement(page:Page){
 const legacy=convertibleV1Show();legacy.id=propertyManagementRecord.id;legacy.name=propertyManagementRecord.name
 for(const [resource,value] of [['patterns',propertyManagementPattern],['maps',propertyManagementMap],['shows',legacy]] as const){const response=await page.request.post(`/api/${resource}`,{data:value});expect(response.ok(),await response.text()).toBe(true)}
 const seeded=await page.request.put(`/api/shows/${legacy.id}?show-version=2`,{data:propertyManagementRecord});expect(seeded.ok(),await seeded.text()).toBe(true)
 let writes=0;page.on('request',request=>{if(request.method()==='PUT'&&request.url().includes(`/api/shows/${legacy.id}?show-version=2`))writes++})
 await page.goto(`studio/shows/${legacy.id}?show-v2-pilot=1&capture`)
 const route=page.getByTestId('show-v2-route-pilot'),stage=page.getByTestId('show-stage-preview'),editor=route.getByRole('region',{name:'Properties',exact:true})
 await expect(stage).toBeVisible();await expect(editor.getByLabel('Property owner')).toHaveValue('');await expect(editor.getByLabel('Property track')).toBeDisabled()
 const readSaved=async()=>{const response=await page.request.get('/api/shows?show-version=2');expect(response.ok()).toBe(true);const record=(await response.json()).shows.find(record=>record.id===legacy.id);expect(record).toBeDefined();return record}
 const waitWrites=async(count:number)=>expect.poll(()=>writes).toBe(count)
 await editor.getByLabel('Property owner').selectOption('show');await editor.getByRole('button',{name:'New track',exact:true}).click()
 const target={kind:'clip-view',clipId:'clip',property:'brightness'}
 await editor.getByLabel('Property target').selectOption(JSON.stringify(target));await editor.getByLabel('Property activation start').fill('0');await editor.getByLabel('Property activation duration').fill('10000')
 for(const [index,time,value] of [[1,'0','.25'],[2,'10000','.75']] as const){await editor.getByLabel(`New key ${index} time`).fill(time);await editor.getByLabel(`New key ${index} value`).fill(value);await editor.getByLabel(`New key ${index} curve`).selectOption(index===1?'quadratic':'linear')}
 await editor.getByLabel('New key 1 direction').selectOption('in');await editor.getByRole('button',{name:'Create track',exact:true}).click();await expect(route).toContainText('Property saved.');await waitWrites(1)
 let saved=await readSaved();const initialIds=new Set(propertyManagementRecord.composition.propertyTracks.map(track=>track.id));let track=saved.composition.propertyTracks.find(track=>!initialIds.has(track.id));expect(track).toBeDefined();const trackId=track.id
 await editor.getByRole('button',{name:'Add key',exact:true}).click();await editor.getByLabel('Property key time').fill('4000');await editor.getByLabel('Property key value').fill('.5');await editor.getByLabel('Key curve').selectOption('hold');await editor.getByLabel('Key Switch point').fill('.5');await editor.getByRole('button',{name:'Create key',exact:true}).click();await waitWrites(2);await expect(editor.getByRole('button',{name:'Add key',exact:true})).toBeEnabled()
 saved=await readSaved();track=saved.composition.propertyTracks.find(track=>track.id===trackId);const middle=track.keyframes.find(key=>key.timeMs===4000)
 await editor.getByLabel('Property key').selectOption(middle.id);await editor.getByLabel('Property key time').fill('4500');await editor.getByLabel('Property key value').fill('.6');await editor.getByLabel('Key curve').selectOption('cubic-bezier')
 for(const [name,value] of [['Control 1 X','.2'],['Control 1 Y','.3'],['Control 2 X','.8'],['Control 2 Y','.7']] as const)await editor.getByLabel(`Key ${name}`).fill(value)
 await editor.getByRole('button',{name:'Apply key',exact:true}).click();await waitWrites(3);await expect(editor.getByRole('button',{name:'Apply track',exact:true})).toBeEnabled()
 await editor.getByLabel('Property target').selectOption(JSON.stringify({kind:'clip-opacity',clipId:'clip'}));await editor.getByLabel('Property activation duration').fill('11000');await editor.getByRole('button',{name:'Apply track',exact:true}).click();await waitWrites(4);await expect(editor.getByRole('button',{name:'Apply track',exact:true})).toBeEnabled()
 await editor.getByLabel('Property key').selectOption(middle.id);await editor.getByRole('button',{name:'Remove key',exact:true}).click();await waitWrites(5);await expect(editor.getByRole('button',{name:'Remove track',exact:true})).toBeEnabled()
 await editor.getByRole('button',{name:'Remove track',exact:true}).click();await waitWrites(6);await expect(editor.getByLabel('Property track')).toHaveValue('')
 saved=await readSaved();expect(saved.composition.propertyTracks).toEqual(propertyManagementRecord.composition.propertyTracks)
 await editor.getByLabel('Property owner').selectOption('group:held-voice');await editor.getByRole('button',{name:'New track',exact:true}).click();await expect(editor).toContainText('2 linked occurrences')
 await editor.getByLabel('Property target').selectOption(JSON.stringify({kind:'clip-view',clipId:'child',property:'brightness'}));await editor.getByLabel('Property activation start').fill('0');await editor.getByLabel('Property activation duration').fill('4000')
 for(const [index,time,value] of [[1,'0','.3'],[2,'4000','.8']] as const){await editor.getByLabel(`New key ${index} time`).fill(time);await editor.getByLabel(`New key ${index} value`).fill(value);await editor.getByLabel(`New key ${index} curve`).selectOption(index===1?'quadratic':'linear')}
 await editor.getByLabel('New key 1 direction').selectOption('in');await editor.getByRole('button',{name:'Create track',exact:true}).click();await waitWrites(7);await expect(editor.getByRole('button',{name:'Apply track',exact:true})).toBeEnabled()
 saved=await readSaved();const local=saved.composition.groupDefinitions[0].propertyTracks[0];expect(local.keyframes.map(key=>[key.timeMs,key.value])).toEqual([[0,.3],[4000,.8]])
 expect(saved.composition.patternInstances).toEqual(propertyManagementRecord.composition.patternInstances);expect(saved.composition.groupOccurrences).toEqual(propertyManagementRecord.composition.groupOccurrences);expect(saved.composition.propertyTracks).toEqual(propertyManagementRecord.composition.propertyTracks)
 await route.getByRole('button',{name:'Undo v2 edit'}).click();await waitWrites(8);await route.getByRole('button',{name:'Redo v2 edit'}).click();await waitWrites(9)
 await route.getByRole('button',{name:'Reload saved v2'}).click();await expect(route).toContainText('Reloaded saved v2 Show.')
 await page.reload();await expect(stage).toBeVisible();await editor.getByLabel('Property owner').selectOption('group:held-voice');await editor.getByLabel('Property track').selectOption(local.id);await editor.getByLabel('Property key').selectOption(local.keyframes[0].id);await expect(editor.getByLabel('Property key value')).toHaveValue('0.3');expect(writes).toBe(9)
 return {route,editor,stage,saved:await readSaved(),readWrites:()=>writes}
}
