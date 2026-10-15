import { z } from "zod";
import { id, markSchema } from "./index.ts";

// Source schema has 20 IDs (19 default plus signature); the last six are explicit product extensions.
export const entityTypeIds = ["name_cn", "org_name", "id_card", "phone", "bank_card", "address", "email", "website_url", "uscc", "wechat_id", "plate_cn", "securities_account", "case_number", "cert_no", "patent_no", "filing_no", "contract_amount", "seal", "face", "signature", "passport_no", "tax_no", "ein", "international_id", "ssn", "official_no"] as const;
export const presetEntityType = z.enum(entityTypeIds);
const textMode = z.enum(["default_star", "full_star", "default_pseudonym", "custom_pseudonym", "selective_pseudonym"]);
const visualMode = z.enum(["default_star", "default_pseudonym", "custom_pseudonym", "selective_pseudonym"]);
const maskStyle = z.enum(["black", "white", "purple", "lightGray"]);
const label = z.string().trim().min(1).refine(v => v.isWellFormed()&&!v.includes("\0"));
export const profileSchema = z.object({
  id: z.string().min(1).max(100), schemaVersion: z.literal(1), name: label,
  description: z.string().refine(v=>v.isWellFormed()&&!v.includes("\0")), source: z.enum(["system", "user"]), readonly: z.boolean(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  enabledEntityTypeIds: z.array(presetEntityType).min(1).max(entityTypeIds.length).refine(v => new Set(v).size === v.length),
  certNoPreferenceRecorded: z.boolean().default(true),
  pseudonymTypeActions: z.partialRecord(presetEntityType, z.enum(["mask", "pseudonym", "partial_star", "full_star"])),
  pseudonymTemplate: z.object({ kind: z.literal("standard") }).passthrough().optional(),
  docx: z.object({ defaultMode: textMode, removeHeaderFooter: z.boolean(), removeImages: z.boolean(), commentHandlingMode: z.enum(["remove", "anonymize", "keep"]), exportMarkdown: z.boolean() }).passthrough(),
  markdown: z.object({ defaultMode: textMode }).passthrough(),
  pdf: z.object({ defaultMode: visualMode, maskStyle, exportPdfAsDocx: z.boolean(), exportMarkdown: z.boolean() }).passthrough(),
  image: z.object({ defaultMode: visualMode, maskStyle, exportMarkdown: z.boolean() }).passthrough(),
  batch: z.object({ docxDefaultMode: textMode, markdownDefaultMode: textMode, pdfDefaultMode: visualMode, imageDefaultMode: visualMode,
    exportMarkdownByKind: z.object({ docx: z.boolean(), pdf: z.boolean(), image: z.boolean() }).passthrough(),
    pseudonymTableNameTemplates: z.object({ singleDocument: label, unifiedBatch: label, independentBatch: label }).passthrough(),
  }).passthrough(),
}).passthrough().refine(p => p.source !== "system" || p.readonly);
export type Profile = z.infer<typeof profileSchema>;

export const ruleEntrySchema = z.object({
  id, pattern: z.string().min(1).refine(v => v.isWellFormed()&&!v.includes("\0")), normalizedPattern: z.string().min(1).refine(v => v.isWellFormed()&&!v.includes("\0")),
  entityType: z.string().min(1).refine(v=>v.isWellFormed()&&!v.includes("\0")),
  kind: z.enum(["forceDetect", "forceSkip"]), matchMode: z.literal("exact"), enabled: z.boolean(),
  materialRouteKeys: z.array(z.enum(["judgment","pleading","contract","disclosure","official_letter","screenshot","general"])).min(1).optional(),
  source: z.enum(["manual", "reviewSuggestion", "promotedFromWorkspace", "excelImport", "migration"]),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), originWorkspaceId: id.optional(),
}).passthrough();
export type RuleEntry = z.infer<typeof ruleEntrySchema>;
export const rulesetSchema = z.object({
  id, schemaVersion: z.literal(1), name: label, description: z.literal(""), source: z.enum(["system", "user", "migrated"]), readonly: z.boolean(),
  applicability: z.object({ mode: z.literal("all"), materialRouteKeys: z.array(z.never()).max(0) }).strict(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), entries: z.array(ruleEntrySchema),
}).passthrough();
export type RuleSet = z.infer<typeof rulesetSchema>;
export const preferencesSchema = z.object({
  schemaVersion: z.literal(1), defaultProfileId: z.string().min(1), activeRuleSetId: id.nullable(),
  lastSuccessfulExportByKind: z.record(z.string(), z.object({ kind: z.enum(["txt", "md", "csv", "docx", "xlsx", "pdf", "png", "jpg", "jpeg"]), documentId: id, artifactId: id, at: z.iso.datetime(), profile: profileSchema.nullable() }).strict()),
  updatedAt: z.iso.datetime(),
}).strict();
export type PresetPreferences = z.infer<typeof preferencesSchema>;
export type StoredPreset<T> = { revision: number; settings: T };
export const projectPresetSchema = z.object({ revision: z.number().int().nonnegative(), profile: z.object({ revision: z.number().int().nonnegative(), settings: profileSchema }).strict().nullable(), ruleset: z.object({ revision: z.number().int().positive(), settings: rulesetSchema }).strict().nullable() }).strict();
export type ProjectPresetPolicy = z.infer<typeof projectPresetSchema>;
