import{isWordFormat}from'../../packages/core/document-format.ts';
import type {FastifyRequest,FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id} from '../../packages/contracts/index.ts';
import {randomUUID} from 'node:crypto';
import {rows,sql,type DB} from '../../packages/adapters/db.ts';
import {seal} from '../../packages/adapters/storage.ts';
import {documentConfigurationSchema,documentPolicySchema} from '../../packages/contracts/document-policy.ts';
import type {Profile,RuleSet} from '../../packages/contracts/presets.ts';
import {getPreset,getProjectPresetPolicy,invalidatePresetProject} from './presets.ts';
import {defaultProfile} from '../../packages/core/presets.ts';
import {requirePermission,projectScope} from './access.ts';
import {resolveDocumentPolicy} from '../../packages/adapters/document-policy.ts';
function fail(message:string,statusCode=409):never{throw Object.assign(new Error(message),{statusCode});}
function missingPreset(error:unknown){return error instanceof Error&&error.message==='NOT_FOUND'&&(error as Error&{statusCode?:number}).statusCode===404;}
// Caller uses projectScope and holds the project lock; this changes only the named document.
export async function applyDocumentConfiguration(db:DB,req:FastifyRequest,documentId:string,configuration:unknown,batch=true){
  const config=documentConfigurationSchema.parse(configuration),[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${documentId} FOR UPDATE`);
  if(!d)fail('NOT_FOUND',404);await requirePermission(db,d.project_id,['review']);
  if((await rows(db,sql`SELECT id FROM jobs WHERE document_id=${documentId} AND status IN('queued','running')`)).length)fail('JOB_ACTIVE');
  const [project]=await rows(db,sql`SELECT * FROM projects WHERE id=${d.project_id} FOR UPDATE`);if(!project)fail('NOT_FOUND',404);
  const existing=getProjectPresetPolicy(project);
  const prior=resolveDocumentPolicy(d,existing).documentPolicy;
  let selectedProfile:Profile=existing.profile?.settings??defaultProfile();
  if(config.profileId){
    try{selectedProfile=(await getPreset<Profile>(db,req,'profile',config.profileId)).settings;}
    catch(error){
      if(!missingPreset(error)||!prior||prior.configuration.profileId!==config.profileId)throw error;
      selectedProfile=prior.profile;
    }
  }
  const profile:Profile=structuredClone(selectedProfile);
  let ruleset:RuleSet|null=existing.ruleset?.settings??null;
  if(config.rulesetId!==undefined){
    await requirePermission(db,d.project_id,['manage_dictionary']);
    if(!config.rulesetId)ruleset=null;
    else{
      try{ruleset=(await getPreset<RuleSet>(db,req,'ruleset',config.rulesetId)).settings;}
      catch(error){
        if(!missingPreset(error)||!prior?.ruleset||prior.configuration.rulesetId!==config.rulesetId)throw error;
        ruleset=prior.ruleset;
      }
    }
  }
  const fileKind=isWordFormat(d.source_format)?'docx':d.source_format==='pdf'?'pdf':['png','jpg','jpeg'].includes(d.source_format)?'image':'markdown';
  if(config.entityTypes)profile.enabledEntityTypeIds=config.entityTypes;
  if(config.pseudonymRules){
    const expected=Object.values(config.pseudonymRules).some(v=>v!=="pseudonym")?"selective_pseudonym":"custom_pseudonym";
    if(config.exportMode && config.exportMode!==expected && !(expected==="custom_pseudonym"&&config.exportMode==="default_pseudonym"))fail("CONFIG_MODE_CONFLICT",400);
    config.exportMode??=expected;profile.pseudonymTypeActions=config.pseudonymRules;
  }
  if(config.exportMode){
    if(fileKind==='pdf'||fileKind==='image'){
      profile[fileKind].defaultMode=config.exportMode==='full_star'?'default_star':config.exportMode;
      if(config.exportMode==='full_star')profile.pseudonymTypeActions=Object.fromEntries(profile.enabledEntityTypeIds.map(k=>[k,'full_star']));
    }else profile[fileKind].defaultMode=config.exportMode;
    if(fileKind==='pdf')profile.batch.pdfDefaultMode=profile.pdf.defaultMode;
    else if(fileKind==='image')profile.batch.imageDefaultMode=profile.image.defaultMode;
    else if(fileKind==='docx')profile.batch.docxDefaultMode=profile.docx.defaultMode;
    else profile.batch.markdownDefaultMode=profile.markdown.defaultMode;
  }
  if(config.maskStyle){profile.pdf.maskStyle=config.maskStyle;profile.image.maskStyle=config.maskStyle;}
  if(config.removeImages!==undefined)profile.docx.removeImages=config.removeImages;
  if(config.removeHeaderFooter!==undefined)profile.docx.removeHeaderFooter=config.removeHeaderFooter;
  if(config.commentHandlingMode)profile.docx.commentHandlingMode=config.commentHandlingMode;
  if(config.outputFormats){
    const allowed=d.source_format==='doc'?['doc','docx','md']:d.source_format==='wps'?['docx','md']:d.source_format==='docx'?['docx','md']:d.source_format==='pdf'?['pdf','docx','md']:fileKind==='image'?['png','md']:d.source_format==='txt'?['txt','md']:[d.source_format];
    if(config.outputFormats.some(f=>!allowed.includes(f)))fail('UNSUPPORTED_OUTPUT_FORMAT',400);
    const markdown=config.outputFormats.includes('md');profile.docx.exportMarkdown=markdown;profile.pdf.exportMarkdown=markdown;profile.image.exportMarkdown=markdown;
    profile.pdf.exportPdfAsDocx=d.source_format==='pdf'&&config.outputFormats.includes('docx');
    profile.batch.exportMarkdownByKind={docx:markdown,pdf:markdown,image:markdown};
  }
  // The file owns a complete immutable copy. No personal template or other material is modified.
  profile.id=randomUUID();profile.source='user';profile.readonly=false;
  const revision=d.document_policy_revision+1,policy=documentPolicySchema.parse({revision,profile,ruleset,configuration:config,batch});
  await rows(db,sql`UPDATE documents SET document_policy=${seal(JSON.stringify(policy),`${d.tenant_id}:${d.project_id}:${d.id}:document-policy`)},document_policy_revision=${revision},state='outdated',revision=revision+1 WHERE id=${d.id}`);
  await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'document_policy_applied',${d.id})`);
  return {id:d.id,revision:d.revision+1,policyRevision:revision};
}
export function registerDocumentPolicyRoutes(app:FastifyInstance){
  app.get('/api/documents/:id/configuration',async req=>{
    const doc=id.parse((req.params as any).id);
    return projectScope(req,{document:doc},['view_original'],async db=>{
      const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc}`);if(!d)fail('NOT_FOUND',404);
      const result=resolveDocumentPolicy(d,{revision:0,profile:null,ruleset:null});
      return {revision:d.revision,configuration:result.documentPolicy?.configuration??{},batch:result.batchMode};
    });
  });
  app.post('/api/documents/:id/configuration',async req=>{
    const doc=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),configuration:documentConfigurationSchema}).strict().parse(req.body);
    return projectScope(req,{document:doc},['view_original','review'],async db=>{
      const [d]=await rows(db,sql`SELECT revision,is_batch FROM documents WHERE id=${doc} FOR UPDATE`);if(!d)fail('NOT_FOUND',404);if(d.revision!==input.revision)fail('VERSION_CONFLICT');
      return applyDocumentConfiguration(db,req,doc,input.configuration,d.is_batch);
    });
  });
}
