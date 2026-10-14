import type{FastifyInstance}from'fastify';
import{randomUUID}from'node:crypto';
import{scoped,rows,sql}from'../../packages/adapters/db.ts';
import{readLegalDocument,onboardingSample,rendererCrashLine}from'../../packages/core/support.ts';
export function registerSupportRoutes(app:FastifyInstance){
 app.get("/api/app/version",async()=>{const valid=(value:string|undefined)=>value&&/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u.test(value)?value:null;return{productName:"脱敏汪",version:valid(process.env.RELEASE_VERSION)??"development",releaseId:valid(process.env.RELEASE_ID),distribution:"web"};});
 app.post('/api/support/renderer-error',{bodyLimit:64*1024},req=>scoped(req.user.id,req.user.tenant_id,async db=>{await rows(db,sql`INSERT INTO renderer_crash_events(id,tenant_id,owner_id,event) VALUES(${randomUUID()},${req.user.tenant_id},${req.user.id},'RENDERER_JS_ERROR_DETAILS_OMITTED')`);return{ok:true};}));
 app.get('/api/support/crash-log',async(req,reply)=>{const events=await scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`SELECT created_at FROM renderer_crash_events WHERE owner_id=${req.user.id} AND tenant_id=${req.user.tenant_id} ORDER BY created_at,id`));if(!events.length)return reply.code(404).send({ok:false,errorCode:'DOCX_CRASH_LOG_NOT_FOUND',error:'暂无故障日志'});return reply.header('content-disposition','attachment; filename="tuominwang-crash.log"').type('text/plain; charset=utf-8').send(events.map(e=>rendererCrashLine(new Date(e.created_at).toISOString())).join(''));});
 app.get('/api/support/legal/:name',async(req,reply)=>{try{return readLegalDocument(String((req.params as any).name));}catch{return reply.code(404).send({success:false,error:'LEGAL_DOCUMENT_NOT_FOUND'});}});
 app.get('/api/support/onboarding-sample',async(_req,reply)=>{const file=await onboardingSample();return reply.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').header('X-Content-Synthetic','true').header('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`).send(file.bytes);});
}
