import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root='/Users/voidstar/src/worktrees/pixelblaze-v2-issue-989-agent-docs';
const require=createRequire(`${root}/package.json`);const {chromium,expect}=require('@playwright/test');
const base=process.argv[2];if(!base)throw Error('Managed candidate base URL required');
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const errors=[],facts={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),base};page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`${base}/PXLBLZ-IDE/docs/feature-guide`);const heading=page.getByRole('heading',{name:'Agent editing',exact:true});await heading.scrollIntoViewIfNeeded();await expect(heading).toBeVisible();await expect(page.getByText('Forget this agent',{exact:false}).first()).toBeVisible();
 facts.featureGuide={url:page.url(),heading:await heading.innerText(),privacyHref:await page.getByRole('link',{name:'Privacy',exact:true}).last().getAttribute('href')};
 await page.screenshot({path:'/tmp/issue989-feature-guide.png'});
 await page.getByRole('link',{name:'Privacy',exact:true}).last().focus();await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'PXLBLZ Privacy',exact:true})).toBeVisible();await page.getByRole('heading',{name:'Agent editing',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/issue989-privacy-agent.png'});
 await page.getByRole('heading',{name:'Service providers',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByText('Zero Data Retention',{exact:false})).toBeVisible();facts.privacy={url:page.url(),providerHref:await page.getByRole('link',{name:"OpenAI's API data controls",exact:true}).getAttribute('href')};expect(facts.privacy.providerHref).toBe('https://developers.openai.com/api/docs/guides/your-data');await page.screenshot({path:'/tmp/issue989-privacy-provider.png'});
 await page.setViewportSize({width:720,height:900});await page.getByRole('heading',{name:'Service providers',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/issue989-privacy-narrow.png'});facts.narrow={width:720,horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};expect(facts.narrow.horizontalOverflow).toBe(false);expect(errors).toEqual([]);facts.pageRuntimeErrors=errors;console.log('PASS rendered Agent guide→Privacy navigation, provider link, narrow overflow and no page runtime errors');
}finally{writeFileSync('/tmp/issue989-docs-proof.json',JSON.stringify(facts,null,2));await browser.close()}
