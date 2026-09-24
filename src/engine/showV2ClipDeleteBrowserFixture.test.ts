import { expect, it } from 'vitest'
import record from '../../e2e/fixtures/showV2ClipDelete.json'
import { parseProvisionalShowRecordV2 } from './showCompositionV2'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { createShowClipV2 } from './showClipCreationV2'
const dependencies={patterns:[{id:'deletion-voice',name:'Deletion Voice',src:'export var elapsed=0;var level=.4;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,.1+.6*x,.1+.6*y)}',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null}
it('qualifies all actual thirty-second browser states before capture: linked deletion, final empty collecting its instance, first-runtime re-add',()=>{
 const opened=parseProvisionalShowRecordV2(JSON.stringify(record));if(opened.status!=='opened')throw Error(JSON.stringify(opened));let current=opened.record
 const captured=()=>captureShowStageEditV2(current,dependencies);expect(captured().prepared.status).toBe('ready')
 const initial=current.composition.clips[0];const first=editShowTransitionV2(current,{kind:'delete-clip',clipId:'linked'});expect(first.status).toBe('changed');current=first.record;expect(captured().prepared.status).toBe('ready')
 const last=editShowTransitionV2(current,{kind:'delete-clip',clipId:initial.id});expect(last.status).toBe('changed');current=last.record;expect(captured().prepared.status).toBe('empty');expect(current.composition.propertyTracks).toEqual([]);expect(current.composition.patternInstances).toEqual([])
 const fresh={id:'fresh-instance',pattern:{kind:'user' as const,id:'deletion-voice'},patternName:'Deletion Voice',time:{timeScale:1,timeOffsetMs:0},controlTargets:{}}
 const added=createShowClipV2(current,{kind:'create-clip',patternReference:{kind:'user',id:'deletion-voice'},runtime:{kind:'first',instance:fresh},clip:{id:'fresh',zoneId:initial.zoneId,layerId:initial.layerId,startMs:0,durationMs:30000,zoneSampleMode:'span',entryPolicy:'continue',appearance:{keys:[{id:'fresh-key',timeMs:0,value:{opacity:1,view:{mirror:false,phase:0,brightness:1},effects:[]}}]}}});expect(added.status).toBe('changed');current=added.record;expect(captured().prepared.status).toBe('ready');expect(current.composition.patternInstances).toEqual([fresh])
})
