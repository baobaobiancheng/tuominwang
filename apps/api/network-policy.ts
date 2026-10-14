import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id} from '../../packages/contracts/index.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {projectScope} from './access.ts';
function fail(code:string,statusCode=409):never{throw Object.assign(new Error(code),{statusCode});}
function stats(row:any){return {offline:row?.offline??true,requests:String(row?.requests??0),blocked:String(row?.blocked??0),bytesOut:String(row?.bytes_out??0),bytesIn:String(row?.bytes_in??0),revision:row?.revision??0};}
export function registerNetworkPolicyRoutes(app:FastifyInstance){
 app.get('/api/projects/:id/network',async req=>{const project=id.parse((req.params as any).id);return projectScope(req,{project},[],async db=>stats((await rows(db,sql`SELECT * FROM network_policies WHERE project_id=${project} AND user_id=${req.user.id}`))[0]));});
 app.put('/api/projects/:id/network',async req=>{const project=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),offline:z.boolean()}).strict().parse(req.body);return projectScope(req,{project},['manage_models'],async db=>{
  const [old]=await rows(db,sql`SELECT * FROM network_policies WHERE project_id=${project} AND user_id=${req.user.id} FOR UPDATE`);if((old?.revision??0)!==input.revision)fail('VERSION_CONFLICT');
  const [saved]=await rows(db,sql`INSERT INTO network_policies(tenant_id,project_id,user_id,offline) VALUES(${req.user.tenant_id},${project},${req.user.id},${input.offline}) ON CONFLICT(project_id,user_id) DO UPDATE SET offline=excluded.offline,revision=network_policies.revision+1 RETURNING *`);return stats(saved);
 });});
 app.post('/api/projects/:id/network/reset',async req=>{const project=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative()}).strict().parse(req.body);return projectScope(req,{project},['manage_models'],async db=>{
  const [old]=await rows(db,sql`SELECT * FROM network_policies WHERE project_id=${project} AND user_id=${req.user.id} FOR UPDATE`);if((old?.revision??0)!==input.revision)fail('VERSION_CONFLICT');
  const [saved]=await rows(db,sql`INSERT INTO network_policies(tenant_id,project_id,user_id) VALUES(${req.user.tenant_id},${project},${req.user.id}) ON CONFLICT(project_id,user_id) DO UPDATE SET requests=0,blocked=0,bytes_in=0,bytes_out=0,revision=network_policies.revision+1 RETURNING *`);return stats(saved);
 });});
}
