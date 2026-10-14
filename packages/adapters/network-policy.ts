import {rows,scoped,sql} from './db.ts';
export type NetworkContext={user:string;tenant:string;project:string};
/** Every tool-initiated external request goes through the project/user gate.
 * Browser/server transport and package installers are separate surfaces. */
export async function managedNetworkFetch(context:NetworkContext,url:string,options:{method?:'GET'|'POST';body?:string;headers?:Record<string,string>;signal?:AbortSignal}={}){
 const target=new URL(url);if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new Error('NETWORK_URL_INVALID');
 const allowed=await scoped(context.user,context.tenant,async db=>{
  if(!(await rows(db,sql`SELECT id FROM projects WHERE id=${context.project} FOR SHARE`)).length)throw new Error('NOT_FOUND');
  await rows(db,sql`INSERT INTO network_policies(tenant_id,project_id,user_id) VALUES(${context.tenant},${context.project},${context.user}) ON CONFLICT DO NOTHING`);
  const [p]=await rows(db,sql`SELECT * FROM network_policies WHERE project_id=${context.project} AND user_id=${context.user} FOR UPDATE`);if(!p)throw new Error('PERMISSION_DENIED');
  await rows(db,sql`UPDATE network_policies SET requests=requests+1,blocked=blocked+${p.offline?1:0},bytes_out=bytes_out+${p.offline?0:Buffer.byteLength(options.body??'')} WHERE project_id=${context.project} AND user_id=${context.user}`);return !p.offline;
 });
 if(!allowed)throw new Error('NETWORK_OFFLINE');
 const response=await fetch(target,{...options,redirect:'error'}),bytes=Buffer.from(await response.arrayBuffer());
 await scoped(context.user,context.tenant,db=>rows(db,sql`UPDATE network_policies SET bytes_in=bytes_in+${bytes.length} WHERE project_id=${context.project} AND user_id=${context.user}`));
 return {status:response.status,ok:response.ok,headers:response.headers,bytes};
}
