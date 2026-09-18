import { readFileSync } from 'node:fs'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'

/**
 * The Clip-replacement record and its Patterns. Every browser spec that drove
 * them belonged to the rejected v2 route and was retired with it (#1065);
 * these stay as the pinned inputs `showV2ClipReplacementModel.test.ts`
 * qualifies every replacement state against.
 */
export const clipReplaceRecord: ShowRecordV2 = JSON.parse(
  readFileSync(new URL('./showV2ClipReplace.json', import.meta.url), 'utf8'),
)

export const clipReplacePatterns = [
  { id: 'replacement-voice', name: 'Replacement Voice', src: 'export var elapsed=0;export var gain=.4;var lost=.2;export function sliderGain(v){gain=v}export function sliderLost(v){lost=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(gain,.1+.6*x,.1+.6*y)}', controls: {}, updatedAt: 1 },
  { id: 'replacement-other', name: 'Replacement Other', src: 'export var elapsed=0;export var gain=.9;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(.1+.6*x,.1+.6*y,gain)}', controls: {}, updatedAt: 1 },
  { id: 'replacement-bad', name: 'Replacement Bad', src: 'invalid source !!!', controls: {}, updatedAt: 1 },
]
