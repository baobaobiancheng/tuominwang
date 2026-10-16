import {test} from 'vitest';
import assert from 'node:assert/strict';
import {effectiveDeletedPages} from '../apps/api/pdf-ocr-draft.ts';
import type {PdfOcrDraftPage} from '../packages/core/pdf-ocr-draft.ts';

const page=(pageIndex:number,pageDeleted:boolean)=>({pageIndex,pageDeleted,marks:[],removed:[],regions:[],textHash:'',previewHash:'',mapHash:''}) as PdfOcrDraftPage;

test('rotation carry, explicit saved false, and pending override resolve the same deleted-page set',()=>{
 const carry=new Set([0,1]);
 assert.deepEqual([...effectiveDeletedPages(carry,[])],[0,1]);
 assert.deepEqual([...effectiveDeletedPages(carry,[page(0,false)])],[1]);
 assert.deepEqual([...effectiveDeletedPages(carry,[page(0,false)],page(2,true))],[1,2]);
 assert.deepEqual([...effectiveDeletedPages(carry,[page(0,false)],page(1,false))],[]);
 assert.equal(effectiveDeletedPages(new Set([0,1]),[],page(2,true)).size,3,'PUT must reject deleting the last retained page of a three-page PDF');
});
