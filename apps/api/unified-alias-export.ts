import type{FastifyRequest}from'fastify';import{rows,sql,type DB}from'../../packages/adapters/db.ts';import{readUnifiedAliasState,prepareUnifiedAliasState,writeUnifiedAliasState}from'../../packages/adapters/unified-aliases.ts';import{analyzeUnifiedAliasMaterialization,applyUnifiedAliasMaterialization}from'./unified-alias-materialization.ts';import{projectScope,requirePermission,denied}from'./access.ts';
const bindings=async(db:DB,project:string)=>rows(db,sql`SELECT id,revision,content_hash FROM documents WHERE project_id=${project} AND state='review' ORDER BY id`);
/** Source Hm2 flushes before export. A semantic change commits in this separate
 * transaction, then requires human review. Never roll that change back by
 * throwing inside its transaction, and never silently promote an old approval. */
export async function preflightUnifiedAliasExport(req:FastifyRequest,document:string,revision:number){
 return projectScope(req,{document},['export'],async(db,project)=>{
  const[d]=await rows(db,sql`SELECT revision,state FROM documents WHERE id=${document}`);if(!d||d.revision!==revision)denied('VERSION_CONFLICT',409);
  const previous=await readUnifiedAliasState(db,req.user.tenant_id,project);if(!previous.frame?.enabled)return null;if(d.state!=='review')denied(d.state==='outdated'?'POLICY_CHANGED':'DETECTION_INCOMPLETE',409);
  const documents=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id FOR UPDATE`),{state,contexts}=await prepareUnifiedAliasState(db,req.user.tenant_id,project,documents,previous.frame),plan=await analyzeUnifiedAliasMaterialization(db,project,state,contexts);
  let changedDocuments:Record<string,number>={},stateRevision=previous.revision;
  if(plan.changedDocumentIds.length){await requirePermission(db,project,['view_original','review','view_mapping']);changedDocuments=await applyUnifiedAliasMaterialization(db,{tenantId:req.user.tenant_id,projectId:project,userId:req.user.id},plan);stateRevision=await writeUnifiedAliasState(db,req.user.tenant_id,project,previous.revision,state);await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'unified_aliases_synchronized',${project})`);}
  return{stateRevision,bindings:await bindings(db,project),changedDocuments};
 });
}
export async function assertUnifiedAliasExportEpoch(db:DB,project:string,epoch:Awaited<ReturnType<typeof preflightUnifiedAliasExport>>){
 const[p]=await rows(db,sql`SELECT tenant_id FROM projects WHERE id=${project}`),state=await readUnifiedAliasState(db,p.tenant_id,project);
 if(!epoch){if(state.frame?.enabled)denied('VERSION_CONFLICT',409);return;}
 if(state.revision!==epoch.stateRevision||JSON.stringify(await bindings(db,project))!==JSON.stringify(epoch.bindings))denied('VERSION_CONFLICT',409);
}
