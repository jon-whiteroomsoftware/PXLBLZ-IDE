import { expect, it } from 'vitest'
import record from '../../e2e/fixtures/showV2ClipSharing.json'
import { parseProvisionalShowRecordV2 } from './showCompositionV2'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { createShowV2IndependentIntent, createShowV2LinkedDuplicateIntent, createShowV2RejoinIntent } from './showV2ClipSharingEditorModel'
import { editShowClipV2 } from './showClipsV2'
const dependencies={patterns:[{id:'sharing-voice',name:'Sharing Voice',src:'export var elapsed=0;var level=.4;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,.1+.6*x,.1+.6*y)}',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null}
it('qualifies the actual thirty-second browser preimage and full sharing sequence including held Group-qualified tracks',()=>{
 const opened=parseProvisionalShowRecordV2(JSON.stringify(record));if(opened.status!=='opened')throw Error(JSON.stringify(opened));let current=opened.record
 let n=0;const captured=()=>{const c=captureShowStageEditV2(current,dependencies);expect(c.prepared.status).toBe('ready');return c}
 const clip=current.composition.clips[0],linked=createShowV2LinkedDuplicateIntent(captured(),'voice',{zoneId:clip.zoneId,layerId:clip.layerId,startMs:'10000'},()=>`fixture-${++n}`);if(linked.status!=='ready')throw Error('duplicate')
 const duplicate=editShowClipV2(current,linked.intent);expect(duplicate.status).toBe('changed');current=duplicate.record
 const independent=createShowV2IndependentIntent(captured(),'voice',()=>`fixture-${++n}`);if(independent.status!=='ready'||independent.intent.kind!=='make-independent')throw Error('independence')
 expect(Object.keys(independent.intent.independence.identitiesBySourceTrackId)).toEqual(['clock','held-use:held-gain','late-held-use:held-gain'])
 const made=editShowClipV2(current,independent.intent);expect(made.status).toBe('changed');current=made.record
 const rejoin=createShowV2RejoinIntent(captured(),'voice','instance');if(rejoin.status!=='ready')throw Error('Rejoin')
 const joined=editShowClipV2(current,rejoin.intent);expect(joined.status).toBe('changed');current=joined.record;captured()
 expect(current.composition.groupOccurrences).toEqual(opened.record.composition.groupOccurrences);expect(current.composition.groupDefinitions).toEqual(opened.record.composition.groupDefinitions)
})
