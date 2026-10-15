import type {ParsedPage} from '../contracts/index.ts';
import {readPageRotationState} from './page-rotation-state.ts';
import {verifiedDocumentSource} from './document-source.ts';
import {hash,readOriginal,unseal} from './storage.ts';

/** Same page scan and text-sensitive certificate filter used by detect and OCR correction. */
export async function scanVisualCandidates(d:any,text:string,pages:ParsedPage[],profile:any){
 const detectors=profile?(['face','seal','signature'] as const).filter(detector=>profile.enabledEntityTypeIds.includes(detector)):[];
 const visualCandidates:any[]=[],visualPages:{page:number;detectors:string[];warnings:string[]}[]=[];
 if(!pages.length||!detectors.length)return{scanned:false,visualCandidates,visualPages};
 const visual=await import('../core/visual-detection.ts');
 for(const page of pages){
  const preview=await readOriginal(page.previewId);if(hash(preview)!==page.previewHash)throw Error('SOURCE_MISMATCH');
  const initial=visual.canonicalVisualResult(await visual.detectVisual(preview,detectors),page);
  visualPages.push({page:page.index,detectors:[...detectors],warnings:initial.warnings??[]});
  let candidates=initial.candidates;
  if(d.source_format==='pdf'&&detectors.includes('seal')){
   const original=await verifiedDocumentSource(d);
   candidates=visual.suppressOverlaps([...candidates,...await(await import('../core/visual-pdf.ts')).detectPdfImageSeals(original,page.index,preview,readPageRotationState(d).rotations[String(page.index)]??0)]);
  }
  if(['png','jpg','jpeg'].includes(d.source_format))candidates=(await import('../core/visual-morphology.ts')).filterCertificateSealCandidates(candidates,{text,filename:d.source_name?unseal(d.source_name,`${d.tenant_id}:${d.project_id}:${d.id}:name`):''},page).candidates;
  for(const candidate of candidates){visualCandidates.push({...candidate,page:page.index});if(visualCandidates.length>3000)throw Error('VISUAL_CANDIDATE_LIMIT');}
 }
 return{scanned:true,visualCandidates,visualPages};
}
