import {documentPolicySchema} from '../contracts/document-policy.ts';
import type {ProjectPresetPolicy} from '../contracts/presets.ts';
import {unseal} from './storage.ts';
export function resolveDocumentPolicy(d:any,projectPolicy:ProjectPresetPolicy){
  if(!d.document_policy)return {presetPolicy:projectPolicy,documentPolicy:null,batchMode:!!d.is_batch};
  const documentPolicy=documentPolicySchema.parse(JSON.parse(unseal(d.document_policy,`${d.tenant_id}:${d.project_id}:${d.id}:document-policy`)));
  if(documentPolicy.revision!==d.document_policy_revision)throw new Error('PRESET_POLICY_MISMATCH');
  return {documentPolicy,batchMode:documentPolicy.batch,presetPolicy:{revision:projectPolicy.revision,profile:{revision:documentPolicy.revision,settings:documentPolicy.profile},ruleset:documentPolicy.ruleset?{revision:documentPolicy.revision,settings:documentPolicy.ruleset}:null} satisfies ProjectPresetPolicy};
}
