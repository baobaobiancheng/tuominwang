import type {Anchor,Mark,ParsedPage} from '../contracts/index.ts';
import {kindByEntityType} from '../contracts/entity-types.ts';
import {verifiedDocumentSource} from './document-source.ts';
import {hash,unseal} from './storage.ts';
import {readOcrText} from './ocr-correction.ts';
import {buildDocxLayout} from '../core/docx-layout.ts';
type Detection={content:string;hash:string;marks:Mark[];anchors:Anchor[];coverage:{id:string;status:string}[];pages:ParsedPage[];classification:unknown;recognition:unknown};
/** Fresh image OCR uses the same detection pipeline, policy snapshot and immutable bytes.
 * It returns an unapproved candidate snapshot; it never replaces a saved review. */
export async function recognizeDocumentDocxImages(d:any,detect:(document:any)=>Promise<Detection>){
 if(d.source_format!=='docx')throw new Error('UNSUPPORTED_FORMAT');
 const source=await verifiedDocumentSource(d),aad=`${d.tenant_id}:${d.project_id}:${d.id}`;
 if(hash(unseal(d.content,aad))!==d.content_hash)throw new Error('SOURCE_MISMATCH');
 const result=await detect({...d,page_data:[],presetPolicy:d.presetPolicy?.profile?{...d.presetPolicy,profile:{...d.presetPolicy.profile,settings:{...d.presetPolicy.profile.settings,enabledEntityTypeIds:d.presetPolicy.profile.settings.enabledEntityTypeIds.filter((v:string)=>!['face','seal','signature'].includes(v))}}}:d.presetPolicy});
 const originalText=unseal(result.content,aad);if(hash(originalText)!==result.hash)throw new Error('SOURCE_MISMATCH');
 const imageAnchors=result.anchors.filter(a=>a.kind==='object'&&a.object==='image-text'),next={...d,content:result.content,content_hash:result.hash,anchors:result.anchors,page_data:result.pages};
 const reverseKinds=Object.fromEntries(Object.entries(kindByEntityType).map(([type,kind])=>[kind,type]));
 const matches=result.marks.filter(m=>imageAnchors.some(a=>m.start>=a.start&&m.end<=a.end)).map(m=>({...m,startOffset:m.start,endOffset:m.end,type:m.rawEntityType??reverseKinds[m.kind]??'other',original:originalText.slice(m.start,m.end),decision:'pending' as const,meta:{region:'image_ocr'}}));
 const ocrImageInfos=[];
 for(const page of result.pages){const anchor=imageAnchors.find(a=>a.part===page.part);if(!anchor)throw new Error('SOURCE_MISMATCH');const view=await readOcrText(next,page.index);ocrImageInfos.push({imageIndex:page.index,imagePath:page.part,imageWidth:page.width,imageHeight:page.height,text:view.text,start:anchor.start,end:anchor.end,glyphs:view.glyphs,frames:(page as any).mediaFrames??[]});}
 const imageCoverage=result.coverage.filter(c=>/image|media/u.test(c.id));
 return {_state:result,success:true,documentId:d.id,revision:d.revision,sourceHash:d.source_hash,processingSourceHash:hash(source),contentHash:result.hash,originalText,matches,fileName:unseal(d.source_name,aad+':name'),route:result.classification,docxStructuredInput:await buildDocxLayout(source,originalText,result.anchors,result.pages),canonicalDocument:{version:1,text:originalText,objects:result.anchors,reviewSource:{version:1,sourceSha256:d.source_hash,processingSourceSha256:hash(source)}},docxImageScan:{imageCount:result.pages.length,completedImageCount:ocrImageInfos.length,complete:ocrImageInfos.length===result.pages.length&&imageCoverage.every(c=>c.status==='complete'),coverage:imageCoverage},ocrImageInfos,recognition:result.recognition,reviewRequired:true};
}
