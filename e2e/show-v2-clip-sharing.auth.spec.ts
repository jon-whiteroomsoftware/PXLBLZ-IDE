import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2ClipSharing } from './fixtures/showV2ClipSharing'
test('ordinary linked duplicate, independence and explicit Rejoin preserve held Group users and durable history',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 await page.setViewportSize({width:1440,height:1000});const {route,stage,editor,readWrites}=await exerciseShowV2ClipSharing(page)
 await page.waitForFunction(()=>Boolean(window.__pxlblzShow));await stage.getByRole('button',{name:'Pause Show preview',exact:true}).click()
 for(const mode of ['Fast','Precise'] as const){if(mode==='Precise'){await stage.getByRole('button',{name:'Renderer',exact:true}).click();await page.getByRole('option',{name:mode,exact:true}).click()}expect((await page.evaluate(prefix=>window.__pxlblzShow!.captureSequence({frames:2,fps:8,startMs:23000,prefix}),`sharing-${mode}`)).failures).toEqual([])}
 await editor.getByLabel('Duplicate Zone').selectOption('zone')
 for(const width of [1024,390]){await page.setViewportSize({width,height:844});const zone=editor.getByLabel('Duplicate Zone');await zone.scrollIntoViewIfNeeded();await zone.focus();await zone.press('Tab');await expect(editor.getByLabel('Duplicate Layer')).toBeFocused();expect(await route.evaluate(root=>[...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}).map(element=>element.getAttribute('aria-label')||element.textContent))).toEqual([])}
 expect(readWrites()).toBe(5);expect(errors).toEqual([])
})
