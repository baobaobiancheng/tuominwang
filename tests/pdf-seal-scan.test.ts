import {beforeEach,expect,test,vi} from 'vitest';

const detector=vi.hoisted(()=>({calls:0,warnOn:0}));
vi.mock('../packages/adapters/storage.ts',()=>({readOriginal:async()=>Buffer.from('page'),hash:()=> 'preview'}));
vi.mock('../packages/adapters/document-source.ts',()=>({verifiedDocumentSource:async()=>Buffer.from('source')}));
vi.mock('../packages/adapters/page-rotation-state.ts',()=>({readPageRotationState:()=>({rotations:{}})}));
vi.mock('../packages/core/visual-pdf.ts',()=>({detectPdfImageSeals:async()=>[]}));
vi.mock('../packages/core/visual-detection.ts',()=>({
 canonicalVisualResult:(value:unknown)=>value,
 suppressOverlaps:(value:unknown)=>value,
 detectVisual:async()=>{
  detector.calls++;
  return {candidates:[],warnings:detector.calls===detector.warnOn?['VISUAL_OUTPUT_INVALID']:[]};
 },
}));

import {scanVisualCandidates} from '../packages/adapters/visual-scan.ts';

const pages=[0,1,2].map(index=>({index,previewId:'preview',previewHash:'preview'})) as any;
const document={source_format:'pdf'};
const profile={enabledEntityTypeIds:['seal']};

beforeEach(()=>{detector.calls=0;detector.warnOn=0;});

test('recoverable seal warning preserves completed page and defers later seals',async()=>{
 detector.warnOn=2;
 const emitted:number[]=[];
 const result=await scanVisualCandidates(document,'',pages,profile,{onSealPage:page=>{emitted.push(page.index+1);}});
 expect(detector.calls).toBe(2);
 expect(emitted).toEqual([1]);
 expect(result.sealProgress).toMatchObject({status:'deferred',completedPageNumbers:[1],sealWarning:'VISUAL_OUTPUT_INVALID'});
 expect(result.visualPages.map(page=>page.detectors)).toEqual([['seal'],[],[]]);
});

test('completed-page event failure is fatal rather than a detector warning',async()=>{
 await expect(scanVisualCandidates(document,'',pages.slice(0,1),profile,{onSealPage:()=>{throw Error('EVENT_WRITE_FAILED');}})).rejects.toThrow('EVENT_WRITE_FAILED');
});
