import type{Anchor}from'../contracts/index.ts';
import type{ManualOccurrencePlan,ManualOccurrenceMatch,ManualOccurrenceSource,ManualOccurrenceSegment,ManualOccurrenceBox}from'../contracts/manual-occurrences.ts';
import{wordManualOccurrences,ocrManualOccurrences,pdfManualOccurrences,imageManualOccurrences,manualQueryValid}from'../contracts/manual-selection.ts';
import{pageTextSelection}from'../contracts/ocr-selection.ts';
import{searchImagePages,imageSearchPage}from'../core/image-batch-search.ts';
import{processingDocument,documentProcessingFormat}from'../core/document-format.ts';
import{verifiedDocumentSource}from'./document-source.ts';
import{readOcrText}from'./ocr-correction.ts';
import{referencePdfTableData}from'./reference-pdf-table.ts';
import{semanticEntityValue}from'../core/entity-corrections.ts';
import{hydrateEntityCorrections}from'./entity-corrections.ts';
import{hash,unseal,readOriginal}from'./storage.ts';
const norm=(value:string)=>value.replace(/[\s\u00A0\u1680\u2000-\u200D\u2060\u202F\u205F\u3000\uFEFF\u00AD]/gu,'').toLowerCase();
export const manualGeometryEquivalent=(first:ManualOccurrenceBox[],second:ManualOccurrenceBox[])=>{const overlaps=(a:ManualOccurrenceBox,b:ManualOccurrenceBox)=>{const area=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));return area/Math.min(Math.max(1,a.width*a.height),Math.max(1,b.width*b.height))>=.6;};return first.length>0&&second.length>0&&(first.every(a=>second.some(b=>overlaps(a,b)))||second.every(a=>first.some(b=>overlaps(a,b))));};
/** All returned offsets are authenticated canonical UTF16 positions. The source
 * Word UI's synthetic offsets are represented by actual image anchors instead.
 * No caller path or caller OCR map is accepted; this is a read-only planner. */
export async function planDocumentManualOccurrences(raw:any,query:string):Promise<ManualOccurrencePlan>{
 if(!manualQueryValid(query))throw Error('MANUAL_SELECTION_INVALID');
 const needle=query.trim(),d=hydrateEntityCorrections(raw),format=documentProcessingFormat(d),projected=processingDocument(d),source=await verifiedDocumentSource(d),aad=`${d.tenant_id}:${d.project_id}:${d.id}`,text=unseal(d.content,aad),anchors=d.anchors as Anchor[];
 if(hash(text)!==d.content_hash)throw Error('SOURCE_MISMATCH');
 const warnings:ManualOccurrencePlan['warnings']=[],matches:ManualOccurrenceMatch[]=[],checkedPages:number[]=[],deleted=new Set<number>(d.page_review?.deletedPages??[]);let ordinal=0;
 const append=(source:ManualOccurrenceSource,segments:ManualOccurrenceSegment[],extra:Partial<ManualOccurrenceMatch>={})=>{if(!segments.length)return;matches.push({id:`occurrence-${ordinal++}`,source,segments,text:segments.map(s=>s.text).join(''),crossedObjects:new Set(segments.map(s=>JSON.stringify(s.anchor))).size>1,...extra});};
 // Metadata and every real text object remain available, including headers,
 // comments and hidden fields. Image text is handled by its own line producer.
 const bodyAnchors=anchors.filter(a=>a.kind!=='page'&&!(a.kind==='object'&&a.object==='image-text'));
 if(!['pdf','png','jpg','jpeg'].includes(format)){
  const chunks:string[]=[];let maskedAt=0;for(const a of anchors.filter(a=>a.kind==='object'&&a.object==='image-text').sort((a,b)=>a.start-b.start)){chunks.push(text.slice(maskedAt,a.start),' '.repeat(a.end-a.start));maskedAt=a.end;}chunks.push(text.slice(maskedAt));
  for(const range of wordManualOccurrences(chunks.join(''),needle)){
   const segments:ManualOccurrenceSegment[]=[],candidates=bodyAnchors.filter(a=>a.start<range.end&&a.end>range.start),boundaries=[...new Set([range.start,range.end,...candidates.flatMap(a=>[Math.max(a.start,range.start),Math.min(a.end,range.end)])])].sort((a,b)=>a-b);
   for(let i=0;i<boundaries.length-1;i++){const start=boundaries[i],end=boundaries[i+1],anchor=candidates.filter(a=>a.start<=start&&a.end>=end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];if(!anchor||start===end)continue;const previous=segments.at(-1);if(previous&&previous.anchor===anchor&&previous.end===start){previous.end=end;previous.text=text.slice(previous.start,end);}else segments.push({start,end,text:text.slice(start,end),anchor});}
   segments.sort((a,b)=>a.start-b.start||a.end-b.end);let cursor=range.start;for(const s of segments){if(s.start>cursor&&text.slice(cursor,s.start).trim())throw Error('MANUAL_SELECTION_POSITION_MISSING');cursor=Math.max(cursor,s.end);}if(cursor<range.end&&text.slice(cursor,range.end).trim())throw Error('MANUAL_SELECTION_POSITION_MISSING');if(!segments.length)throw Error('MANUAL_SELECTION_POSITION_MISSING');append('text',segments);
  }
 }
 const native=format==='pdf'?await referencePdfTableData(source,d.page_data??[]):undefined;
 for(const page of d.page_data??[]){if(deleted.has(page.index))continue;const anchor=anchors.find(a=>format==='docx'?a.kind==='object'&&a.object==='image-text'&&a.part===page.part:a.kind==='page'&&a.page===page.index);if(!anchor)throw Error('PAGE_POSITION_MISSING');if(hash(await readOriginal(page.previewId))!==page.previewHash)throw Error('SOURCE_MISMATCH');const view=await readOcrText(projected,page.index),searchPage=imageSearchPage(view);checkedPages.push(page.index);let nativeLength=0;
  if(format==='pdf'&&!(page.ocrRevision>0)){const nativeText=native?.get(page.index)?.nativeText;if(nativeText===undefined||!view.text.startsWith(nativeText))throw Error('SOURCE_MISMATCH');nativeLength=nativeText.length;for(const range of pdfManualOccurrences(nativeText,needle))emit('pdf_native',range.start,range.end);}
  const ocrView={...view,text:view.text.slice(nativeLength),glyphs:view.glyphs.filter(g=>g[0]>=nativeLength).map(g=>[g[0]-nativeLength,g[1]-nativeLength,g[2],g[3],g[4],g[5]]as typeof g)},imageHits=format==='docx'?[]:searchImagePages([imageSearchPage(ocrView)],needle,undefined,{includeCanonicalRanges:true}).results;
  function emit(kind:ManualOccurrenceSource,start:number,end:number,lineIndex?:number,occurrence?:number){
   const selection=pageTextSelection(view,start,end),absoluteStart=anchor!.start+start,absoluteEnd=anchor!.start+end;
   const corrections=(d.entityCorrections?.entries??[]).filter((e:any)=>e.active!==false&&e.start<absoluteEnd&&e.end>absoluteStart);if(corrections.some((e:any)=>norm(e.recognizedText).includes(norm(query))&&!norm(e.correctedText).includes(norm(query))))return;
   const already=matches.some(m=>m.segments.some(s=>s.page===page.index&&s.start===absoluteStart&&s.end===absoluteEnd));if(already)return;
   append(kind,[{start:absoluteStart,end:absoluteEnd,text:text.slice(absoluteStart,absoluteEnd),anchor:anchor!,page:page.index,boxes:selection.bboxes,expandedGlyphCoverage:selection.expandedGlyphCoverage}],{imagePath:page.part,lineIndex,occurrence});
  }
  if(format==='docx'){let lineStart=0;for(const[lineIndex,line]of view.text.split('\n').entries()){for(const[occurrence,range]of ocrManualOccurrences(line,needle).entries())emit('word_image_ocr',lineStart+range.start,lineStart+range.end,lineIndex,occurrence);lineStart+=line.length+1;}}
  else for(const hit of imageHits){const ranges=hit.canonicalRanges??[];if(!ranges.length){warnings.push({code:'OCR_POSITION_REQUIRED',page:page.index});continue;}const segments:ManualOccurrenceSegment[]=[];let obsolete=false;for(const range of ranges){const start=nativeLength+range.start,end=nativeLength+range.end,selection=pageTextSelection(view,start,end),absoluteStart=anchor.start+start,absoluteEnd=anchor.start+end;if((d.entityCorrections?.entries??[]).some((e:any)=>e.active!==false&&e.start<absoluteEnd&&e.end>absoluteStart&&norm(e.recognizedText).includes(norm(query))&&!norm(e.correctedText).includes(norm(query)))){obsolete=true;break;}segments.push({start:absoluteStart,end:absoluteEnd,text:text.slice(absoluteStart,absoluteEnd),anchor,page:page.index,boxes:selection.bboxes,expandedGlyphCoverage:selection.expandedGlyphCoverage});}if(!obsolete)append(format==='pdf'?'pdf_ocr':'image_ocr',segments,{displayText:segments.length>1?hit.matchedLine:undefined});}

  if(['png','jpg','jpeg'].includes(format)&&imageHits.length===0)for(const[markIndex,mark]of(d.marks as import('../contracts/index.ts').Mark[]).entries()){if(mark.decision==='ignore'||mark.start<anchor.start||mark.end>anchor.end)continue;const displayed=semanticEntityValue(d,mark,text,markIndex);if(norm(displayed).includes(norm(needle)))emit('image_ocr',mark.start-anchor.start,mark.end-anchor.start);}
  // Corrected entities have their own recognized and displayed values. A new
  // query can locate their real old glyph box without mutating canonical text.
  for(const entry of d.entityCorrections?.entries??[]){if(entry.active===false||entry.page!==page.index||!norm(entry.correctedText).includes(norm(query)))continue;const start=entry.start,end=entry.end;if(start<anchor.start||end>anchor.end)continue;const selection=pageTextSelection(view,start-anchor.start,end-anchor.start);if(matches.some(m=>m.segments.some(s=>s.page===page.index&&s.start===start&&s.end===end)))continue;append('corrected_entity',[{start,end,text:text.slice(start,end),anchor,page:page.index,boxes:selection.bboxes,expandedGlyphCoverage:selection.expandedGlyphCoverage}],{displayText:entry.correctedText,imagePath:page.part,lineIndex:entry.lineIndex,occurrence:entry.occurrence,existingMarkIndex:entry.markIndex});}
 }
 const seen=new Set<string>(),kept:ManualOccurrenceMatch[]=[],unique=matches.filter(m=>{const key=JSON.stringify(m.segments.map(s=>[s.start,s.end]));if(seen.has(key))return false;const segment=m.segments[0],boxes=m.segments.flatMap(s=>s.boxes??[]);if(segment.page!==undefined&&boxes.length&&kept.some(old=>old.segments[0].page===segment.page&&manualGeometryEquivalent(old.segments.flatMap(s=>s.boxes??[]),boxes)))return false;seen.add(key);kept.push(m);return true;}).sort((a,b)=>a.segments[0].start-b.segments[0].start||a.segments[0].end-b.segments[0].end);
 return{version:1,documentId:d.id,revision:d.revision,sourceHash:d.source_hash,contentHash:d.content_hash,query,format,matches:unique,checkedPages,warnings,counts:{matches:unique.length,segments:unique.reduce((n,m)=>n+m.segments.length,0),crossedObjects:unique.filter(m=>m.crossedObjects).length}};
}
