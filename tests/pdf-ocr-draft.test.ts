import {test} from 'vitest';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mergePdfOcrDraft,mergePdfOcrDraftPageReview,replacePdfOcrDraftAtReview,validatePdfOcrDraftPage,type PdfOcrDraftPage} from '../packages/core/pdf-ocr-draft.ts';
import {signatureGroupId} from '../packages/core/review-groups.ts';
import {processingEventSchema} from '../packages/core/processing-events.ts';
import {validPdfOcrCheckpointFrame,type PdfOcrCheckpoint} from '../packages/adapters/pdf-ocr-checkpoints.ts';
import type {Anchor,Mark,ParsedPage} from '../packages/contracts/index.ts';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const text='张三\n李四';
const pages=[{index:0,previewHash:sha('preview-a'),mapHash:sha('map-a')},{index:1,previewHash:sha('preview-b'),mapHash:sha('map-b')}] as ParsedPage[];
const anchors=[{kind:'page',page:0,start:0,end:2},{kind:'page',page:1,start:3,end:5}] as Anchor[];
const machine=[{start:0,end:2,kind:'姓名',decision:'pending',sources:[{layer:'ner',code:'person'}]},{start:3,end:5,kind:'姓名',decision:'pending',sources:[{layer:'rules',code:'field'}]}] as Mark[];
const draft:PdfOcrDraftPage={pageIndex:0,textHash:sha('张三'),previewHash:pages[0].previewHash,mapHash:pages[0].mapHash,marks:[{start:0,end:2,kind:'姓名',decision:'redact'}],removed:[]};

test('human page edit wins exact machine candidate and keeps other page candidates',()=>{
 const result=mergePdfOcrDraft(text,anchors,pages,machine,[draft]);
 assert.equal(result[0].decision,'redact');assert.equal(result[0].userAdded,true);assert.ok(result[0].sources?.some(s=>s.layer==='manual'));
 assert.equal(result[1].decision,'pending');
});
test('deletion tombstone survives new machine candidate without approving review',()=>{
 const result=mergePdfOcrDraft(text,anchors,pages,machine,[{...draft,marks:[],removed:[{start:0,end:2,kind:'姓名'}]}]);
 assert.equal(result[0].decision,'ignore');assert.ok(result[0].sources?.some(s=>s.code==='pdf-ocr-draft-remove'));
 assert.equal(result[1].decision,'pending');
});
test('a removed provisional candidate stays as a human ignore tombstone when final machine emits none',()=>{
 const result=mergePdfOcrDraft(text,anchors,pages,[],[{...draft,marks:[],removed:[{start:0,end:2,kind:'姓名'}]}]);
 assert.deepEqual(result.map(m=>[m.start,m.end,m.kind,m.decision]),[[0,2,'姓名','ignore']]);
 assert.equal(result[0].userAdded,true);
 assert.ok(result[0].sources?.some(s=>s.layer==='manual'&&s.code==='pdf-ocr-draft-remove'));
});
test('human retype keeps the new mark while ignoring the replaced machine kind',()=>{
 const result=mergePdfOcrDraft(text,anchors,pages,machine,[{...draft,marks:[{start:0,end:2,kind:'机构',decision:'redact'}],removed:[{start:0,end:2,kind:'姓名'}]}]);
 assert.equal(result.find(m=>m.kind==='姓名'&&m.start===0)?.decision,'ignore');
 assert.equal(result.find(m=>m.kind==='机构'&&m.start===0)?.decision,'redact');
 assert.equal(result.find(m=>m.kind==='机构'&&m.start===0)?.userAdded,true);
});
test('page/source map drift and same-page overlap reject instead of silently applying edits',()=>{
 assert.throws(()=>mergePdfOcrDraft(text,anchors,pages,machine,[{...draft,textHash:sha('other')}]),/PDF_OCR_DRAFT_INVALID/);
 assert.throws(()=>mergePdfOcrDraft(text,anchors,pages,machine,[{...draft,mapHash:sha('other')}]),/PDF_OCR_DRAFT_PAGE_CHANGED/);
 assert.throws(()=>mergePdfOcrDraft(text,anchors,pages,machine,[{...draft,marks:[...draft.marks,{start:0,end:2,kind:'机构',decision:'redact'}]}]),/OVERLAPPING_MARKS/);
});
test('fragmented signature names accept one complete human decision, but reject a partial change',()=>{
 const content='张\n三',members=[{start:0,end:1,kind:'姓名' as const},{start:2,end:3,kind:'姓名' as const}],groupId=signatureGroupId(members);
 const grouped:Mark[]=members.map((m,index)=>({...m,decision:'pending',sources:[{layer:'rules',code:'signature'}],signatureGroup:{id:groupId,memberIndex:index,memberCount:2}}));
 const page={index:0,previewHash:sha('signature-preview'),mapHash:sha('signature-map')} as ParsedPage;
 const base:PdfOcrDraftPage={pageIndex:0,textHash:sha(content),previewHash:page.previewHash,mapHash:page.mapHash,marks:[],removed:[...members]};
 const resolved=mergePdfOcrDraft(content,[{kind:'page',page:0,start:0,end:3} as Anchor],[page],grouped,[base]);
 assert.deepEqual(resolved.map(m=>m.decision),['ignore','ignore']);
 assert.ok(resolved.every(m=>m.signatureGroup?.id===groupId));
 assert.throws(()=>mergePdfOcrDraft(content,[{kind:'page',page:0,start:0,end:3} as Anchor],[page],grouped,[{...base,removed:[members[0]]}]),/SIGNATURE_GROUP_INVALID/);
});
test('provisional page matches are explicitly local and cannot claim final recognition',()=>{
 const event={type:'page-processed',stage:'ocr',pageNumber:1,totalPages:1,ocrCompleted:true,ocrCachePage:{text:'张三',width:100,height:100,previewHash:sha('preview'),mapHash:sha('map'),glyphs:[[0,2,0,0,20,20]]},matches:[{start:0,end:2,kind:'姓名',decision:'pending',sources:[{layer:'rules',code:'name'}]}],provisional:true,coordinateSpace:'canonical-raster'};
 assert.equal(processingEventSchema.safeParse(event).success,true);
 assert.equal(processingEventSchema.safeParse({...event,matches:[{...event.matches[0],end:3}]}).success,false);
 assert.equal(processingEventSchema.safeParse({...event,stage:'recognize'}).success,false);
});
test('checkpoint preview candidates must fit the exact page text',()=>{
 const frame:PdfOcrCheckpoint={processingHash:sha('source'),rotationPlanHash:sha('rotation'),parserFingerprint:sha('parser'),page:{index:0,width:100,height:100,rotation:0,confidence:90,nativeTextLength:0,textSource:'ocr',previewId:'11111111-1111-4111-8111-111111111111',previewHash:sha('preview'),mapId:'22222222-2222-4222-8222-222222222222',mapHash:sha('map')},text:'张三',glyphs:[[0,2,0,0,20,20]],totalPages:1,provisionalMatches:[{start:0,end:2,kind:'姓名',decision:'pending',sources:[{layer:'rules',code:'name'}]}]};
 assert.equal(validPdfOcrCheckpointFrame(frame,0),true);
 assert.equal(validPdfOcrCheckpointFrame({...frame,provisionalMatches:[{...frame.provisionalMatches![0],end:3}]},0),false);
 assert.equal(validPdfOcrCheckpointFrame({...frame,provisionalMatches:[{...frame.provisionalMatches![0],decision:'redact'}]},0),false);
});
test('running page region and deletion persist as unapproved page review with exact page bounds',()=>{
 const frames=[{...pages[0],width:100,height:80},{...pages[1],width:100,height:80}];
 const region={id:'11111111-1111-4111-8111-111111111111',x:5,y:7,width:30,height:20,shape:'circle' as const,reason:'印章' as const};
 const drawn={...draft,regions:[region],pageDeleted:false};
 validatePdfOcrDraftPage(drawn,'张三',frames[0]);
 const policy=mergePdfOcrDraftPageReview(frames as ParsedPage[],{mode:'unselected',regions:[],deletedPages:[]},[drawn,{...draft,pageIndex:1,marks:[],regions:[],pageDeleted:true}]);
 assert.deepEqual(policy,{mode:'unselected',regions:[{...region,page:0}],deletedPages:[1]});
 assert.throws(()=>validatePdfOcrDraftPage({...drawn,regions:[{...region,x:85}]},'张三',frames[0]),/PDF_OCR_DRAFT_INVALID/);
 assert.throws(()=>validatePdfOcrDraftPage({...drawn,regions:[region,region]},'张三',frames[0]),/PDF_OCR_DRAFT_INVALID/);
 assert.throws(()=>mergePdfOcrDraftPageReview(frames as ParsedPage[],null,[{...drawn,pageDeleted:true},{...drawn,pageIndex:1,regions:[],pageDeleted:true}]),/INVALID_PAGE_REVIEW/);
});
test('a new rotation revision can explicitly undo a carried page deletion',()=>{
 const frames=[{...pages[0],width:100,height:80},{...pages[1],width:100,height:80}] as ParsedPage[];
 const carried={mode:'unselected' as const,regions:[],deletedPages:[0]};
 const decision={...draft,regions:[],pageDeleted:false};
 assert.deepEqual(mergePdfOcrDraftPageReview(frames,carried,[decision])?.deletedPages,[]);
 assert.deepEqual(mergePdfOcrDraftPageReview(frames,carried,[{...decision,pageDeleted:true}])?.deletedPages,[0]);
});
test('late page edit replaces its saved draft effect without approving other machine marks',()=>{
 const frames=[{...pages[0],width:100,height:80},{...pages[1],width:100,height:80}] as ParsedPage[];
 const oldRegion={id:'11111111-1111-4111-8111-111111111111',x:5,y:5,width:20,height:20,reason:'敏感区域' as const};
 const old={...draft,regions:[oldRegion],pageDeleted:false};
 const saved=mergePdfOcrDraft(text,anchors,frames,machine,[old]);
 const next={...old,marks:[{start:0,end:2,kind:'姓名' as const,decision:'ignore' as const}],regions:[{...oldRegion,x:35}]};
 const changed=replacePdfOcrDraftAtReview(text,anchors,frames,saved,{mode:'unselected',regions:[{...oldRegion,page:0}],deletedPages:[]},old,next);
 assert.equal(changed.marks.find(m=>m.start===0)?.decision,'ignore');
 assert.equal(changed.marks.find(m=>m.start===3)?.decision,'pending');
 assert.deepEqual(changed.pageReview?.regions,[{...oldRegion,x:35,page:0}]);
});
