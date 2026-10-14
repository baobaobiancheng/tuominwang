import {z} from 'zod';
import {id} from './index.ts';
import {profileSchema,rulesetSchema,presetEntityType} from './presets.ts';
export const documentTypeSchema=z.enum(['auto','general','contract','disclosure','judgment','pleading','official_letter','screenshot']);
export const documentConfigurationSchema=z.object({
  profileId:z.union([id,z.literal('system_default')]).optional(),rulesetId:id.nullable().optional(),documentType:documentTypeSchema.optional(),
  referenceStrategy:z.enum(['modern','legacy']).optional(),fragmentRecomposer:z.boolean().optional(),
  exportMode:z.enum(['default_star','full_star','default_pseudonym','custom_pseudonym','selective_pseudonym']).optional(),
  entityTypes:z.array(presetEntityType).min(1).max(26).refine(v=>new Set(v).size===v.length).optional(),
  pseudonymPrefixes:z.partialRecord(presetEntityType,z.string().regex(/^[\p{L}_-]{1,20}$/u)).optional(),
  pseudonymRules:z.partialRecord(presetEntityType,z.enum(['mask','pseudonym','partial_star','full_star'])).optional(),
  maskStyle:z.enum(['black','white','purple','lightGray']).optional(),removeImages:z.boolean().optional(),removeHeaderFooter:z.boolean().optional(),
  commentHandlingMode:z.enum(['remove','anonymize','keep']).optional(),outputFormats:z.array(z.enum(['txt','md','csv','docx','xlsx','pdf','png'])).min(1).max(7).refine(v=>new Set(v).size===v.length).optional(),
  unifiedPseudonyms:z.boolean().optional(),batchResultMode:z.enum(['individual','combined']).optional(),
}).strict().refine(c => !c.pseudonymPrefixes || new Set(Object.values(c.pseudonymPrefixes)).size === Object.values(c.pseudonymPrefixes).length, {message:"Duplicate pseudonym prefixes"});
export type DocumentConfiguration=z.infer<typeof documentConfigurationSchema>;
export const documentPolicySchema=z.object({revision:z.number().int().positive(),profile:profileSchema,ruleset:rulesetSchema.nullable(),configuration:documentConfigurationSchema,batch:z.boolean()}).strict();
export type DocumentPolicy=z.infer<typeof documentPolicySchema>;
