import {randomUUID} from 'node:crypto';
import {rows,sql,type DB} from './db.ts';
import {hash,seal,unseal} from './storage.ts';
import type {RuntimeWhitelist} from '../core/runtime-rule-update.ts';
import type {RuntimeRuleScope} from '../core/reference-runtime-rule-producer.ts';
export type AutomaticRuntimeRuleBinding={job:string;generation:number;tenant:string;project:string;user:string;document:string;revision:number;sourceHash:string|null;contentHash:string};
const aad=(b:AutomaticRuntimeRuleBinding,id:string)=>JSON.stringify(['automatic-runtime-rule',b.tenant,b.project,b.user,b.document,b.job,b.generation,b.revision,b.sourceHash,b.contentHash,id]);
function binding(j:any):AutomaticRuntimeRuleBinding{return{job:j.id,generation:j.generation,tenant:j.tenant_id,project:j.project_id,user:j.user_id,document:j.document_id,revision:j.revision,sourceHash:j.source_hash,contentHash:j.content_hash};}
export async function queueAutomaticRuntimeRules(db:DB,input:{tenant:string;project:string;user:string;document:string;revision:number;scope:RuntimeRuleScope;rules:RuntimeWhitelist[]}){
 if(!input.rules.length||input.scope==='spot')return{success:true,appliedToTasks:0,whitelistApplied:0,added:false};
 // Lock the same job row used by final drain. A task cannot acknowledge a rule
 // after its last matching window has closed. No queued or completed jobs.
 const jobs=await rows(db,sql`SELECT j.*,d.source_hash,d.content_hash FROM jobs j JOIN documents d ON d.id=j.document_id WHERE j.project_id=${input.project} AND j.tenant_id=${input.tenant} AND j.user_id=${input.user} AND j.kind='detect' AND j.status='running' AND j.lease_until>now() AND j.runtime_rule_accepting AND j.revision=d.revision AND (${input.scope}='project' OR (j.document_id=${input.document} AND j.revision=${input.revision})) AND job_authorized(j.id) ORDER BY j.id FOR UPDATE OF j`);
 for(const job of jobs){const b=binding(job),id=randomUUID(),body=JSON.stringify(input.rules);await rows(db,sql`INSERT INTO runtime_rule_deliveries(id,tenant_id,project_id,owner_id,document_id,job_id,generation,revision,source_hash,content_hash,payload,payload_hash) VALUES(${id},${b.tenant},${b.project},${b.user},${b.document},${b.job},${b.generation},${b.revision},${b.sourceHash},${b.contentHash},${seal(body,aad(b,id))},${hash(body)})`);}
 return{success:true,appliedToTasks:jobs.length,whitelistApplied:jobs.length*input.rules.length,added:jobs.length>0};
}
export async function closeAndDrainAutomaticRuntimeRules(db:DB,b:AutomaticRuntimeRuleBinding):Promise<RuntimeWhitelist[]>{
 const[job]=await rows(db,sql`SELECT j.id FROM jobs j JOIN documents d ON d.id=j.document_id WHERE j.id=${b.job} AND j.generation=${b.generation} AND j.tenant_id=${b.tenant} AND j.project_id=${b.project} AND j.user_id=${b.user} AND j.document_id=${b.document} AND j.revision=${b.revision} AND d.revision=${b.revision} AND d.source_hash IS NOT DISTINCT FROM ${b.sourceHash} AND d.content_hash=${b.contentHash} AND j.status='running' AND j.kind='detect' AND j.lease_until>now() AND job_authorized(j.id) FOR UPDATE OF j`);
 if(!job)throw new Error('AUTOMATIC_RUNTIME_RULE_STALE');
 await rows(db,sql`UPDATE jobs SET runtime_rule_accepting=false WHERE id=${b.job}`);
 const messages=await rows(db,sql`DELETE FROM runtime_rule_deliveries WHERE job_id=${b.job} AND generation=${b.generation} RETURNING *`),result:RuntimeWhitelist[]=[];
 for(const message of messages.sort((a,c)=>BigInt(a.delivery_seq)<BigInt(c.delivery_seq)?-1:BigInt(a.delivery_seq)>BigInt(c.delivery_seq)?1:0)){if(message.revision!==b.revision||message.source_hash!==b.sourceHash||message.content_hash!==b.contentHash||message.owner_id!==b.user||message.document_id!==b.document)throw new Error('AUTOMATIC_RUNTIME_RULE_MISMATCH');let body:string;try{body=unseal(message.payload,aad(b,message.id));}catch{throw new Error('AUTOMATIC_RUNTIME_RULE_MISMATCH');}if(hash(body)!==message.payload_hash)throw new Error('AUTOMATIC_RUNTIME_RULE_MISMATCH');const rules:unknown=JSON.parse(body);if(!Array.isArray(rules)||rules.some(r=>!r||typeof r.entityType!=='string'||!r.entityType.trim()||!r.entityType.isWellFormed()||r.entityType.includes('\0')||typeof r.pattern!=='string'||!r.pattern.trim()||!r.pattern.isWellFormed()||r.pattern.includes('\0')))throw new Error('AUTOMATIC_RUNTIME_RULE_MISMATCH');result.push(...rules);}
 return result;
}
export async function discardAutomaticRuntimeRules(db:DB,b:AutomaticRuntimeRuleBinding):Promise<void>{await rows(db,sql`SELECT discard_owned_runtime_rule_deliveries(${b.job}::uuid,${b.generation}::integer)`);}
