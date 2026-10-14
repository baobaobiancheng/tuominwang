import { projectPresetSchema, type ProjectPresetPolicy } from '../contracts/presets.ts';
import { unseal } from './storage.ts';
export function readProjectPresets(project: {id:string;tenant_id:string;preset_revision?:number;preset_policy?:string|null}): ProjectPresetPolicy {
  if (!project.preset_policy) return {revision:project.preset_revision??0,profile:null,ruleset:null};
  const policy=projectPresetSchema.parse(JSON.parse(unseal(project.preset_policy,`${project.tenant_id}:${project.id}:presets`)));
  if(policy.revision!==project.preset_revision)throw new Error('PRESET_POLICY_MISMATCH');
  return policy;
}
