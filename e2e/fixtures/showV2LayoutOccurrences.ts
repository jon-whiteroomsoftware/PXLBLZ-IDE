import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
export const layoutOccurrenceFixture = JSON.parse(readFileSync(new URL('./showV2LayoutOccurrences.json', import.meta.url), 'utf8'))
/** Native visible owners share the existing checked queue; each save is read back before the next action. */
export async function exerciseShowV2LayoutOccurrences(page: Page, onReady?: (context: {route:ReturnType<Page['getByTestId']>;editor:ReturnType<Page['getByTestId']>;stage:ReturnType<Page['getByTestId']>})=>Promise<void>) {
 const {record,legacy,patterns}=layoutOccurrenceFixture
 for(const[resource,value]of [...patterns.map((pattern:object)=>['patterns',pattern]),['shows',legacy]] as [string,object][]){const response=await page.request.post(`/api/${resource}`,{data:value});expect(response.ok(),await response.text()).toBe(true)}
 const seed=await page.request.put(`/api/shows/${record.id}?show-version=2`,{data:record});expect(seed.ok(),await seed.text()).toBe(true)
 let writes=0,settled=0
 page.on('request',request=>{if(request.method()==='PUT'&&request.url().includes(`/api/shows/${record.id}?show-version=2`))writes++})
 page.on('response',response=>{if(response.request().method()==='PUT'&&response.url().includes(`/api/shows/${record.id}?show-version=2`)&&response.ok())settled++})
 await page.goto(`studio/shows/${record.id}?show-v2-pilot=1&capture`)
 const unpin=page.getByRole('button',{name:'Unpin Shows list',exact:true});if(await unpin.count())await unpin.click()
 const close=page.getByRole('button',{name:'Close Shows list',exact:true});if(await close.count())await close.click()
 const route=page.getByTestId('show-v2-route-pilot'),editor=route.getByRole('region',{name:'Layout occurrences',exact:true}),stage=page.getByTestId('show-stage-preview')
 const persisted=async()=>{const response=await page.request.get('/api/shows?show-version=2');expect(response.ok()).toBe(true);return(await response.json()).shows.find((show:{id:string})=>show.id===record.id)}
 const waitSave=async(count:number)=>{await expect.poll(()=>settled).toBe(count);expect(writes).toBe(count)}
 const setSwitch=async(value:string)=>{const field=editor.getByLabel('Layout switch (ms)',{exact:true});await field.fill(value);await field.press('Enter')}
 await expect(stage).toBeVisible();await editor.getByLabel('Layout occurrence',{exact:true}).selectOption(record.composition.layoutOccurrences[0].id);await expect(editor.getByRole('button',{name:'Move switch',exact:true})).toBeDisabled()
 await editor.getByLabel('Layout occurrence',{exact:true}).selectOption('later-layout');await editor.getByLabel('Unique Layout name',{exact:true}).fill('Second voice')
 await editor.getByRole('button',{name:'Make Layout Unique',exact:true}).click();await waitSave(1)
 let saved=await persisted();const unique=saved.composition.layoutOccurrences[1].layoutId;expect(unique).not.toBe(record.zoneLayouts[0].id);expect(saved.zoneLayouts.find((layout:{id:string})=>layout.id===unique)).toEqual({...record.zoneLayouts[0],id:unique,name:'Second voice'})
 await expect(editor.getByLabel('Layout occurrence',{exact:true})).toHaveValue('later-layout')
 await editor.getByLabel('Layout definition',{exact:true}).selectOption('alternate-layout');await editor.getByRole('button',{name:'Apply Layout',exact:true}).click();await waitSave(2)
 await editor.getByRole('button',{name:'Apply Layout',exact:true}).click();await expect(route).toContainText('Layout is unchanged.');expect(writes).toBe(2)
 await setSwitch('32000');await editor.getByRole('button',{name:'Move switch',exact:true}).click();await expect(route).toContainText('A moved switch must leave both neighboring Layout occurrences nonempty');expect(writes).toBe(2)
 await setSwitch('6000');await editor.getByRole('button',{name:'Move switch',exact:true}).click();await waitSave(3)
 saved=await persisted();expect(saved.composition.layoutOccurrences.map((value:{startMs:number;durationMs:number})=>[value.startMs,value.durationMs])).toEqual([[0,6000],[6000,24000]])
 for(const key of ['clips','groupDefinitions','groupOccurrences','patternInstances','propertyTracks','markers'])expect(saved.composition[key]).toEqual(record.composition[key])
 await editor.getByRole('button',{name:'Remove occurrence',exact:true}).click();await waitSave(4);await expect(editor.getByLabel('Layout occurrence',{exact:true})).toHaveValue('')
 const timing=route.getByTestId('show-v2-clip-timing'),end=timing.getByLabel('Show End',{exact:true})
 await end.fill('28000');await end.press('Enter');await waitSave(5)
 await end.fill('32000');await end.press('Enter');await waitSave(6)
 await route.getByRole('button',{name:'Undo',exact:true}).click();await waitSave(7);expect((await persisted()).composition.showEndMs).toBe(28000)
 await route.getByRole('button',{name:'Redo',exact:true}).click();await waitSave(8);expect((await persisted()).composition.showEndMs).toBe(32000)
 await route.getByRole('button',{name:'Undo',exact:true}).click();await waitSave(9)
 await route.getByRole('button',{name:'Undo',exact:true}).click();await waitSave(10)
 await route.getByRole('button',{name:'Undo',exact:true}).click();await waitSave(11)
 saved=await persisted();expect(saved.composition.layoutOccurrences.map((value:{startMs:number;durationMs:number})=>[value.startMs,value.durationMs])).toEqual([[0,6000],[6000,24000]]);expect(saved.composition.showEndMs).toBe(30000);expect(saved.composition.markers).toEqual(record.composition.markers)
 await editor.getByLabel('Layout occurrence',{exact:true}).selectOption('later-layout')
 await route.getByRole('button',{name:'Reopen artifacts',exact:true}).click();await expect(route).toContainText(/Reopened \.pxlshow v2 and \.epe/)
 if(onReady)await onReady({route,editor,stage})
 await route.getByRole('button',{name:'Reload saved v2',exact:true}).click();await expect(route).toContainText('Reloaded v2 bytes from the provider.');await page.reload();await expect(stage).toBeVisible()
 saved=await persisted();expect(saved.composition.layoutOccurrences[1]).toMatchObject({startMs:6000,durationMs:24000,layoutId:'alternate-layout'});expect(saved.composition.patternInstances).toEqual(record.composition.patternInstances);expect(writes).toBe(11)
 return{route,editor,stage,saved,writes}
}
