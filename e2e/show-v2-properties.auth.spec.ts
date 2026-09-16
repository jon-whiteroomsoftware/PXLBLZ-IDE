import { expect, test } from './fixtures/authenticated'
import { exerciseShowV2PropertyManagement } from './fixtures/showV2PropertyManagement'
test('native Show/Group Property six operations preserve explicit scope, authored curves and durable history', async ({ page }) => {
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
  await page.setViewportSize({width:1440,height:1000})
  const {route,editor,stage,readWrites}=await exerciseShowV2PropertyManagement(page)
  await page.waitForFunction(()=>Boolean(window.__pxlblzShow));await stage.getByRole('button',{name:'Pause Show preview'}).click()
  for(const mode of ['Fast','Precise'] as const){
    if(mode==='Precise'){await stage.getByRole('button',{name:'Renderer',exact:true}).click();await page.getByRole('option',{name:mode,exact:true}).click()}
    expect((await page.evaluate(prefix=>window.__pxlblzShow!.captureSequence({frames:2,fps:8,startMs:23000,prefix}),`properties-${mode}`)).failures).toEqual([])
  }
  for(const width of [1024,390]){
    await page.setViewportSize({width,height:844});await page.keyboard.press('Escape');await page.keyboard.press('Escape')
    const owner=editor.getByLabel('Property owner');await owner.scrollIntoViewIfNeeded();await owner.focus();await owner.press('Tab');await expect(editor.getByLabel('Property track')).toBeFocused()
    expect(await route.evaluate(root=>[...root.querySelectorAll<HTMLElement>('input,select,button')].filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}).map(element=>element.getAttribute('aria-label')||element.textContent))).toEqual([])
    expect(readWrites()).toBe(9)
  }
  expect(errors).toEqual([])
})
