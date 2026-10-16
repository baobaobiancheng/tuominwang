import{runUnifiedEntityAction,runUnifiedEntityAudit,entityActionCommandSchema,entityAuditCommandSchema}from'./unified-entity-actions.ts';
import{unifiedAliasFrameSchema}from'../../packages/core/reference-alias-state-schema.ts';
import{analyzeUnifiedAliasMaterialization,applyUnifiedAliasMaterialization}from'./unified-alias-materialization.ts';
import type{FastifyInstance}from'fastify';import{z}from'zod';import{isDeepStrictEqual}from'node:util';
import{id,REVIEW_BODY_BYTES,type Mark}from'../../packages/contracts/index.ts';import{validAliasToken}from'../../packages/contracts/alias-token.ts';
import{rows,sql}from'../../packages/adapters/db.ts';import{entityIdentity}from'../../packages/core/entity-identity.ts';
import{canonicalReferenceAliasEntity,type InheritedAliasSnapshot}from'../../packages/core/reference-alias-lifecycle.ts';
import{readUnifiedAliasState,writeUnifiedAliasState,prepareUnifiedAliasState,aliasFail}from'../../packages/adapters/unified-aliases.ts';
import{createAliasGroupVersion,type MappingVersionInput}from'../../packages/adapters/alias-groups.ts';import{projectScope}from'./access.ts';import{saveReview}from'./reviews.ts';
const text=z.string().min(1).refine(v=>v.isWellFormed()&&!v.includes('\0')),token=z.string().refine(validAliasToken),rev=z.number().int().nonnegative();
const command=z.discriminatedUnion('action',[
 z.object({action:z.literal('enable')}),z.object({action:z.literal('disable')}),z.object({action:z.literal('flush')}),
 z.object({action:z.literal('token'),key:text,token,scope:z.enum(['all','document']),documentId:id.optional()}),
 z.object({action:z.literal('reset'),keys:z.array(text).min(1)}),z.object({action:z.literal('merge'),keys:z.array(text).min(2),token}),
 z.object({action:z.literal('unmerge'),key:text}),z.object({action:z.literal('split-merged'),key:text,keys:z.array(text).min(1)}),
 z.object({action:z.literal('split'),key:text,documentIds:z.array(id).min(1)}),z.object({action:z.literal('unsplit'),key:text,token}),
 z.object({action:z.literal('split-token'),key:text,oldToken:token,token}),
 z.object({action:z.literal('style'),documentId:id,style:z.enum(['default','custom','selective']),keys:z.array(text).optional()}),
 z.object({action:z.literal('inherit'),profile:z.object({schemaVersion:z.literal(1),entries:z.array(z.object({key:text,canonicalKey:text,token}).strict()),reservedTokens:z.array(token).optional()}).strict()}),
 z.object({action:z.literal('add-entity'),text:z.string().trim().min(1).max(2000).refine(v=>v.isWellFormed()&&!v.includes('\0')),type:text}).strict(),
 z.object({action:z.literal('delete-entity'),keys:z.array(text).min(1)}).strict(),
 z.object({action:z.literal('audit-entity'),text,type:text}).strict(),
 z.object({action:z.literal('apply-audit-entity'),text,type:text,operation:z.enum(['add-uncovered','replace-other-all','replace-other-one']),target:z.object({documentId:id,start:z.number().int().nonnegative(),end:z.number().int().positive(),hitId:z.string().optional()}).strict().optional()}).strict()
]);
const input=z.object({revision:rev,documents:z.array(z.object({id,revision:rev,contentHash:z.string().regex(/^[a-f0-9]{64}$/u)}).strict()),command}).strict();
export function registerUnifiedAliasRoutes(app:FastifyInstance){
 app.post('/api/projects/:id/unified-aliases/preview',{bodyLimit:REVIEW_BODY_BYTES},async req=>{const project=id.parse((req.params as any).id),body=input.parse(req.body);if(body.command.action!=='add-entity'&&body.command.action!=='delete-entity'&&body.command.action!=='audit-entity')aliasFail('INVALID_ENTITY_ACTION',400);return projectScope(req,{project},['view_original','view_mapping','review'],async db=>{const documents=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id FOR SHARE`),previous=await readUnifiedAliasState(db,req.user.tenant_id,project);if(body.revision!==previous.revision)aliasFail('VERSION_CONFLICT');if(body.documents.length!==documents.length||new Set(body.documents.map(d=>d.id)).size!==documents.length||documents.some(d=>!body.documents.some(w=>w.id===d.id&&w.revision===d.revision&&w.contentHash===d.content_hash)))aliasFail('VERSION_CONFLICT');return body.command.action==='audit-entity'?runUnifiedEntityAudit(db,req.user,project,documents,previous,entityAuditCommandSchema.parse(body.command)):runUnifiedEntityAction(db,req.user,project,documents,previous,entityActionCommandSchema.parse(body.command),false);});});
 app.get('/api/projects/:id/unified-aliases',async req=>{const project=id.parse((req.params as any).id);return projectScope(req,{project},['view_original','view_mapping'],async db=>{const documents=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id FOR SHARE`),previous=await readUnifiedAliasState(db,req.user.tenant_id,project),{state}=await prepareUnifiedAliasState(db,req.user.tenant_id,project,documents,previous.frame);return{revision:previous.revision,enabled:state.isUnifiedMode,rows:state.allProjectEntities,documents:documents.map(d=>({id:d.id,revision:d.revision,contentHash:d.content_hash})),snapshot:state.toSnapshot(),inheritance:state.registry.snapshot()};});});
 app.post('/api/projects/:id/unified-aliases',{bodyLimit:REVIEW_BODY_BYTES},async req=>{const project=id.parse((req.params as any).id),body=input.parse(req.body);return projectScope(req,{project},['view_original','view_mapping','review'],async db=>{const documents=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id FOR UPDATE`),previous=await readUnifiedAliasState(db,req.user.tenant_id,project);if(body.revision!==previous.revision)aliasFail('VERSION_CONFLICT');if(body.documents.length!==documents.length||new Set(body.documents.map(d=>d.id)).size!==documents.length||documents.some(d=>!body.documents.some(w=>w.id===d.id&&w.revision===d.revision&&w.contentHash===d.content_hash)))aliasFail('VERSION_CONFLICT');const{state,contexts}=await prepareUnifiedAliasState(db,req.user.tenant_id,project,documents,previous.frame),c=body.command,knownKeys=new Set([...state.sharedMapping.keys(),...state.defaultMapping.keys()]),knownDocs=new Set(documents.map(d=>d.id));
 if(c.action==='add-entity'||c.action==='delete-entity')return runUnifiedEntityAction(db,req.user,project,documents,previous,c,true);
 if(c.action==='apply-audit-entity')return runUnifiedEntityAudit(db,req.user,project,documents,previous,entityAuditCommandSchema.parse(c));
 if(c.action==='audit-entity')aliasFail('INVALID_ENTITY_ACTION',400);
 const requiredKeys='keys'in c?c.keys??[]:'key'in c?[c.key]:[];if(requiredKeys.some(k=>!knownKeys.has(k)))aliasFail('ALIAS_ENTITY_NOT_FOUND',404);if('documentId'in c&&c.documentId&&!knownDocs.has(c.documentId)||'documentIds'in c&&c.documentIds.some(d=>!knownDocs.has(d)))aliasFail('NOT_FOUND',404);
 if(c.action==='enable')state.isUnifiedMode=true;
 else if(c.action==='disable')state.isUnifiedMode=false;
 else if(c.action==='inherit'){state.registry.set(c.profile as InheritedAliasSnapshot);for(const ctx of contexts)state.registerFileEntities(ctx.document.id,ctx.name,ctx.entities);}
 else if(c.action==='token'){const conflict=state.findTokenConflict(c.key,c.token);if(conflict)throw Object.assign(new Error('ALIAS_TOKEN_CONFLICT'),{statusCode:409,conflict});if(c.scope==='document'){if(!c.documentId)aliasFail('DOCUMENT_REQUIRED',400);state.setTokenForFile(c.key,c.documentId,c.token);}else state.updateToken(c.key,c.token);}
 else if(c.action==='reset')for(const key of c.keys)state.resetTokenToDefault(key);
 else if(c.action==='merge')state.merge(c.keys,c.token);
 else if(c.action==='unmerge')state.unmerge(c.key);
 else if(c.action==='split-merged')state.splitMergedKeys(c.key,c.keys);
 else if(c.action==='split')state.split(c.key,c.documentIds);
 else if(c.action==='unsplit')state.mergeBack(c.key,c.token);
 else if(c.action==='split-token'){const conflict=state.findTokenConflict(c.key,c.token);if(conflict)aliasFail('ALIAS_TOKEN_CONFLICT');state.updateSplitToken(c.key,c.oldToken,c.token);}
 else if(c.action==='style')state.setDocumentPseudonymStyle(c.documentId,c.style,c.keys);
 if(!unifiedAliasFrameSchema.safeParse({version:1,enabled:state.isUnifiedMode,state:state.toSnapshot(),inheritance:state.registry.snapshot()}).success)aliasFail('ALIAS_STATE_INVALID',400);
 const plan=await analyzeUnifiedAliasMaterialization(db,project,state,contexts,{activate:c.action==='enable'}),changed=await applyUnifiedAliasMaterialization(db,{tenantId:req.user.tenant_id,projectId:project,userId:req.user.id},plan);
 const revision=await writeUnifiedAliasState(db,req.user.tenant_id,project,previous.revision,state);await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id)VALUES(${req.user.tenant_id},${project},${req.user.id},'unified_aliases_changed',${project})`);return{revision,enabled:state.isUnifiedMode,rows:state.allProjectEntities,changedDocuments:changed,documents:documents.map(d=>({id:d.id,revision:changed[d.id]??d.revision,contentHash:d.content_hash}))};});});
}
