import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2LayoutOccurrences } from './fixtures/showV2LayoutOccurrences'
test('Layout occurrence select/unique/move/remove and exact Show End preserve held sharing through history and reopen',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 await page.setViewportSize({width:1440,height:1000})
 const result=await exerciseShowV2LayoutOccurrences(page,async({route,editor,stage})=>{
  await page.waitForFunction(()=>Boolean(window.__pxlblzShow));await stage.getByRole('button',{name:'Pause Show preview',exact:true}).click()
  for(const mode of ['Fast','Precise'] as const){if(mode==='Precise'){await stage.getByRole('button',{name:'Renderer',exact:true}).click();await page.getByRole('option',{name:mode,exact:true}).click()}expect((await page.evaluate(prefix=>window.__pxlblzShow!.captureSequence({frames:2,fps:8,startMs:5500,prefix}),`layout-${mode}`)).failures).toEqual([])}
  for(const width of [1024,390]){await page.setViewportSize({width,height:844});await editor.getByLabel('Layout occurrence',{exact:true}).scrollIntoViewIfNeeded();await editor.getByLabel('Layout occurrence',{exact:true}).focus();await page.keyboard.press('Tab');await expect(editor.getByLabel('Layout definition',{exact:true})).toBeFocused();expect(await route.evaluate(root=>[...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}).map(element=>element.getAttribute('aria-label')||element.textContent))).toEqual([])}
 })
 expect(result.writes).toBe(11);expect(errors).toEqual([])
})
