import {test} from 'vitest';
import assert from 'node:assert/strict';
import {foldPdfOcrCandidatePulse,visiblePdfOcrCandidates,type CandidateStream} from '../apps/web/pdf-ocr-candidates.ts';

test('per-page rule hints, streaming NER, and final marks use the same page offset without reviving old hints',()=>{
 const pages=[{pageIndex:0,text:'张三',machineCandidates:[{start:0,end:2,kind:'姓名' as const}]},{pageIndex:1,text:'13800138000',machineCandidates:[]}];
 let stream:CandidateStream=new Map();
 stream=foldPdfOcrCandidatePulse(stream,{pageNumber:2,stage:'recognize',matches:[{start:3,end:14,kind:'手机号'}]});
 assert.deepEqual(visiblePdfOcrCandidates(pages,1,stream).matches,[{start:0,end:11,kind:'手机号'}]);
 stream=foldPdfOcrCandidatePulse(stream,{pageNumber:2,stage:'recognize',matches:[{start:3,end:14,kind:'手机号'}]});
 assert.equal(visiblePdfOcrCandidates(pages,1,stream).matches.length,1);
 stream=foldPdfOcrCandidatePulse(stream,{pageNumber:1,stage:'recognize',canonicalHash:'final',matches:[]});
 assert.deepEqual(visiblePdfOcrCandidates(pages,0,stream),{matches:[],final:true});
 const unchanged=foldPdfOcrCandidatePulse(stream,{pageNumber:1,stage:'recognize',matches:[{start:0,end:2,kind:'姓名'}]});
 assert.strictEqual(unchanged,stream);
});
