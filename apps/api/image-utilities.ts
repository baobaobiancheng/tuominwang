import{processingDocument,isWordFormat}from'../../packages/core/document-format.ts';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {validateFileMarks} from '../../packages/core/files.ts';
import {readOcrText} from '../../packages/adapters/ocr-correction.ts';
import {id,markSchema,MAX_MARKS,REVIEW_BODY_BYTES} from '../../packages/contracts/index.ts';
import {projectScope,denied} from './access.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {runProcessing,type ProcessingInput} from '../../packages/adapters/processing.ts';
import {seal,unseal,hash} from '../../packages/adapters/storage.ts';
import {exportImageAnnotations,exportImageLabels,buildImageReviewLabels} from '../../packages/core/image-utilities.ts';
const rectangle=z.object({x:z.number().finite().nonnegative(),y:z.number().finite().nonnegative(),width:z.number().finite().positive(),height:z.number().finite().positive()}).strict();
const params=z.object({id,page:z.coerce.number().int().min(0).max(299)}),revision=z.object({revision:z.number().int().nonnegative()}).strict();
export function registerImageUtilityRoutes(app:FastifyInstance){
 const cache=new Map<string,{expires:number;fingerprint:string;encrypted:string}>();
 const timer=setInterval(()=>{for(const [key,value]of cache)if(value.expires<Date.now())cache.delete(key);},60000);timer.unref();app.addHook('onClose',async()=>{clearInterval(timer);cache.clear();});
 for(const operation of ['region','rerun']as const)app.post(`/api/documents/:id/pages/:page/ocr-${operation}`,async req=>{
  const {id:doc,page}=params.parse(req.params),input=z.object({revision:z.number().int().nonnegative(),region:rectangle,canvas:z.object({width:z.number().finite().positive(),height:z.number().finite().positive()}).strict()}).strict().parse(req.body);
  return projectScope(req,{document:doc},['view_original'],async db=>{
   const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc}`);if(!d)denied('NOT_FOUND',404);if(d.revision!==input.revision)denied('VERSION_CONFLICT',409);if(d.state!=='review')denied('DETECTION_INCOMPLETE',409);
   const key=`${req.user.tenant_id}:${req.user.id}:${doc}:${page}`,aad=`${key}:ocr-query-cache`,fingerprint=hash(JSON.stringify([d.revision,d.source_hash,d.content_hash,d.page_data,input.region,input.canvas]));
   const cached=cache.get(key);if(operation==='region'&&cached&&cached.expires>Date.now()&&cached.fingerprint===fingerprint){try{await runProcessing({kind:'image-utility',operation:'verify',doc:d,page,region:input.region,canvas:input.canvas} as ProcessingInput);}catch(e){denied((e as Error).message,409);}return {...JSON.parse(unseal(cached.encrypted,aad)),cached:true};}
   try{const result=await runProcessing<object>({kind:'image-utility',operation,doc:d,page,region:input.region,canvas:input.canvas} as ProcessingInput);if(operation==='region')cache.set(key,{expires:Date.now()+300000,fingerprint,encrypted:seal(JSON.stringify(result),aad)});return {...result,cached:false};}catch(e){denied((e as Error).message,409);}
  });
 });
 app.post('/api/documents/:id/ocr-cache/clear',async req=>{const doc=id.parse((req.params as any).id),input=revision.parse(req.body);return projectScope(req,{document:doc},['view_original'],async db=>{const[d]=await rows(db,sql`SELECT revision FROM documents WHERE id=${doc}`);if(!d)denied('NOT_FOUND',404);if(d.revision!==input.revision)denied('VERSION_CONFLICT',409);let cleared=0;const prefix=`${req.user.tenant_id}:${req.user.id}:${doc}:`;for(const key of cache.keys())if(key.startsWith(prefix)){cache.delete(key);cleared++;}return {success:true,cleared,revision:d.revision};});});
 for(const format of ['labels','annotations']as const)app.post(`/api/documents/:id/pages/:page/${format}`,{bodyLimit:REVIEW_BODY_BYTES},async(req,reply)=>{
  const {id:doc,page}=params.parse(req.params),input=z.object({revision:z.number().int().nonnegative(),bboxes:z.array(rectangle.extend({type:z.string().min(1).refine(v=>v.isWellFormed()&&!v.includes('\0')),confidence:z.number().finite().min(0).max(1).optional(),source:z.string().refine(v=>v.isWellFormed()&&!v.includes('\0')).optional(),meta:z.record(z.string(),z.json()).optional(),id:z.string().refine(v=>v.isWellFormed()&&!v.includes('\0')).optional(),text:z.string().refine(v=>v.isWellFormed()&&!v.includes('\0')).optional(),shape:z.enum(['rect','circle']).optional(),start:z.number().int().nonnegative().optional(),end:z.number().int().positive().optional()}).strict()).max(3000),marks:z.array(markSchema).max(MAX_MARKS).optional()}).strict().parse(req.body);
  return projectScope(req,{document:doc},['view_original','export'],async db=>{const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc}`);if(!d)denied('NOT_FOUND',404);if(d.revision!==input.revision)denied('VERSION_CONFLICT',409);if(d.state!=='review')denied('DETECTION_INCOMPLETE',409);const p=d.page_data.find((p:any)=>p.index===page);if(!p)denied('PAGE_NOT_READY',409);
   // Load through the worker to verify original, content and page-map provenance.
   try{await runProcessing({kind:'image-utility',operation:'region',doc:d,page,region:{x:0,y:0,width:p.width,height:p.height},canvas:{width:p.width,height:p.height}} as ProcessingInput);}catch(e){denied((e as Error).message,409);}
   const view=await readOcrText(processingDocument(d),page),anchor=d.anchors.find((a:any)=>isWordFormat(d.source_format)?a.kind==='object'&&a.object==='image-text'&&a.part===p.part:a.kind==='page'&&a.page===page);if(!anchor)denied('PAGE_POSITION_MISSING',409);const annotationMarks=input.marks??d.marks??[];try{validateFileMarks(unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`),annotationMarks.map((m:any)=>({...m,decision:'pending'})),d.source_format,d.anchors);}catch(e){denied((e as Error).message,400);}const labels=buildImageReviewLabels(view,anchor.start,annotationMarks,input.bboxes);
   const originalName=unseal(d.source_name,`${d.tenant_id}:${d.project_id}:${d.id}:name`).replace(/^.*[\\/]/u,''),name=`${originalName}#${page+1}`;let body;try{body=format==='labels'?exportImageLabels(name,p,labels):exportImageAnnotations(name,p,labels);}catch(e){if(/^IMAGE_(REGION|LABEL|DIMENSIONS)_INVALID$/u.test((e as Error).message))denied((e as Error).message,400);throw e;}
   await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},${`image_${format}_exported`},${doc})`);
   return reply.header('Cache-Control','no-store').type('application/json; charset=utf-8').header('Content-Disposition',`attachment; filename="image-${page+1}-${format}.json"`).send({...body,documentId:doc,revision:d.revision,sourceHash:d.source_hash});
  });
 });
 app.get('/api/ocr/health',async()=>runProcessing({kind:'image-utility',operation:'health'} as ProcessingInput));
 app.post('/api/ocr/diagnostic',async(req,reply)=>{const input=z.object({reason:z.string().max(200).refine(v=>v.isWellFormed()&&!/[\r\n\x00]/u.test(v)).optional()}).strict().parse(req.body);const result=await runProcessing({kind:'image-utility',operation:'diagnostic',reason:input.reason} as ProcessingInput);return reply.header('Cache-Control','no-store').type('application/json; charset=utf-8').header('Content-Disposition','attachment; filename="ocr-diagnostic.json"').send(result);});
}
