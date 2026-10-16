import {z} from 'zod';
import type {DB} from '../../packages/adapters/db.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {prepareUnifiedAliasState,readUnifiedAliasState,writeUnifiedAliasState,aliasFail} from '../../packages/adapters/unified-aliases.ts';
import {canonicalReferenceAliasEntity,referenceAliasKey} from '../../packages/core/reference-alias-lifecycle.ts';
import {sourceEntityMark,sameEntity} from '../../packages/core/entity-identity.ts';
import {auditOccurrences,auditVisualOccurrences,sourceAuditSameValue} from './project-entities.ts';
import {findProjectEntity} from '../../packages/core/reference-project-search.ts';
import {validateFileMarks} from '../../packages/core/files.ts';
import {readReviewProvenance} from '../../packages/adapters/review-provenance.ts';
import {addReviewEntityHints} from '../../packages/core/review-entity-slots.ts';
import {saveReview} from './reviews.ts';
import {openPageReview} from '../../packages/adapters/page-review-storage.ts';
import {pruneEntityGeometryRegions} from '../../packages/contracts/entity-geometry.ts';
import {analyzeUnifiedAliasMaterialization,applyUnifiedAliasMaterialization} from './unified-alias-materialization.ts';
import {MAX_MARKS,type Mark} from '../../packages/contracts/index.ts';
import type {KnownEntitySeed} from '../../packages/core/review-tools.ts';

const text=z.string().trim().min(1).max(2000).refine(v=>v.isWellFormed()&&!v.includes('\0'));
export const entityActionCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('add-entity'),text,type:text}).strict(),
 z.object({action:z.literal('delete-entity'),keys:z.array(text).min(1)}).strict()
]);
export type EntityActionCommand=z.infer<typeof entityActionCommandSchema>;
export const entityAuditCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('audit-entity'),text,type:text}).strict(),
 z.object({action:z.literal('apply-audit-entity'),text,type:text,operation:z.enum(['add-uncovered','replace-other-all','replace-other-one']),target:z.object({documentId:z.string().uuid(),start:z.number().int().nonnegative(),end:z.number().int().positive(),hitId:z.string().optional()}).strict().optional()}).strict()
]);
export type EntityAuditCommand=z.infer<typeof entityAuditCommandSchema>;
type Context=Awaited<ReturnType<typeof prepareUnifiedAliasState>>['contexts'][number];
type PlanRow={context:Context;next:Mark[];occurrences:number;skipped:string[]};
const normalizeKey=(key:string)=>referenceAliasKey(key);
function sourceType(uiType:string){
 if(!uiType.startsWith('raw_'))return uiType;
 try{const raw=decodeURIComponent(uiType.slice(4));if(raw&&`raw_${encodeURIComponent(raw)}`===uiType)return raw;}catch{}
 aliasFail('INVALID_ENTITY_TYPE',400);
}
function identityKey(entity:{type:string;text?:string;rawEntityType?:string}){
 return canonicalReferenceAliasEntity({type:entity.type,text:entity.text??'',...entity.rawEntityType!==undefined?{rawEntityType:entity.rawEntityType}:{}});
}
/** Source panel semantics: split rows address their parent; merged rows address
 * every underlying key. A missing visible row is a stale selection. */
function selectedKeys(state:Awaited<ReturnType<typeof prepareUnifiedAliasState>>['state'],keys:string[]){
 const visible=new Map(state.allProjectEntities.map(row=>[row.key,row])),selected=new Set<string>();
 for(const key of keys){const row=visible.get(key);if(!row)aliasFail('ALIAS_ENTITY_NOT_FOUND',404);
  for(const underlying of row.isSplitEntry?[row.splitFromKey!]:[row.key,...row.mergedKeys])selected.add(normalizeKey(underlying));
 }
 return selected;
}
function plannedDelete(context:Context,keys:Set<string>):PlanRow{
 const d=context.document,marks=d.marks as Mark[],entities=context.entities,next=[...marks];let occurrences=0;
 for(const [index,mark] of marks.entries()){
  if(mark.decision==='ignore')continue;
  const entity=entities[index],identity=entity&&identityKey({type:entity.type,text:entity.text,rawEntityType:entity.rawEntityType});
  if(identity&&(keys.has(normalizeKey(identity.key))||keys.has(normalizeKey(identity.groupKey)))){next[index]={...mark,decision:'ignore'};occurrences++;}
 }
 return{context,next,occurrences,skipped:[]};
}
/** Renderer Tf2 text covering: partial different-type overlap is replaceable;
 * a partial same-type match does not claim the whole searched occurrence. */
function panelTextOccurrences(context:Context,seed:KnownEntitySeed){
 const d=context.document,marks=d.marks as Mark[],result:ReturnType<typeof auditOccurrences>=[];
 for(const hit of findProjectEntity(context.text,seed.value,{literalOnly:['csv','xlsx'].includes(d.source_format),maxMatches:MAX_MARKS})){
  const {start,end}=hit,active=marks.map((mark,index)=>({mark,index,value:context.entities[index]?.text??context.text.slice(mark.start,mark.end)})).filter(({mark})=>mark.decision!=='ignore'&&mark.hiddenByType!==true&&mark.start<end&&mark.end>start);
  const equivalent=({mark,value}:typeof active[number])=>sameEntity(mark,seed)&&sourceAuditSameValue(value,seed.value);
  const same=active.find(entry=>equivalent(entry)&&entry.mark.start<=start&&entry.mark.end>=end),other=active.find(entry=>!equivalent(entry));
  const retained=marks.some(mark=>mark.decision==='ignore'&&mark.start<=start&&mark.end>=end);
  let category:'same'|'other'|'retained'|'uncovered'|'conflict'=same?'same':other?'other':retained?'retained':'uncovered';
  if(category==='uncovered')try{validateFileMarks(context.text,[{start,end,kind:seed.kind,...seed.rawEntityType!==undefined?{rawEntityType:seed.rawEntityType}:{},decision:'pending',sources:[{layer:'manual',code:'project-entity-add'}]}],d.source_format,d.anchors);}catch(error){if(['CROSS_CELL_MARK','CROSS_OBJECT_MARK'].includes((error as Error).message))category='conflict';else throw error;}
  result.push({value:seed.value,kind:seed.kind,...seed.rawEntityType!==undefined?{rawEntityType:seed.rawEntityType}:{},start,end,category,...other?{otherIndex:other.index}:{}});
 }
 return result;
}
async function plannedAdd(context:Context,command:Extract<EntityActionCommand,{action:'add-entity'}>,deadline:number):Promise<PlanRow>{
 const d=context.document,before=d.marks as Mark[],identity=sourceEntityMark(sourceType(command.type),command.text),seed:KnownEntitySeed={value:command.text,...identity};
 const textRows=panelTextOccurrences(context,seed),visual=await auditVisualOccurrences(d,[seed],deadline);
 const visualLocations=new Set(visual.rows.map(row=>JSON.stringify([row.start,row.end,row.kind,row.rawEntityType??null])));
 const occurrences=[...textRows.filter(row=>!visualLocations.has(JSON.stringify([row.start,row.end,row.kind,row.rawEntityType??null]))),...visual.rows];
 const next=[...before],seen=new Set<string>();let count=0;
 for(const row of occurrences){
  if(row.category!=='uncovered'&&row.category!=='retained'&&row.category!=='other')continue;
  const signature=JSON.stringify([row.start,row.end,row.kind,row.rawEntityType??null]);if(seen.has(signature))continue;seen.add(signature);
  if(row.category==='retained'){
   const index=next.findIndex((mark,position)=>mark.decision==='ignore'&&mark.start===row.start&&mark.end===row.end&&sameEntity(mark,identity)&&sourceAuditSameValue(context.entities[position]?.text??context.text.slice(mark.start,mark.end),seed.value));
   if(index>=0){next[index]={...next[index],decision:'pending',sources:[...(next[index].sources??[]),{layer:'manual',code:'project-entity-add'}]};count++;continue;}
  }
  next.push({start:row.start,end:row.end,...identity,decision:'pending',sources:[{layer:'manual',code:'project-entity-add'}]});count++;
 }
 return{context,next,occurrences:count,skipped:visual.skipped};
}
export async function runUnifiedEntityAction(db:DB,user:{id:string;tenant_id:string},project:string,documents:any[],previous:Awaited<ReturnType<typeof readUnifiedAliasState>>,command:EntityActionCommand,apply:boolean){
 const {state,contexts}=await prepareUnifiedAliasState(db,user.tenant_id,project,documents,previous.frame);
 if(!state.isUnifiedMode)aliasFail('UNIFIED_ALIAS_DISABLED',409);
 const skippedDocuments=await rows(db,sql`SELECT id,state FROM documents WHERE project_id=${project} AND state<>'review' ORDER BY id`);
 const deadline=Date.now()+120000,keys=command.action==='delete-entity'?selectedKeys(state,command.keys):null,planned:PlanRow[]=[];
 for(const context of contexts){
  if(Date.now()>deadline)aliasFail('PROCESSING_TIMEOUT',400);
  planned.push(command.action==='delete-entity'?plannedDelete(context,keys!):await plannedAdd(context,command,deadline));
 }
 const summary={action:command.action,affectedOccurrences:planned.reduce((n,row)=>n+row.occurrences,0),affectedDocuments:planned.filter(row=>row.occurrences>0).length,documents:planned.filter(row=>row.occurrences>0).map(row=>({id:row.context.document.id,name:row.context.name,occurrences:row.occurrences})),skippedDocuments:[...skippedDocuments,...planned.flatMap(row=>row.skipped.map(reason=>({id:row.context.document.id,state:reason})))]};
 if(!apply)return summary;
 const changedDocuments:Record<string,number>={};
 for(const row of planned){if(!row.occurrences)continue;
  const d=row.context.document,prior=addReviewEntityHints(await readReviewProvenance(db,d),d.marks as Mark[]),next=row.next.map((mark,index)=>index<prior.length?{...mark,reviewEntityId:prior[index].reviewEntityId}:mark);
  const oldPagePolicy=command.action==='delete-entity'?openPageReview(d):null,pagePolicy=oldPagePolicy?pruneEntityGeometryRegions(prior,next.filter(mark=>mark.decision!=='ignore'),oldPagePolicy):undefined;
  changedDocuments[d.id]=(await saveReview(db,user.id,d,next,Math.max(1,Math.min(15000,deadline-Date.now())),true,pagePolicy)).revision;
 }
 if(!summary.affectedOccurrences)return{...summary,revision:previous.revision,enabled:state.isUnifiedMode,rows:state.allProjectEntities,changedDocuments,documents:documents.map(d=>({id:d.id,revision:d.revision,contentHash:d.content_hash}))};
 const updated=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id FOR UPDATE`);
 const fresh=await prepareUnifiedAliasState(db,user.tenant_id,project,updated,previous.frame);
 const materialization=await analyzeUnifiedAliasMaterialization(db,project,fresh.state,fresh.contexts),materialized=await applyUnifiedAliasMaterialization(db,{tenantId:user.tenant_id,projectId:project,userId:user.id},materialization);
 Object.assign(changedDocuments,materialized);
 const finalDocs=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id FOR UPDATE`);
 const final=await prepareUnifiedAliasState(db,user.tenant_id,project,finalDocs,previous.frame);
 const revision=await writeUnifiedAliasState(db,user.tenant_id,project,previous.revision,final.state);
 await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id)VALUES(${user.tenant_id},${project},${user.id},${command.action==='add-entity'?'unified_entity_added':'unified_entity_deleted'},${project})`);
 return{...summary,revision,enabled:final.state.isUnifiedMode,rows:final.state.allProjectEntities,changedDocuments,documents:finalDocs.map(d=>({id:d.id,revision:d.revision,contentHash:d.content_hash}))};
}

type AuditRow={documentId:string;fileName:string;start:number;end:number;source?:string;hitId?:string;page?:number;category:string;otherIndex?:number;covering?:{kind:'other';entityType:string;entityText:string}};
/** Source Rf2/Kf2: read-only classification first; every apply re-runs it against
 * the locked document rows and the complete project CAS. */
export async function runUnifiedEntityAudit(db:DB,user:{id:string;tenant_id:string},project:string,documents:any[],previous:Awaited<ReturnType<typeof readUnifiedAliasState>>,command:EntityAuditCommand){
 const {state,contexts}=await prepareUnifiedAliasState(db,user.tenant_id,project,documents,previous.frame);
 if(!state.isUnifiedMode)aliasFail('UNIFIED_ALIAS_DISABLED',409);
 const identity=sourceEntityMark(sourceType(command.type),command.text),seed:KnownEntitySeed={value:command.text,...identity},deadline=Date.now()+120000;
 const matches:AuditRow[]=[],skippedFiles:{fileId:string;fileName:string;reason:string}[]=[];
 const notReady=await rows(db,sql`SELECT id,state FROM documents WHERE project_id=${project} AND state<>'review' ORDER BY id`);
 for(const d of notReady)skippedFiles.push({fileId:d.id,fileName:d.id,reason:'DETECTION_INCOMPLETE'});
 for(const context of contexts){
  const d=context.document,before=d.marks as Mark[];
  const textRows=panelTextOccurrences(context,seed),visual=await auditVisualOccurrences(d,[seed],deadline);
  for(const reason of visual.skipped)skippedFiles.push({fileId:d.id,fileName:context.name,reason});
  const visualLocations=new Set(visual.rows.map(row=>JSON.stringify([row.start,row.end,row.kind,row.rawEntityType??null])));
  for(const row of [...textRows.filter(row=>!visualLocations.has(JSON.stringify([row.start,row.end,row.kind,row.rawEntityType??null]))),...visual.rows]){
   const other=row.category==='other'&&row.otherIndex!==undefined?before[row.otherIndex]:undefined;
   matches.push({documentId:d.id,fileName:context.name,start:row.start,end:row.end,source:row.source,hitId:row.hitId,page:row.page,category:row.category,...row.otherIndex!==undefined?{otherIndex:row.otherIndex}:{},...other?{covering:{kind:'other' as const,entityType:other.rawEntityType??other.kind,entityText:context.entities[row.otherIndex!]?.text??context.text.slice(other.start,other.end)}}:{}});
  }
 }
 const sameTypeCount=matches.filter(row=>row.category==='same').length,otherTypeMatches=matches.filter(row=>row.category==='other'),uncoveredMatches=matches.filter(row=>row.category==='uncovered'||row.category==='retained');
 const fileSummaries=contexts.map(context=>{const file=matches.filter(row=>row.documentId===context.document.id);return{fileId:context.document.id,fileName:context.name,total:file.length,same:file.filter(row=>row.category==='same').length,other:file.filter(row=>row.category==='other').length,missed:file.filter(row=>row.category==='uncovered'||row.category==='retained').length};}).filter(row=>row.total>0);
 const audit={totalCount:matches.length,sameTypeCount,otherTypeMatches,uncoveredMatches,skippedFiles,fileSummaries};
 if(command.action==='audit-entity')return{audit};
 if(command.operation==='replace-other-one'&&!command.target)aliasFail('AUDIT_TARGET_REQUIRED',400);
 if(command.operation!=='replace-other-one'&&command.target)aliasFail('AUDIT_TARGET_UNEXPECTED',400);
 const selected=command.operation==='add-uncovered'?uncoveredMatches:command.operation==='replace-other-all'?otherTypeMatches:otherTypeMatches.filter(row=>row.documentId===command.target!.documentId&&row.start===command.target!.start&&row.end===command.target!.end&&(row.hitId??undefined)===(command.target!.hitId??undefined));
 if(command.operation==='replace-other-one'&&selected.length!==1)aliasFail('VERSION_CONFLICT');
 const changedDocuments:Record<string,number>={};
 for(const context of contexts){
  const d=context.document,before=d.marks as Mark[],own=selected.filter(row=>row.documentId===d.id);if(!own.length)continue;
  const removed=new Set(own.flatMap(row=>row.category==='other'&&row.otherIndex!==undefined?[row.otherIndex]:[]));
  const prior=addReviewEntityHints(await readReviewProvenance(db,d),before),next:Mark[]=prior.filter((_,index)=>!removed.has(index));
  for(const row of own){
   if(row.category==='retained'){
    const index=next.findIndex((mark,position)=>mark.decision==='ignore'&&mark.start===row.start&&mark.end===row.end&&sameEntity(mark,identity)&&sourceAuditSameValue(context.entities[position]?.text??context.text.slice(mark.start,mark.end),seed.value));
    if(index>=0){next[index]={...next[index],decision:'pending'};continue;}
   }
   next.push({start:row.start,end:row.end,...identity,decision:'pending',sources:[{layer:'manual',code:'project-entity-add'}]});
  }
  const oldPagePolicy=removed.size?openPageReview(d):null,pagePolicy=oldPagePolicy?pruneEntityGeometryRegions(prior,next,oldPagePolicy):undefined;
  changedDocuments[d.id]=(await saveReview(db,user.id,d,next,Math.max(1,Math.min(15000,deadline-Date.now())),true,pagePolicy)).revision;
 }
 if(!Object.keys(changedDocuments).length)return{audit,affectedOccurrences:0,affectedDocuments:0,revision:previous.revision,enabled:state.isUnifiedMode,rows:state.allProjectEntities,changedDocuments,documents:documents.map(d=>({id:d.id,revision:d.revision,contentHash:d.content_hash}))};
 const updated=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id FOR UPDATE`),fresh=await prepareUnifiedAliasState(db,user.tenant_id,project,updated,previous.frame);
 const materialization=await analyzeUnifiedAliasMaterialization(db,project,fresh.state,fresh.contexts),materialized=await applyUnifiedAliasMaterialization(db,{tenantId:user.tenant_id,projectId:project,userId:user.id},materialization);
 Object.assign(changedDocuments,materialized);
 const finalDocs=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id FOR UPDATE`),final=await prepareUnifiedAliasState(db,user.tenant_id,project,finalDocs,previous.frame);
 const revision=await writeUnifiedAliasState(db,user.tenant_id,project,previous.revision,final.state);
 await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id)VALUES(${user.tenant_id},${project},${user.id},'unified_entity_audit_applied',${project})`);
 return{audit,affectedOccurrences:selected.length,affectedDocuments:new Set(selected.map(row=>row.documentId)).size,revision,enabled:final.state.isUnifiedMode,rows:final.state.allProjectEntities,changedDocuments,documents:finalDocs.map(d=>({id:d.id,revision:d.revision,contentHash:d.content_hash}))};
}
