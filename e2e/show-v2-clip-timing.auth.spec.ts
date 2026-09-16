import {expect,test} from './fixtures/authenticated'
import {exerciseShowV2ClipTiming} from './fixtures/showV2ClipTiming'
test('ordinary v2 timing workspace applies each owner once with shared held choreography, history and native reopen',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});const{route,timeline,stage,readWrites}=await exerciseShowV2ClipTiming(page)
 await page.waitForFunction(()=>Boolean(window.__pxlblzShow));await stage.getByRole('button',{name:'Pause Show preview'}).click()
 for(const mode of ['Fast','Precise']as const){if(mode==='Precise'){await stage.getByRole('button',{name:'Renderer',exact:true}).click();await page.getByRole('option',{name:mode,exact:true}).click()}expect((await page.evaluate(prefix=>window.__pxlblzShow!.captureSequence({frames:2,fps:8,startMs:23000,prefix}),`clip-timing-${mode}`)).failures).toEqual([])}
 for(const width of [1024,390]){await page.setViewportSize({width,height:844});await page.keyboard.press('Escape');await page.keyboard.press('Escape');if(width===390)await expect(page.getByTestId('studio-entity-drawer').first()).toBeHidden();const selected=timeline.getByRole('button',{pressed:true});await selected.scrollIntoViewIfNeeded();await selected.focus();await selected.press('Enter');expect(readWrites()).toBe(9);expect(await route.evaluate(root=>[...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}).map(element=>element.getAttribute('aria-label')||element.textContent))).toEqual([])}
})
