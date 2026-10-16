import {createHash} from 'node:crypto';
import {validateFileMarks} from './files.ts';
import {entitySpanKey} from './entity-identity.ts';
import {assertSignatureGroups} from './review-groups.ts';
import {MAX_MARKS,pageReviewSchema,type Anchor,type Mark,type ParsedPage,type PageReview} from '../contracts/index.ts';
import {validatePageReview} from './page-redaction.ts';

// Positions in a draft are page-local UTF-16 offsets, exactly as parsePages
// stores each checkpoint. The final page anchor supplies the only offset shift.
export type PdfOcrDraftMark=Pick<Mark,'start'|'end'|'kind'|'decision'> & Partial<Pick<Mark,'rawEntityType'|'replacement'>>;
export type PdfOcrDraftDelete=Pick<Mark,'start'|'end'|'kind'> & Partial<Pick<Mark,'rawEntityType'>>;
export type PdfOcrDraftRegion=Omit<PageReview['regions'][number],'page'|'meta'>;
export type PdfOcrDraftPage={pageIndex:number;textHash:string;previewHash:string;mapHash:string;marks:PdfOcrDraftMark[];removed:PdfOcrDraftDelete[];regions?:PdfOcrDraftRegion[];pageDeleted?:boolean};

const key=(m:PdfOcrDraftDelete)=>entitySpanKey({...m,decision:'pending',sources:[]} as Mark);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const validSpan=(m:PdfOcrDraftDelete,length:number)=>Number.isInteger(m.start)&&Number.isInteger(m.end)&&m.start>=0&&m.start<m.end&&m.end<=length;

export function validatePdfOcrDraftPage(page:PdfOcrDraftPage,text:string,bounds?:Pick<ParsedPage,'width'|'height'>){
 if(!Number.isSafeInteger(page.pageIndex)||page.pageIndex<0||page.textHash!==hash(text)||!Array.isArray(page.marks)||!Array.isArray(page.removed)||page.marks.length+page.removed.length>MAX_MARKS)throw Error('PDF_OCR_DRAFT_INVALID');
 const written=new Set<string>(),removed=new Set<string>();
 for(const mark of page.marks){
  if(!validSpan(mark,text.length)||!['redact','ignore'].includes(mark.decision)||mark.replacement?.mode==='alias')throw Error('PDF_OCR_DRAFT_INVALID');
  if(mark.rawEntityType&&mark.kind!=='自定义')throw Error('PDF_OCR_DRAFT_INVALID');
  const identity=key(mark);if(written.has(identity))throw Error('PDF_OCR_DRAFT_DUPLICATE');written.add(identity);
 }
 for(const mark of page.removed){if(!validSpan(mark,text.length))throw Error('PDF_OCR_DRAFT_INVALID');const identity=key(mark);if(removed.has(identity)||written.has(identity))throw Error('PDF_OCR_DRAFT_DUPLICATE');removed.add(identity);}
 if(page.pageDeleted!==undefined&&typeof page.pageDeleted!=='boolean')throw Error('PDF_OCR_DRAFT_INVALID');
 if(page.regions!==undefined){
  if(!bounds||!Array.isArray(page.regions)||page.regions.length>3000)throw Error('PDF_OCR_DRAFT_INVALID');
  const policy=pageReviewSchema.safeParse({mode:'unselected',regions:page.regions.map(region=>({...region,page:page.pageIndex})),deletedPages:[]});
  if(!policy.success||new Set(page.regions.map(region=>region.id)).size!==page.regions.length||page.regions.some(region=>region.x+region.width>bounds.width||region.y+region.height>bounds.height))throw Error('PDF_OCR_DRAFT_INVALID');
 }
 validateFileMarks(text,page.marks.map(m=>({...m,sources:[{layer:'manual',code:'pdf-ocr-draft'}],userAdded:true} as Mark)),'pdf',[]);
}

export function mergePdfOcrDraftPageReview(pages:ParsedPage[],base:PageReview|null|undefined,drafts:PdfOcrDraftPage[]):PageReview|null|undefined{
 if(!drafts.some(d=>d.regions?.length||d.pageDeleted!==undefined))return base;
 const regions=[...(base?.regions??[])],deletedPages=new Set(base?.deletedPages??[]);
 for(const draft of drafts){
  const page=pages.find(p=>p.index===draft.pageIndex);
  if(!page)throw Error('PDF_OCR_DRAFT_PAGE_CHANGED');
  if(draft.regions?.length){
   for(const region of draft.regions)regions.push({...region,page:draft.pageIndex});
  }
  if(draft.pageDeleted===true)deletedPages.add(draft.pageIndex);
  else if(draft.pageDeleted===false)deletedPages.delete(draft.pageIndex);
 }
 return validatePageReview({...base,mode:'unselected',regions,deletedPages:[...deletedPages].sort((a,b)=>a-b)},pages);
}

export function mergePdfOcrDraft(text:string,anchors:Anchor[],pages:ParsedPage[],machine:Mark[],drafts:PdfOcrDraftPage[]):Mark[]{
 const result=[...machine],byPage=new Map(pages.map(p=>[p.index,p])),seen=new Set<number>();
 for(const draft of drafts){
  if(seen.has(draft.pageIndex))throw Error('PDF_OCR_DRAFT_DUPLICATE');seen.add(draft.pageIndex);
  const page=byPage.get(draft.pageIndex),anchor=anchors.find(a=>a.kind==='page'&&a.page===draft.pageIndex);
  if(!page||!anchor||page.previewHash!==draft.previewHash||page.mapHash!==draft.mapHash)throw Error('PDF_OCR_DRAFT_PAGE_CHANGED');
  const pageText=text.slice(anchor.start,anchor.end);validatePdfOcrDraftPage(draft,pageText,page);
  const removed=new Map(draft.removed.map(m=>{const shifted:Mark={...m,start:m.start+anchor.start,end:m.end+anchor.start,decision:'ignore',sources:[{layer:'manual',code:'pdf-ocr-draft-remove'}],userAdded:true};return[key(shifted),shifted] as const;}));
  const manual=new Map(draft.marks.map(m=>{const shifted:Mark={...m,start:m.start+anchor.start,end:m.end+anchor.start,sources:[{layer:'manual',code:'pdf-ocr-draft'}],userAdded:true};return[key(shifted),shifted] as const;}));
  for(let index=0;index<result.length;index++){
   const old=result[index];if(old.start<anchor.start||old.end>anchor.end)continue;
   const identity=key(old);
   if(removed.has(identity)){
    result[index]={...old,decision:'ignore',sources:[...(old.sources??[]),{layer:'manual',code:'pdf-ocr-draft-remove'}]};
    removed.delete(identity);
   }
   if(manual.has(identity)){
    result[index]={...old,...manual.get(identity)!,sources:[...(old.sources??[]),{layer:'manual',code:'pdf-ocr-draft'}]};manual.delete(identity);
   }
  }
  result.push(...manual.values(),...removed.values());
 }
 if(result.length>MAX_MARKS)throw Error('MARK_LIMIT');
 result.sort((a,b)=>a.start-b.start||a.end-b.end||key(a).localeCompare(key(b)));
 validateFileMarks(text,result,'pdf',anchors);
 assertSignatureGroups(result);
 return result;
}

// A final detect may win the race with the user's last in-flight page edit.
// Revert only that page's previously persisted draft effect, then apply the
// user's latest page intent through the same normal review validation path.
export function replacePdfOcrDraftAtReview(text:string,anchors:Anchor[],pages:ParsedPage[],currentMarks:Mark[],currentReview:PageReview|null,oldDraft:PdfOcrDraftPage|null,nextDraft:PdfOcrDraftPage){
 const page=pages.find(p=>p.index===nextDraft.pageIndex),anchor=anchors.find(a=>a.kind==='page'&&a.page===nextDraft.pageIndex);
 if(!page||!anchor||page.previewHash!==nextDraft.previewHash||page.mapHash!==nextDraft.mapHash)throw Error('PDF_OCR_DRAFT_PAGE_CHANGED');
 const local=text.slice(anchor.start,anchor.end);validatePdfOcrDraftPage(nextDraft,local,page);
 if(oldDraft)validatePdfOcrDraftPage(oldDraft,local,page);
 const previous=new Set([...(oldDraft?.marks??[]),...(oldDraft?.removed??[])].map(m=>key({...m,start:m.start+anchor.start,end:m.end+anchor.start})));
 const base:Mark[]=[];
 for(const mark of currentMarks){
  if(!previous.has(key(mark))){base.push(mark);continue;}
  const sources=(mark.sources??[]).filter(source=>!(source.layer==='manual'&&['pdf-ocr-draft','pdf-ocr-draft-remove'].includes(source.code)));
  if(sources.length)base.push({...mark,sources,decision:'pending',userAdded:false});
 }
 const regions=(currentReview?.regions??[]).filter(region=>!oldDraft?.regions?.some(old=>old.id===region.id));
 const deletedPages=(currentReview?.deletedPages??[]).filter(index=>!(oldDraft?.pageDeleted&&index===nextDraft.pageIndex));
 const review=mergePdfOcrDraftPageReview(pages,{...currentReview,mode:'unselected',regions,deletedPages},[nextDraft]);
 return{marks:mergePdfOcrDraft(text,anchors,pages,base,[nextDraft]),pageReview:review};
}
