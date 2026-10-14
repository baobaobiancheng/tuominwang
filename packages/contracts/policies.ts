import { z } from "zod";
import { markSchema, replacementSchema, MAX_MARKS } from "./index.ts";
export const policyDirectiveSchema = z.union([
  replacementSchema.options[0], replacementSchema.options[1], replacementSchema.options[2], replacementSchema.options[3], replacementSchema.options[4], replacementSchema.options[5],
  z.object({ mode: z.literal("alias") }).strict(),
]);
export type PolicyDirective = z.infer<typeof policyDirectiveSchema>;
export const replacementPoliciesSchema = z.object({
  overall: policyDirectiveSchema.optional(),
  types: z.array(z.object({ kind: markSchema.shape.kind,rawEntityType:markSchema.shape.rawEntityType, rule: policyDirectiveSchema }).strict().refine(v=>v.rawEntityType===undefined||v.kind==='自定义')).max(MAX_MARKS).default([]),
  values: z.array(markSchema.pick({ start: true, end: true, kind: true,rawEntityType:true }).extend({ rule: policyDirectiveSchema }).strict().refine(v=>v.rawEntityType===undefined||v.kind==='自定义')).max(1000).default([]),
  keepExplicit: z.boolean().default(true),
}).strict().refine(p => new Set(p.types.map(t => t.rawEntityType===undefined?t.kind:`raw:${JSON.stringify(t.rawEntityType)}`)).size === p.types.length, { message: "Duplicate type policies" });
export type ReplacementPolicies = z.infer<typeof replacementPoliciesSchema>;
export const policyRequestSchema = z.object({ revision: z.number().int().nonnegative(), marks: z.array(markSchema).max(MAX_MARKS), policies: replacementPoliciesSchema }).strict();
