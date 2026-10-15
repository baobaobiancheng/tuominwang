import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {scoped,rows,sql} from '../../packages/adapters/db.ts';
import {seal,unseal} from '../../packages/adapters/storage.ts';
/** A per-user web preview preference; it does not infer native process crashes. */
export function registerDocxSafeModeRoutes(app:FastifyInstance){
 const path='/api/preferences/docx-safe-mode';
 app.get(path,async(req,reply)=>scoped(req.user.id,req.user.tenant_id,async db=>{
  reply.header('Cache-Control','no-store');const [stored]=await rows(db,sql`SELECT detail FROM docx_safe_mode_preferences WHERE owner_id=${req.user.id}`);
  if(!stored)return {safeMode:false};
  const detail=unseal(stored.detail,`${req.user.tenant_id}:${req.user.id}:docx-safe-mode`),value=JSON.parse(detail);
  return {safeMode:true,detail,time:value.time,reason:value.reason};
 }));
 app.put(path,async req=>{const {reason}=z.object({reason:z.json()}).strict().parse(req.body);return scoped(req.user.id,req.user.tenant_id,async db=>{
  const time=new Date().toISOString(),detail=JSON.stringify({time,reason});
  await rows(db,sql`INSERT INTO docx_safe_mode_preferences(tenant_id,owner_id,detail) VALUES(${req.user.tenant_id},${req.user.id},${seal(detail,`${req.user.tenant_id}:${req.user.id}:docx-safe-mode`)}) ON CONFLICT(owner_id) DO UPDATE SET detail=EXCLUDED.detail,updated_at=now()`);
  return {ok:true,safeMode:true,detail,time,reason};
 });});
 app.delete(path,async req=>scoped(req.user.id,req.user.tenant_id,async db=>{await rows(db,sql`DELETE FROM docx_safe_mode_preferences WHERE owner_id=${req.user.id}`);return {ok:true,safeMode:false};}));
}
