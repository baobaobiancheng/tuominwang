import {verifiedDocumentSource} from "./document-source.ts";
import sharp from 'sharp';
import {normalizeOfficeMedia} from '../core/office-media.ts';
import type {ParsedPage} from '../contracts/index.ts';
import {readZip} from '../core/office-zip.ts';
import {officeImagePart} from '../core/office.ts';
import {detectVisual,canonicalVisualResult,type VisualCandidate} from '../core/visual-detection.ts';
import {readOriginal,hash} from './storage.ts';
export type OfficeFaceCandidate=VisualCandidate&{page:number;part:string;decision:'pending'};
const checkCancelled=(signal?:AbortSignal)=>{if(signal?.aborted)throw new Error('PROCESSING_CANCELLED');};
/** Walks every supported Word/media image. A requested run never auto-approves or persists its results. */
export async function detectOfficeImageFaces(source:Buffer,pages:ParsedPage[],readPreview:(page:ParsedPage)=>Promise<Buffer>,options:{signal?:AbortSignal;onProgress?:(done:number,total:number)=>void}={}){
 checkCancelled(options.signal);const parts=await readZip(source),images=[...parts.keys()].filter(officeImagePart).sort();if(images.length>300)throw new Error('PAGE_LIMIT');if(pages.length!==images.length||new Set(pages.map(p=>p.part)).size!==pages.length||pages.some((p,i)=>p.index!==i||!p.part||!images.includes(p.part)))throw new Error('SOURCE_MISMATCH');const candidates:OfficeFaceCandidate[]=[],completed:string[]=[];let faceVersion:string|undefined;
 for(const page of pages){checkCancelled(options.signal);const bytes=await readPreview(page);if(hash(bytes)!==page.previewHash)throw new Error('SOURCE_MISMATCH');
  // Rebuild every frame from the immutable source. Never trust imported frame metadata or a legacy first-frame preview.
  const media=await normalizeOfficeMedia(parts.get(page.part!)!);if(media.width!==page.width||media.height!==page.height)throw new Error('SOURCE_MISMATCH');const raw=await sharp(bytes).flatten({background:'white'}).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true}),expected=await sharp(media.png).removeAlpha().raw().toBuffer();if(raw.info.width!==media.width||raw.info.height!==media.height||!raw.data.equals(expected))throw new Error('SOURCE_MISMATCH');
  for(const frame of media.frames){checkCancelled(options.signal);const crop=await sharp(bytes).extract({left:frame.x,top:frame.y,width:frame.width,height:frame.height}).flatten({background:'white'}).toColourspace('srgb').removeAlpha().raw().toBuffer();if(hash(crop)!==frame.rgbHash)throw new Error('SOURCE_MISMATCH');const png=await sharp(crop,{raw:{width:frame.width,height:frame.height,channels:3}}).png().toBuffer(),result=canonicalVisualResult(await detectVisual(png,['face']),frame);faceVersion=result.faceVersion;checkCancelled(options.signal);for(const c of result.candidates){if(c.reason!=='人脸')throw new Error('VISUAL_OUTPUT_INVALID');candidates.push({...c,x:c.x+frame.x,y:c.y+frame.y,page:page.index,part:page.part!,decision:'pending'});}}
  completed.push(page.part!);options.onProgress?.(completed.length,pages.length);
 }
 return{candidates,completed,faceVersion};
}
export async function detectDocumentOfficeFaces(d:{source_format:string;source_id:string;source_hash:string;page_data:ParsedPage[]},options:{signal?:AbortSignal;onProgress?:(done:number,total:number)=>void}={}){if(d.source_format!=='docx')throw new Error('VISUAL_INPUT_INVALID');const source=await verifiedDocumentSource(d);return detectOfficeImageFaces(source,d.page_data,p=>readOriginal(p.previewId),options);}
