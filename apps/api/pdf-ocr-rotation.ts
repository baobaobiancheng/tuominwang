import type {FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {rows,sql,type DB} from '../../packages/adapters/db.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {readPageRotationState,sealPageRotationState} from '../../packages/adapters/page-rotation-state.ts';
import {loadPdfOcrCheckpointPages,pdfOcrRotationPlanHash,pdfOcrParserFingerprint,rebasePdfOcrCheckpointForRotation,type PdfOcrCheckpoint} from '../../packages/adapters/pdf-ocr-checkpoints.ts';
import {rotatePageGlyphs,quarterTurn} from '../../packages/core/page-rotation.ts';
import {openPdf} from '../../packages/core/pdf-reader.ts';
import {hash,readOriginal,writeOriginal,writeArtifact,setObjectOwner} from '../../packages/adapters/storage.ts';
import type {PageRotationRequest} from '../../packages/contracts/page-rotation.ts';
import {requirePermission,textArray,denied} from './access.ts';
import {rebasePdfOcrDraftPagesForRotation} from './pdf-ocr-draft.ts';

async function rotatedManualFrame(old:PdfOcrCheckpoint,delta:number,newPlan:string,owner:string):Promise<PdfOcrCheckpoint>{
 if(!delta)return {...old,rotationPlanHash:newPlan,provisionalMatches:[]};
 const image=await sharp(await readOriginal(old.page.previewId)).rotate(delta).png().toBuffer({resolveWithObject:true});
 const glyphs=rotatePageGlyphs(old.glyphs,old.page.width,old.page.height,delta),previewId=randomUUID(),mapId=randomUUID(),map=JSON.stringify(glyphs);
 setObjectOwner(owner);await writeOriginal(previewId,image.data,owner);await writeArtifact(mapId,map,owner);
 return {...old,rotationPlanHash:newPlan,page:{...old.page,width:delta%180?old.page.height:old.page.width,height:delta%180?old.page.width:old.page.height,rotation:quarterTurn(old.page.rotation+delta),previewId,previewHash:hash(image.data),mapId,mapHash:hash(map)},glyphs,provisionalMatches:[]};
}

// Called only under projectScope's project lock and the document FOR UPDATE lock.
// It restarts the ordinary PDF detect at a new revision while reusing verified
// pages of the unmodified original; old checkpoint and draft rows remain history.
export async function rotateQueuedPdf(db:DB,req:FastifyRequest,d:any,input:PageRotationRequest){
 const [job]=await rows(db,sql`SELECT * FROM jobs WHERE document_id=${d.id} ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`);
 if(!job||job.user_id!==req.user.id||job.tenant_id!==d.tenant_id||job.project_id!==d.project_id||job.kind!=='detect'||job.collab_task_id||job.revision!==d.revision||!['queued','running','cancelled'].includes(job.status)||job.status==='cancelled'&&!['PDF_OCR_PAUSED','PDF_OCR_PRIORITY_PREEMPTED'].includes(job.error_code))denied('PDF_OCR_CONTROL_UNAVAILABLE',409);
 await requirePermission(db,d.project_id,[...job.required_permissions,'review','view_original']);
 const [authorized]=await rows(db,sql`SELECT job_authorized(${job.id}::uuid) AS allowed`);if(!authorized?.allowed)denied('PERMISSION_REVOKED',403);
 const source=await verifiedDocumentSource(d).catch(()=>denied('SOURCE_MISMATCH',409)),processingHash=hash(source),oldPlan=pdfOcrRotationPlanHash(d);
 const frames=await loadPdfOcrCheckpointPages(db,d,processingHash,oldPlan);
 if(!frames.length||input.pages.some(index=>!frames.some(frame=>frame.page.index===index)))denied('PAGE_NOT_READY',409);
 const total=frames[0].totalPages;
 if(input.pages.some(index=>index>=total)||frames.some(frame=>frame.totalPages!==total))denied('PAGE_ROTATION_PAGE_INVALID',400);
 const pdf=await openPdf(source);try{if(pdf.count!==total)denied('SOURCE_MISMATCH',409);}finally{pdf.close();}
 const oldState=readPageRotationState(d),state=structuredClone(oldState),selected=new Set(input.pages);
 for(const index of input.pages){const angle=input.rotations[String(index)]??oldState.rotations[String(index)]??0;if(angle)state.rotations[String(index)]=angle;else delete state.rotations[String(index)];}
 state.manualOnlyPages=[...new Set(input.mode==='manual'?[...state.manualOnlyPages,...input.pages]:state.manualOnlyPages.filter(index=>!selected.has(index)))].sort((a,b)=>a-b);
 const next={...d,revision:d.revision+1,page_rotation_state:sealPageRotationState(d,state)},newPlan=pdfOcrRotationPlanHash(next),newJob=randomUUID();
 const copied=new Map<number,PdfOcrCheckpoint>();for(const frame of frames){
  if(selected.has(frame.page.index)&&input.mode==='recognize')continue;
  const oldAngle=oldState.rotations[String(frame.page.index)]??0,newAngle=state.rotations[String(frame.page.index)]??0;
  copied.set(frame.page.index,selected.has(frame.page.index)?await rotatedManualFrame(frame,quarterTurn(newAngle-oldAngle),newPlan,d.id):{...frame,rotationPlanHash:newPlan});
 }
 await rows(db,sql`UPDATE jobs SET status='cancelled',error_code=CASE WHEN status='cancelled' THEN error_code ELSE 'PDF_OCR_ROTATION_RESTART' END,lease_until=NULL,pdf_ocr_pause_binding=CASE WHEN status='cancelled' THEN pdf_ocr_pause_binding ELSE NULL END WHERE id=${job.id}`);
 await rows(db,sql`UPDATE attempts SET finished_at=now(),outcome='page_rotation_changed' WHERE job_id=${job.id} AND finished_at IS NULL`);
 await rows(db,sql`UPDATE documents SET revision=revision+1,page_rotation_state=${next.page_rotation_state} WHERE id=${d.id} AND revision=${d.revision}`);
 await rows(db,sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions) VALUES(${newJob},${d.tenant_id},${d.project_id},${d.id},${req.user.id},'detect',${next.revision},${textArray(job.required_permissions)})`);
 for(const frame of frames){const fresh=copied.get(frame.page.index);if(fresh)await rebasePdfOcrCheckpointForRotation(db,d,next,job.id,newJob,frame,fresh);}
 const oldRootId=job.pdf_ocr_root_job_id??job.id;
 const [oldRoot]=await rows(db,sql`SELECT * FROM jobs WHERE id=${oldRootId}`),[newRoot]=await rows(db,sql`SELECT * FROM jobs WHERE id=${newJob}`);
 if(!oldRoot||!newRoot)denied('PDF_OCR_DRAFT_ROTATION_BINDING_INVALID',409);
 const draft=await rebasePdfOcrDraftPagesForRotation(db,d,next,oldRoot,newRoot,frames,selected);
 const carried=draft.selectedDeletedPages.length?sql`ARRAY[${sql.join(draft.selectedDeletedPages.map(index=>sql`${index}`),sql`, `)}]::integer[]`:sql`ARRAY[]::integer[]`;
 await rows(db,sql`UPDATE jobs SET pdf_ocr_rotation_deleted_pages=${carried} WHERE id=${newJob}`);
 const remainedPaused=input.mode==='manual'&&job.status==='cancelled'&&job.error_code==='PDF_OCR_PAUSED';
 if(remainedPaused){
  const binding={sourceId:next.source_id,sourceHash:next.source_hash,contentHash:next.content_hash,processingHash,rotationPlanHash:newPlan,parserFingerprint:await pdfOcrParserFingerprint(),parseVersion:next.parse_version};
  await rows(db,sql`UPDATE jobs SET status='cancelled',error_code='PDF_OCR_PAUSED',pdf_ocr_pause_binding=${JSON.stringify(binding)}::jsonb WHERE id=${newJob} AND status='queued'`);
 }
 await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'page_rotation_changed',${d.id})`);
 return{success:true,revision:next.revision,jobId:newJob,status:remainedPaused?'paused':'queued',pageRotationState:state,reusedPages:copied.size,draftPages:draft.copied,reviewRequired:true};
}
