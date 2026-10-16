import type {ParsedPage} from '../contracts/index.ts';
import {readPageRotationState} from './page-rotation-state.ts';
import {verifiedDocumentSource} from './document-source.ts';
import {hash,readOriginal,unseal} from './storage.ts';

/** Same page scan and text-sensitive certificate filter used by detect and OCR correction. */
export async function scanVisualCandidates(d:any,text:string,pages:ParsedPage[],profile:any,options:{sealPaused?:()=>Promise<boolean>;onSealPage?:(page:ParsedPage,candidates:any[],warnings:string[],totalPages:number)=>void}={}){
 const detectors=profile?(['face','seal','signature'] as const).filter(detector=>profile.enabledEntityTypeIds.includes(detector)):[];
 const visualCandidates:any[]=[],visualPages:{page:number;detectors:string[];warnings:string[]}[]=[];
 const sealCompletedPageNumbers:number[]=[];let sealDeferred=false,sealWarning:string|undefined;
 if(!pages.length||!detectors.length)return{scanned:false,visualCandidates,visualPages};
 const visual=await import('../core/visual-detection.ts');
 const pdfSeals=d.source_format==='pdf'&&detectors.includes('seal');
 for(const page of pages){
  const preview=await readOriginal(page.previewId);if(hash(preview)!==page.previewHash)throw Error('SOURCE_MISMATCH');
  let candidates:any[],pageDetectors:string[],warnings:string[];
  if(pdfSeals){
   // The original detector lets text, faces and signatures finish even when
   // its PDF seal stage is deferred. Only a completed seal page is credited.
   const others=detectors.filter(detector=>detector!=='seal');
   const other=others.length?visual.canonicalVisualResult(await visual.detectVisual(preview,others),page):null;
   const paused=sealDeferred||(await options.sealPaused?.()??false);
   let seal:any=null;
   if(!paused){
    try{
     seal=visual.canonicalVisualResult(await visual.detectVisual(preview,['seal']),page);
     if(seal.warnings?.length){sealDeferred=true;sealWarning=seal.warnings[0];seal=null;}
     else{
      const original=await verifiedDocumentSource(d);
      seal.candidates=visual.suppressOverlaps([...seal.candidates,...await(await import('../core/visual-pdf.ts')).detectPdfImageSeals(original,page.index,preview,readPageRotationState(d).rotations[String(page.index)]??0)]);
      sealCompletedPageNumbers.push(page.index+1);
     }
    }catch(error){
     const code=(error as Error).message;
     if(['SOURCE_MISMATCH','VISUAL_INPUT_INVALID','PROCESSING_BUSY','VERSION_CONFLICT','PERMISSION_REVOKED'].includes(code))throw error;
     sealDeferred=true;sealWarning=['VISUAL_MODEL_REQUIRED','VISUAL_MODEL_MISMATCH','VISUAL_OUTPUT_INVALID'].includes(code)?code:'SEAL_DETECT_FAILED';seal=null;
    }
    // Publishing a completed-page event is part of the processing contract.
    // A failed event write must not be mistaken for a recoverable detector warning.
    if(seal)options.onSealPage?.(page,seal.candidates,[],pages.length);
   }
   pageDetectors=paused||sealDeferred&&!seal?[...others]:[...detectors];
   warnings=[...new Set([...(other?.warnings??[]),...(seal?.warnings??[]),...(paused||sealDeferred&&!seal?['SEAL_DEFERRED']:[]),...(sealWarning?[sealWarning]:[])])];
   candidates=visual.suppressOverlaps([...(other?.candidates??[]),...(seal?.candidates??[])]);
  }else{
   const initial=visual.canonicalVisualResult(await visual.detectVisual(preview,detectors),page);
   pageDetectors=[...detectors];warnings=initial.warnings??[];candidates=initial.candidates;
  }
  visualPages.push({page:page.index,detectors:pageDetectors,warnings});
  if(['png','jpg','jpeg'].includes(d.source_format))candidates=(await import('../core/visual-morphology.ts')).filterCertificateSealCandidates(candidates,{text,filename:d.source_name?unseal(d.source_name,`${d.tenant_id}:${d.project_id}:${d.id}:name`):''},page).candidates;
  for(const candidate of candidates){visualCandidates.push({...candidate,page:page.index});if(visualCandidates.length>3000)throw Error('VISUAL_CANDIDATE_LIMIT');}
 }
 return{scanned:true,visualCandidates,visualPages,...pdfSeals?{sealProgress:{status:sealCompletedPageNumbers.length===pages.length?'complete':'deferred',completedPageNumbers:sealCompletedPageNumbers,...sealWarning?{sealWarning}:{}}}:{}};
}
