import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2ClipDelete } from './fixtures/showV2ClipDelete'
test('ordinary Clip deletion preserves linked users/history and final empty re-add reuses dormant runtime',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 await page.setViewportSize({width:1440,height:1000});const {route,stage,readWrites}=await exerciseShowV2ClipDelete(page)
 await page.waitForFunction(()=>Boolean(window.__pxlblzShow));await stage.getByRole('button',{name:'Pause Show preview',exact:true}).click()
 for(const mode of ['Fast','Precise'] as const){if(mode==='Precise'){await stage.getByRole('button',{name:'Renderer',exact:true}).click();await page.getByRole('option',{name:mode,exact:true}).click()}expect((await page.evaluate(prefix=>window.__pxlblzShow!.captureSequence({frames:2,fps:8,startMs:23000,prefix}),`delete-${mode}`)).failures).toEqual([])}
 for(const width of [1024,390]){await page.setViewportSize({width,height:844});const button=route.getByRole('button',{name:'Delete Clip',exact:true});await button.scrollIntoViewIfNeeded();await button.focus();await expect(button).toBeFocused();expect(await route.evaluate(root=>[...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}).map(element=>element.getAttribute('aria-label')||element.textContent))).toEqual([])}
 expect(readWrites()).toBe(5);expect(errors).toEqual([])
})
