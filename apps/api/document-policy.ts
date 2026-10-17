import{isWordFormat}from'../../packages/core/document-format.ts';
import type {FastifyRequest,FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id} from '../../packages/contracts/index.ts';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {rows,sql,type DB} from '../../packages/adapters/db.ts';
import {seal} from '../../packages/adapters/storage.ts';
import {documentConfigurationSchema,documentPolicySchema,type DocumentConfiguration} from '../../packages/contracts/document-policy.ts';
import type {Profile,RuleSet} from '../../packages/contracts/presets.ts';
import {getPreset,getProjectPresetPolicy,invalidatePresetProject} from './presets.ts';
import {defaultProfile,profileForFormat,applyConfigurationProfileFields} from '../../packages/core/presets.ts';
import {requirePermission,projectScope} from './access.ts';
import {resolveDocumentPolicy} from '../../packages/adapters/document-policy.ts';
function fail(message:string,statusCode=409):never{throw Object.assign(new Error(message),{statusCode});}
const profileFields=['entityTypes','pseudonymRules','exportMode','maskStyle','removeImages','removeHeaderFooter','commentHandlingMode','outputFormats'] as const;
function changedProfileField(before:DocumentConfiguration,after:DocumentConfiguration){return profileFields.some(key=>!isDeepStrictEqual(before[key],after[key]));}
// Caller uses projectScope and holds the project lock; this changes only the named document.
export async function applyDocumentConfiguration(db:DB,req:FastifyRequest,documentId:string,configuration:unknown,batch=true,rebindRuleset=false,rebindProfile=false){
  const config=documentConfigurationSchema.parse(configuration),[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${documentId} FOR UPDATE`);
  if(!d)fail('NOT_FOUND',404);await requirePermission(db,d.project_id,['review']);
  if((await rows(db,sql`SELECT id FROM jobs WHERE document_id=${documentId} AND status IN('queued','running')`)).length)fail('JOB_ACTIVE');
  const [project]=await rows(db,sql`SELECT * FROM projects WHERE id=${d.project_id} FOR UPDATE`);if(!project)fail('NOT_FOUND',404);
  const existing=getProjectPresetPolicy(project);
  const prior=resolveDocumentPolicy(d,existing).documentPolicy;
  const sameProfile=!!prior&&config.profileId===prior.configuration.profileId;
  let baseProfile:Profile|undefined,legacyEffective:Profile|undefined;
  if(sameProfile&&!rebindProfile){
    if(prior!.baseProfile)baseProfile=prior!.baseProfile;
    else if(changedProfileField(prior!.configuration,config))fail('PROFILE_BASE_UNAVAILABLE',400);
    else legacyEffective=prior!.profile;
  }else baseProfile=config.profileId
    ?(await getPreset<Profile>(db,req,'profile',config.profileId)).settings
    :existing.profile?.settings??defaultProfile();
  const profile:Profile=structuredClone(legacyEffective??baseProfile!);
  // A document already owns an authenticated, sealed ruleset snapshot. Merely
  // echoing its selection cannot silently refresh a private directory entry.
  const unchangedSelection=!!prior&&config.rulesetId===prior.configuration.rulesetId&&!rebindRuleset;
  let ruleset:RuleSet|null=unchangedSelection?prior!.ruleset:existing.ruleset?.settings??null;
  if(unchangedSelection&&config.rulesetId&&ruleset?.id!==config.rulesetId)fail('PRESET_POLICY_MISMATCH');
  // Rebinding an inherited project selection refreshes that project's sealed
  // snapshot. Rebinding an explicit "no rules" choice has no target.
  if(rebindRuleset&&config.rulesetId===null)fail('RULESET_REBIND_REQUIRES_SELECTION',400);
  if(!unchangedSelection&&(rebindRuleset||config.rulesetId!==undefined||!!prior)){
    await requirePermission(db,d.project_id,['manage_dictionary']);
    if(config.rulesetId===undefined)ruleset=existing.ruleset?.settings??null;
    else if(config.rulesetId===null)ruleset=null;
    else ruleset=(await getPreset<RuleSet>(db,req,'ruleset',config.rulesetId)).settings;
  }
  const fileKind=isWordFormat(d.source_format)?'docx':d.source_format==='pdf'?'pdf':['png','jpg','jpeg'].includes(d.source_format)?'image':'markdown';
  // Validate every request, including an older sealed policy without a base.
  // The latter keeps its effective profile but must not bypass input guards.
  if(config.pseudonymRules){
    const expected=Object.values(config.pseudonymRules).some(v=>v!=="pseudonym")?"selective_pseudonym":"custom_pseudonym";
    if(config.exportMode && config.exportMode!==expected && !(expected==="custom_pseudonym"&&config.exportMode==="default_pseudonym"))fail("CONFIG_MODE_CONFLICT",400);
  }
  if(config.outputFormats){
    const allowed=d.source_format==='doc'?['doc','docx','md']:d.source_format==='wps'?['docx','md']:d.source_format==='docx'?['docx','md']:d.source_format==='pdf'?['pdf','docx','md']:fileKind==='image'?['png','md']:d.source_format==='txt'?['txt','md']:[d.source_format];
    if(config.outputFormats.some(f=>!allowed.includes(f)))fail('UNSUPPORTED_OUTPUT_FORMAT',400);
  }
  if(!legacyEffective)applyConfigurationProfileFields(profile,config,d.source_format);
  // The file owns a complete immutable copy. No personal template or other material is modified.
  profile.id=randomUUID();profile.source='user';profile.readonly=false;
  const revision=d.document_policy_revision+1,policy=documentPolicySchema.parse({revision,profile,...baseProfile?{baseProfile}: {},ruleset,configuration:config,batch});
  await rows(db,sql`UPDATE documents SET document_policy=${seal(JSON.stringify(policy),`${d.tenant_id}:${d.project_id}:${d.id}:document-policy`)},document_policy_revision=${revision},state='outdated',revision=revision+1 WHERE id=${d.id}`);
  await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'document_policy_applied',${d.id})`);
  return {id:d.id,revision:d.revision+1,policyRevision:revision};
}
export function registerDocumentPolicyRoutes(app:FastifyInstance){
  app.get('/api/documents/:id/configuration',async req=>{
    const doc=id.parse((req.params as any).id);
    return projectScope(req,{document:doc},['view_original'],async(db,projectId)=>{
      const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc}`);if(!d)fail('NOT_FOUND',404);
      const [project]=await rows(db,sql`SELECT * FROM projects WHERE id=${projectId}`);if(!project)fail('NOT_FOUND',404);
      const result=resolveDocumentPolicy(d,getProjectPresetPolicy(project));
      const configuration=result.documentPolicy?.configuration??{},profile=result.presetPolicy.profile?.settings??defaultProfile();
      const format=profileForFormat(profile,d.source_format,result.batchMode);
      const word=isWordFormat(d.source_format),visual=d.source_format==='pdf'||['png','jpg','jpeg'].includes(d.source_format);
      // These are optional artifacts. The worker always publishes its primary
      // format, even when outputFormats lists only an additional format.
      const requested=configuration.outputFormats;
      const markdown=d.source_format==='txt'
        ? requested?.includes('md')===true
        : word||visual
          ? requested?requested.includes('md'):format.exportMarkdown===true
          : false;
      const pdfDocx=d.source_format==='pdf'&&(requested?requested.includes('docx'):profile.pdf.exportPdfAsDocx===true);
      const legacyDoc=d.source_format==='doc'&&requested?.includes('doc')===true;
      const appliedRuleset=result.presetPolicy.ruleset?.settings;
      return {revision:d.revision,configuration,batch:result.batchMode,effective:{
        profile:{name:profile.name,enabledEntityTypeIds:profile.enabledEntityTypeIds,pseudonymTypeActions:profile.pseudonymTypeActions,
          hasAppliedDocumentProfile:!!result.documentPolicy,
          baseSnapshotAvailable:!!result.documentPolicy?.baseProfile,
          mode:configuration.exportMode??format.defaultMode,
          word:word?{removeImages:profile.docx.removeImages,removeHeaderFooter:profile.docx.removeHeaderFooter,commentHandlingMode:profile.docx.commentHandlingMode}:null,
          visualMaskStyle:visual?(d.source_format==='pdf'?profile.pdf.maskStyle:profile.image.maskStyle):null},
        additionalOutputs:{markdown,pdfDocx,legacyDoc},
        unifiedPseudonyms:configuration.unifiedPseudonyms!==false,
        ruleset:{selection:configuration.rulesetId===undefined?'project':configuration.rulesetId===null?'none':'material',
          applied:appliedRuleset?{id:appliedRuleset.id,name:appliedRuleset.name}:null,
          fromSealedDocumentSnapshot:!!result.documentPolicy}
      }};
    });
  });
  app.post('/api/documents/:id/configuration',async req=>{
    const doc=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),configuration:documentConfigurationSchema,rebindRuleset:z.boolean().optional(),rebindProfile:z.boolean().optional()}).strict().parse(req.body);
    return projectScope(req,{document:doc},['view_original','review'],async db=>{
      const [d]=await rows(db,sql`SELECT revision,is_batch FROM documents WHERE id=${doc} FOR UPDATE`);if(!d)fail('NOT_FOUND',404);if(d.revision!==input.revision)fail('VERSION_CONFLICT');
      return applyDocumentConfiguration(db,req,doc,input.configuration,d.is_batch,input.rebindRuleset??false,input.rebindProfile??false);
    });
  });
}
