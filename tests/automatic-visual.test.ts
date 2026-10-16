import {test} from 'vitest';
import {strict as assert} from 'node:assert';
import {automaticVisualPageReview} from '../packages/core/automatic-visual.ts';
test('visual scan coverage, selected regions and rejected incomplete frames',()=>{
const page={index:0,width:100,height:80,previewHash:'a'.repeat(64)};
const base={mode:'unselected',regions:[],deletedPages:[],maskStyle:'black'};
const visual={complete:true,pages:[{page:0,detectors:['face','seal','signature'],warnings:[]}]};
const candidates=[
  {page:0,x:10,y:12,width:16,height:18,reason:'人脸',score:.61,detector:'face-v1'},
  {page:0,x:40,y:20,width:20,height:20,reason:'印章',score:.65,detector:'seal-v1'},
  {page:0,x:30,y:55,width:25,height:12,reason:'签名',score:.51,detector:'signature-v1'},
];
const decision=automaticVisualPageReview([page] as any,candidates as any,visual,['face','seal','signature'],base as any)!;
assert.equal(decision.mode,'raster');assert.equal(decision.regions.length,3);
assert.equal(automaticVisualPageReview([page] as any,candidates as any,
  {...visual,pages:[{page:0,detectors:['signature','face','seal'],warnings:[]}]},
  ['face','seal','signature'],base as any)!.regions.length,3);
assert.deepEqual(decision.regions.map(r=>r.reason),['人脸','印章','签名']);
assert.deepEqual(decision.regions.map(r=>(r.meta as any).automaticVisual.previewHash),Array(3).fill('a'.repeat(64)));
for(const [changedVisual,changedCandidates,enabled] of [
  [{...visual,complete:false},candidates,['face','seal','signature']],
  [{...visual,pages:[{page:0,detectors:['face','face','signature'],warnings:[]}]},candidates,['face','seal','signature']],
  [visual,candidates,['face','face','signature']],
  [visual,[{...candidates[0],x:99}],['face','seal','signature']],
  [visual,candidates,['face']],
  [undefined,candidates,[]],
] as const)assert.throws(()=>automaticVisualPageReview([page] as any,changedCandidates as any,changedVisual as any,enabled,base as any));


});
