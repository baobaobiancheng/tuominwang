import {randomUUID} from 'node:crypto';
import type {PageReview,ParsedPage} from '../contracts/index.ts';

type Candidate={page:number;x:number;y:number;width:number;height:number;reason:'人脸'|'印章'|'签名';score:number;detector:string};
type VisualState={complete:boolean;pages:{page:number;detectors:string[];warnings:string[]}[]};
const kindForReason={'人脸':'face','印章':'seal','签名':'signature'} as const;

/** Turn verified detector proposals into real raster regions. Every region keeps
 * its detector, score, page preview hash and original candidate index. */
export function automaticVisualPageReview(pages:ParsedPage[],candidates:Candidate[],visual:VisualState|undefined,
  enabled:readonly string[],old:PageReview|null):PageReview|undefined{
  if(!pages.length)return undefined;
  if(!old||old.mode!=='unselected'||old.regions.length||old.deletedPages.length)
    throw new Error('AUTOMATIC_PAGE_REVIEW_REQUIRED');
  if(enabled.length){
    const expected=new Set(enabled);
    if(expected.size!==enabled.length)throw new Error('AUTOMATIC_VISUAL_SCAN_INCOMPLETE');
    if(!visual?.complete||visual.pages.length!==pages.length||visual.pages.some((row,index)=>
      row.page!==index||row.warnings.length||row.detectors.length!==expected.size||
      new Set(row.detectors).size!==expected.size||
      row.detectors.some(detector=>!expected.has(detector))))
      throw new Error('AUTOMATIC_VISUAL_SCAN_INCOMPLETE');
  }else if(candidates.length)throw new Error('AUTOMATIC_VISUAL_PROFILE_MISMATCH');
  if(candidates.length>3000)throw new Error('VISUAL_CANDIDATE_LIMIT');
  const regions:PageReview['regions']=candidates.map((candidate,index)=>{
    const page=pages[candidate.page];
    if(!page||!enabled.includes(kindForReason[candidate.reason])||
      !Number.isFinite(candidate.score)||candidate.score<0||candidate.score>1||
      !candidate.detector||![candidate.x,candidate.y,candidate.width,candidate.height].every(Number.isFinite)||
      candidate.x<0||candidate.y<0||candidate.width<=0||candidate.height<=0||
      candidate.x+candidate.width>page.width||candidate.y+candidate.height>page.height)
      throw new Error('AUTOMATIC_VISUAL_CANDIDATE_INVALID');
    return{id:randomUUID(),page:candidate.page,x:candidate.x,y:candidate.y,
      width:candidate.width,height:candidate.height,reason:candidate.reason,
      meta:{automaticVisual:{index,detector:candidate.detector,score:candidate.score,
        previewHash:page.previewHash}}};
  });
  return{...old,mode:'raster',regions};
}
