import{resolveEntityGeometry}from'./entity-geometry.ts';
import type {Anchor,Mark,PageReview,ParsedPage} from '../contracts/index.ts';
import type {Glyph} from '../core/ocr.ts';
import {readOriginal,readArtifact,hash} from './storage.ts';
import {visualReplacementPlan,renderVisualReplacement,type VisualReplacementPlan} from '../core/visual-replacement.ts';
/** Immutable original/map hashes bind each selected UTF16 span to its canonical image page. */
export async function renderDocumentVisualPage(d:{source_format:string;page_data:ParsedPage[];anchors:Anchor[];content_hash:string},text:string,pageIndex:number,marks:Mark[],policy:PageReview,options:{signal?:AbortSignal;fontDirectory?:string}={}){
 if(hash(text)!==d.content_hash)throw new Error('SOURCE_MISMATCH');if(options.signal?.aborted)throw new Error('PROCESSING_CANCELLED');const page=d.page_data.find(p=>p.index===pageIndex);if(!page)throw new Error('PAGE_NOT_READY');const source=await readOriginal(page.previewId),map=await readArtifact(page.mapId);if(hash(source)!==page.previewHash||hash(map)!==page.mapHash)throw new Error('SOURCE_MISMATCH');let glyphs:Glyph[];try{glyphs=JSON.parse(map);if(!Array.isArray(glyphs)||glyphs.some(g=>!Array.isArray(g)))throw new Error();}catch{throw new Error('PAGE_POSITION_MISSING');}
 const anchors=d.source_format==='docx'?d.anchors.filter(a=>a.part===page.part&&a.object==='image-text').map(a=>({...a,kind:'page' as const,page:page.index})):d.anchors;
 const plan=visualReplacementPlan(text,marks,anchors,page,glyphs,policy,resolveEntityGeometry(d,marks,policy,page,glyphs,text)),rendered=await renderVisualReplacement(source,page,plan,policy.maskStyle,options);return {...rendered,plan};
}
export type PlannedVisualPage={page:ParsedPage;plan:VisualReplacementPlan};
