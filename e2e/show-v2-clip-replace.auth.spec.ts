import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2ClipReplace } from './fixtures/showV2ClipReplace'
test('ordinary replacement forks linked runtime once, resolves captured metadata, preserves Group users and saves native history',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 const {route,stage,panel,readWrites}=await exerciseShowV2ClipReplace(page);await page.waitForFunction(()=>Boolean(window.__pxlblzShow));await stage.getByRole('button',{name:'Pause Show preview',exact:true}).click()
 for(const mode of ['Fast','Precise']){if(mode==='Precise'){await stage.getByRole('button',{name:'Renderer',exact:true}).click();await page.getByRole('option',{name:mode,exact:true}).click()}expect((await page.evaluate(prefix=>window.__pxlblzShow!.captureSequence({frames:2,fps:8,startMs:5000,prefix}),`replace-${mode}`)).failures).toEqual([])}
 for(const width of [1024,390]){await page.setViewportSize({width,height:844});const input=panel.getByRole('combobox',{name:'Replacement Pattern'});await input.scrollIntoViewIfNeeded();await input.focus();await expect(input).toBeFocused();await input.press('Escape');expect(await route.evaluate(root=>[...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}).map(element=>element.getAttribute('aria-label')||element.textContent))).toEqual([])}
 expect(readWrites()).toBe(5);expect(errors).toEqual([])
})
