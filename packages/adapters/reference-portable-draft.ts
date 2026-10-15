import {currentPortableMappings} from '../core/portable-mappings.ts';
import {verifiedDocumentSource} from './document-source.ts';
import {parseReferenceMarkdown} from "../core/reference-markdown.ts";
import {randomUUID} from 'node:crypto';
import type {Mark,PageReview,Anchor} from '../contracts/index.ts';
import {sourceEntityMark,sameEntity,entitySpanKey} from '../core/entity-identity.ts';
import type{EntityCorrection,EntityCorrectionFrame}from'../core/entity-corrections.ts';
import{hasEntityGeometry}from'../contracts/entity-geometry.ts';
import {mappingMatchesEntity,mappingMatchesValue} from '../core/mappings.ts';
import {mergeCandidates,validateMarks,replacementFor} from '../core/redaction.ts';
import {validateFileMarks} from '../core/files.ts';
import {validatePageReview} from '../core/page-redaction.ts';
import {hash,readOriginal,readArtifact,unseal,seal} from './storage.ts';
/** Foreign reviews never approve a mark. Every recovered entity binds fresh text/anchors;
 * unresolved input is retained verbatim as an explicit review item, never silently omitted. */
export async function restoreReferencePortableDraft(d:any,old:any,expectedSourceHash:string,mappings:any[]){
 const aad=`${d.tenant_id}:${d.project_id}:${d.id}`,source=await readOriginal(d.source_id),text=unseal(d.content,aad);
 if(hash(source)!==d.source_hash||d.source_hash!==expectedSourceHash||hash(text)!==d.content_hash)throw new Error('PORTABLE_DRAFT_SOURCE_MISMATCH');
 await verifiedDocumentSource(d);
 const unresolved:any[]=[],recovered:Mark[]=[],corrections:{entry:EntityCorrection;mark:Mark}[]=[],regionCandidates:PageReview['regions']=[],deletedPageCandidates:number[]=[],pages=d.page_data??[],anchors:Anchor[]=d.anchors??[],wholeSame=old.detection?.documentText===text,markdown=d.source_format==='md'?parseReferenceMarkdown(source,'source.md'):null;
 const maps=new Map<number,any[]>();for(const page of pages){const raw=await readArtifact(page.mapId),preview=await readOriginal(page.previewId);if(hash(raw)!==page.mapHash||hash(preview)!==page.previewHash)throw new Error('SOURCE_MISMATCH');maps.set(page.index,JSON.parse(raw));}
 const validSpan=(start:number,end:number)=>Number.isSafeInteger(start)&&end>start&&start>=0&&end<=text.length&&anchors.some(a=>a.start<=start&&a.end>=end);
 const contextMatches=(start:number,end:number,entity:any)=>{const before=entity.anchor?.contextBefore,after=entity.anchor?.contextAfter;return(typeof before!=='string'||!before.length||text.slice(Math.max(0,start-before.length),start)===before)&&(typeof after!=='string'||!after.length||text.slice(end,end+after.length)===after);};
 const visualEntities:any[]=[],recoveredSlots=new Map<Mark,number>(),usedOldSlots=new Set<number>();
 const baseEntities=Array.isArray(old.review?.entities)&&old.review.entities.length?old.review.entities:old.detection?.entities??[],rawEntities=[...baseEntities,...[...(old.review?.activeBBoxes??[]),...(old.review?.deletedBBoxes??[])].filter((b:any)=>(b.nativeMarkIndex!==undefined||b.ocrTextCorrection||b.meta?.ocrTextCorrection)&&!baseEntities.some((e:any)=>e.id&&e.id===b.id))];
 for(const [index,entity]of rawEntities.entries()){
  if(!Number.isSafeInteger(entity.nativeMarkIndex)&&['face','seal','signature'].includes(entity.type??entity.entityType)&&(entity.bbox||entity.meta?.imageBbox||entity.meta?.bboxOriginal)){visualEntities.push({...entity,...(entity.bbox??entity.meta?.imageBbox??entity.meta?.bboxOriginal),entityType:entity.type??entity.entityType,sourceEntity:true});continue;}
  try{const correction=entity.ocrTextCorrection??entity.meta?.ocrTextCorrection,semantic=entity.text??entity.originalText??entity.original,value=correction?.recognizedText??semantic,type=entity.type??entity.entityType;if(typeof value!=='string'||!value||typeof semantic!=='string'||!semantic||typeof type!=='string'||correction&&(correction.correctedText!==semantic||!['highlight-context-menu','manual-draw'].includes(correction.source)||!Number.isFinite(Date.parse(correction.correctedAt))))throw new Error('PORTABLE_DRAFT_ENTITY_INVALID');const identity=sourceEntityMark(type,semantic),oldStart=entity.anchor?.startOffset??entity.startOffset??entity.sourceStart,oldEnd=entity.anchor?.endOffset??entity.endOffset??entity.sourceEnd;let candidates:{start:number;end:number}[]=[];
   if(wholeSame&&validSpan(oldStart,oldEnd)&&text.slice(oldStart,oldEnd)===value)candidates=[{start:oldStart,end:oldEnd}];
   else{const sourceStart=entity.anchor?.sourceStart??entity.sourceStart,sourceEnd=entity.anchor?.sourceEnd??entity.sourceEnd,mapped=markdown?.sidecar.sourceMap.find(m=>m.exact&&m.sourceStart<=sourceStart&&m.sourceEnd>=sourceEnd&&m.scanEnd-m.scanStart===m.sourceEnd-m.sourceStart);if(mapped){const start=mapped.scanStart+sourceStart-mapped.sourceStart,end=mapped.scanStart+sourceEnd-mapped.sourceStart;if(validSpan(start,end)&&text.slice(start,end)===value)candidates=[{start,end}];}if(!candidates.length){let cursor=0;while(cursor<=text.length-value.length){const start=text.indexOf(value,cursor);if(start<0)break;const end=start+value.length;if(validSpan(start,end))candidates.push({start,end});cursor=start+Math.max(1,value.length);}if(candidates.length>1)candidates=candidates.filter(c=>contextMatches(c.start,c.end,entity));}}
   const pageNumber=entity.anchor?.pageNumber??entity.pageNumber;if(Number.isSafeInteger(pageNumber))candidates=candidates.filter(c=>anchors.some(a=>a.start<=c.start&&a.end>=c.end&&(a.page===pageNumber-1||pages.find((p:any)=>p.index===pageNumber-1)?.part===a.part)));
   if(candidates.length!==1)throw new Error(candidates.length?'PORTABLE_DRAFT_ENTITY_AMBIGUOUS':'PORTABLE_DRAFT_ENTITY_NOT_FOUND');
   const hidden=entity.hiddenByType===true||entity.meta?.hiddenByType===true||entity.meta?.reviewState?.note==='用户取消展示：按类型隐藏',wasUserAdded=typeof entity.meta?.hiddenTypeWasUserAdded==='boolean'?entity.meta.hiddenTypeWasUserAdded:entity.userAdded===true;
   const candidate=candidates[0],fresh=(d.marks??[]).find((m:Mark)=>m.start===candidate.start&&m.end===candidate.end&&sameEntity(m,identity)),mark:Mark={...candidate,...identity,userAdded:hidden?wasUserAdded:entity.userAdded===true,decision:hidden?'ignore':'pending',...hidden?{hiddenByType:true,hiddenTypeWasUserAdded:wasUserAdded}:{},sources:[...(fresh?.sources??[]),{layer:hidden&&!wasUserAdded?'rules':'manual',code:'imported-source-review-requires-review'}]},custom=entity.customReplacement,visual=old.fileKind==='image'||old.fileKind==='pdf',mode=old.exportState?.mode??old.review?.exportMode??(old.review?.exportMaskingMode==='full'?'full_star':old.review?.enablePseudonymization===true?'custom_pseudonym':old.review?.enablePseudonymization===false?'default_star':undefined),action=(old.review?.pseudonymTypeActions??old.effectiveProfileSnapshot?.pseudonymTypeActions??{})[type];
   const matching=(entity.nativeReplacement?.mode==='alias'?mappings:currentPortableMappings(mappings)).filter(m=>(m.scope===undefined||m.scope===d.id)&&mappingMatchesEntity(m,identity)&&mappingMatchesValue(m,semantic)&&(entity.nativeReplacement?.mode!=='alias'||entity.nativeReplacement.token===m.token&&entity.nativeReplacement.version===m.version));
   const assignAlias=()=>{if(matching.length!==1)throw new Error(matching.length?'PORTABLE_DRAFT_MAPPING_AMBIGUOUS':'PORTABLE_DRAFT_MAPPING_MISMATCH');const m=matching[0];mark.replacement={mode:'alias',token:m.token,mappingId:m.id,version:m.version};};
   if(entity.nativeReplacement){if(entity.nativeReplacement.mode==='alias')assignAlias();else mark.replacement=entity.nativeReplacement;}
   else if(mode==='full_star')mark.replacement={mode:'full'};
   else if(typeof custom==='string'&&custom)mark.replacement={mode:'custom',value:custom};
   else if(mode==='selective_pseudonym'&&action==='full_star')mark.replacement={mode:'full'};
   else if(mode==='selective_pseudonym'&&action==='partial_star')mark.replacement={mode:'reference-mask',variant:'default'};
   else if(mode==='selective_pseudonym'&&action==='mask')mark.replacement={mode:visual?'clear':'full'};
   else if(mode?.includes('pseudonym')&&entity.usePseudonym!==false&&old.review?.enablePseudonymization!==false&&(!entity.deleted||hidden))assignAlias();
   else if(entity.usePseudonym===true&&mode===undefined&&old.review?.enablePseudonymization!==false)assignAlias();
   else if(mode==='selective_pseudonym')mark.replacement={mode:visual?'clear':'full'};
   else if(mode==='default_star'||old.review?.enablePseudonymization===false)mark.replacement=visual?{mode:'clear'}:{mode:'reference-mask',variant:'detected'};
   else if(!hidden&&entity.usePseudonym===false&&mode?.includes('pseudonym'))throw new Error('PORTABLE_DRAFT_MODE_REQUIRES_REVIEW');
   // The source raster renderer draws labels only when meta.pseudonym is true.
   // Its review usePseudonym flag selects aliases; it is not the raster draw predicate.
   const nativeRaster=entity.nativeMark?.rasterReplacement??entity.meta?.nativeMark?.rasterReplacement;
   if(typeof nativeRaster==='boolean')mark.rasterReplacement=nativeRaster;
   else if(typeof entity.meta?.pseudonym==='boolean')mark.rasterReplacement=entity.meta.pseudonym;
   else if(mode==='full_star'||mode==='default_star')mark.rasterReplacement=false;
   else if(mode==='selective_pseudonym')mark.rasterReplacement=action!=='mask'&&(action==='full_star'||action==='partial_star'||mark.replacement?.mode==='alias'||mark.replacement?.mode==='custom');
   else if(mark.replacement)mark.rasterReplacement=mark.replacement.mode==='alias'||mark.replacement.mode==='custom';
   if(correction){const anchor=anchors.find(a=>a.start<=candidate.start&&a.end>=candidate.end),page=pages.find((p:any)=>p.index===anchor?.page||p.part&&p.part===anchor?.part);if(!anchor||!page)throw Error('PORTABLE_DRAFT_CORRECTION_GEOMETRY_REQUIRED');const selected=(maps.get(page.index)??[]).filter((g:any)=>g[0]<candidate.end-anchor.start&&g[1]>candidate.start-anchor.start&&g[4]>0&&g[5]>0),boxes=selected.map((g:any)=>({x:g[2],y:g[3],width:g[4],height:g[5]}));if(!boxes.length)throw Error('PORTABLE_DRAFT_CORRECTION_GEOMETRY_REQUIRED');corrections.push({mark,entry:{id:randomUUID(),...candidate,...identity,recognizedText:value,correctedText:semantic,originalType:correction.originalType??type,correctedType:correction.correctedType??type,source:correction.source,correctedAt:correction.correctedAt,actorId:entity.meta?.reviewState?.actorId??'inherited-source',page:page.index,boxes,lineIndex:0,occurrence:0,...page.part?{imagePath:page.part}:{},inherited:true,role:'correction',visual:true}});if(mark.replacement&&mark.replacement.mode!=='alias'&&mark.replacement.mode!=='clear')mark.replacement={mode:'custom',value:replacementFor(semantic,{...mark,start:0,end:semantic.length})};}validateFileMarks(text,[mark],d.source_format,anchors);if(entity.nativeMarkIndex!==undefined){if(!Number.isSafeInteger(entity.nativeMarkIndex)||entity.nativeMarkIndex<0||entity.nativeMarkIndex>=rawEntities.length||usedOldSlots.has(entity.nativeMarkIndex))throw Error('PORTABLE_DRAFT_ENTITY_SLOT_INVALID');usedOldSlots.add(entity.nativeMarkIndex);recoveredSlots.set(mark,entity.nativeMarkIndex);}recovered.push(mark);
  }catch(error){unresolved.push({category:'entity',index,reason:(error as Error).message,source:entity});}
 }
 // Source image review state uses active/deleted BBoxes; text entities already recovered
 // remain distinct from explicit manually drawn visual regions.
 const boxes=[...visualEntities,...(old.review?.activeBBoxes??old.detection?.bboxes??[]).map((b:any)=>({...b,__decision:'redact'})),...(old.review?.deletedBBoxes??[]).map((b:any)=>({...b,__decision:'ignore'}))];
 for(const[index,box]of boxes.entries()){
  if(hasEntityGeometry(box))continue; // Complete authenticated neutral archive is rebound separately.
  if(!box.sourceEntity&&typeof box.text==='string'&&box.text&&rawEntities.some((e:any)=>e.id&&e.id===box.id))continue;
  try{const pageIndex=box.meta?.imagePath?pages.find((p:any)=>p.part===box.meta.imagePath)?.index:(box.pageNumber??1)-1,page=pages.find((p:any)=>p.index===pageIndex),info=(old.detection?.ocrImageInfos??[]).find((p:any)=>(p.pageNumber??1)-1===pageIndex),cache=(old.detection?.ocrCachePages??[]).find((p:any)=>(p.pageNumber??1)-1===pageIndex),width=box.meta?.imageWidth??info?.width??cache?.pageWidth,height=box.meta?.imageHeight??info?.height??cache?.pageHeight;
   if(!page||width!==page.width||height!==page.height)throw new Error('PORTABLE_DRAFT_PAGE_MISMATCH');if(box.__decision==='ignore')throw new Error('PORTABLE_DRAFT_IGNORED_REGION_REQUIRES_REVIEW');
   const type=box.entityType??box.type,reason=type==='face'?'人脸':type==='seal'?'印章':type==='signature'?'签名':'敏感区域',region:any={id:randomUUID(),page:pageIndex,x:box.x,y:box.y,width:box.width,height:box.height,shape:box.shape??'rect',reason,...typeof type==='string'?{entityType:type}:{},...typeof box.text==='string'?{text:box.text}:{},meta:{...(box.meta??{}),portableSource:{id:box.id??null,source:box.source??null}}};validatePageReview({mode:'unselected',regions:[region],deletedPages:[]},pages);regionCandidates.push(region);
  }catch(error){unresolved.push({category:'region',index,reason:(error as Error).message,source:box});}
 }
 const deleted=old.review?.deletedPageNumbers?.map((p:number)=>p-1)??old.review?.deletedPages??[];for(const page of deleted){if(Number.isSafeInteger(page)&&pages.some((p:any)=>p.index===page))deletedPageCandidates.push(page);else unresolved.push({category:'deleted-page',reason:'PORTABLE_DRAFT_PAGE_MISMATCH',source:page});}
 const freshGroups=new Map((d.marks as Mark[]??[]).filter(m=>m.signatureGroup).map(m=>[entitySpanKey(m),m]));
 const safeRecovered=recovered.filter(m=>{const overlaps=[...freshGroups.values()].some(f=>m.start<f.end&&m.end>f.start);if(overlaps)unresolved.push({category:'signature-group',reason:'PORTABLE_SIGNATURE_REVIEW_REQUIRED',source:{start:m.start,end:m.end,kind:m.kind}});return!overlaps;});
 const recoveredKeys=new Set(safeRecovered.map(entitySpanKey)),marks=[...(d.marks??[]).filter((m:Mark)=>!recoveredKeys.has(entitySpanKey(m))).map((m:Mark)=>m.signatureGroup?{...m,decision:'pending' as const,replacement:undefined,replacementOrigin:undefined,hiddenByType:undefined,hiddenTypeWasUserAdded:undefined}:{...m,decision:'pending' as const}),...safeRecovered].sort((a:Mark,b:Mark)=>a.start-b.start||a.end-b.end);validateMarks(text,marks);const entityCorrections:EntityCorrectionFrame|null=corrections.some(({mark})=>safeRecovered.includes(mark))?{version:1,sourceHash:d.source_hash,contentHash:hash(text),capturedRevision:d.revision+1,entries:corrections.filter(({mark})=>safeRecovered.includes(mark)).map(({entry,mark})=>({...entry,markIndex:marks.indexOf(mark)}))}:null;
 const restoredMarkIndices:number[]=[];for(const[mark,beforeIndex]of recoveredSlots)restoredMarkIndices[beforeIndex]=safeRecovered.includes(mark)?marks.indexOf(mark):-1;
 return{content:seal(text,aad),hash:hash(text),anchors,pages,marks,entityCorrections,restoredMarkIndices,pageReview:pages.length?{mode:'unselected',regions:[],deletedPages:[],...(old.exportState?.maskStyle?{maskStyle:old.exportState.maskStyle}:{})}:null,regionCandidates,deletedPageCandidates,rebuiltMapPages:[] as number[],unresolved};
}
