import{isWordFormat}from'./document-format.ts';
import {encodeXlsxString} from "./ooxml-string.ts";
import {kindByEntityType} from "../contracts/entity-types.ts";
import {sourceEntityMark,entityIdentity,canonicalRuleEntityType} from './entity-identity.ts';
export {canonicalRuleEntityType} from './entity-identity.ts';
import { randomUUID } from "node:crypto";
import { profileSchema, rulesetSchema, ruleEntrySchema, type Profile, type RuleEntry, type RuleSet, type PresetPreferences, entityTypeIds } from "../contracts/presets.ts";
import { type DictionaryEntry, type Mark, markSchema } from "../contracts/index.ts";
import { parseOffice } from "./office.ts";
import { writeZip } from "./office-zip.ts";
import type {DocumentConfiguration} from '../contracts/document-policy.ts';

// Both a user's configuration change and an imported source configuration
// must produce the same effective processing profile.
export function applyConfigurationProfileFields(profile:Profile,config:DocumentConfiguration,sourceFormat:string){
  const fileKind=isWordFormat(sourceFormat)?'docx':sourceFormat==='pdf'?'pdf':['png','jpg','jpeg'].includes(sourceFormat)?'image':'markdown';
  if(config.entityTypes)profile.enabledEntityTypeIds=config.entityTypes;
  if(config.pseudonymRules){
    const expected=Object.values(config.pseudonymRules).some(v=>v!=="pseudonym")?"selective_pseudonym":"custom_pseudonym";
    config.exportMode??=expected;
    profile.pseudonymTypeActions=config.pseudonymRules;
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
    const markdown=config.outputFormats.includes('md');profile.docx.exportMarkdown=markdown;profile.pdf.exportMarkdown=markdown;profile.image.exportMarkdown=markdown;
    profile.pdf.exportPdfAsDocx=sourceFormat==='pdf'&&config.outputFormats.includes('docx');
    profile.batch.exportMarkdownByKind={docx:markdown,pdf:markdown,image:markdown};
  }
  return profile;
}

export const SYSTEM_PROFILE_ID = "system_default";
export const SOURCE_DEFAULT_ENTITY_TYPES = ["name_cn", "org_name", "id_card", "phone", "bank_card", "address", "email", "website_url", "uscc", "wechat_id", "plate_cn", "securities_account", "case_number", "cert_no", "patent_no", "filing_no", "contract_amount", "seal", "face"] as const;
const epoch = "2026-10-14T00:00:00.000Z";
export function defaultProfile(): Profile {
  return profileSchema.parse({ id: SYSTEM_PROFILE_ID, schemaVersion: 1, name: "系统默认", description: "常规文档识别与脱敏设置", source: "system", readonly: true, createdAt: epoch, updatedAt: epoch,
    enabledEntityTypeIds: [...SOURCE_DEFAULT_ENTITY_TYPES], certNoPreferenceRecorded: true, pseudonymTypeActions: {}, pseudonymTemplate: { kind: "standard" },
    docx: { defaultMode: "default_star", removeHeaderFooter: false, removeImages: false, commentHandlingMode: "keep", exportMarkdown: false }, markdown: { defaultMode: "default_star" },
    pdf: { defaultMode: "default_star", maskStyle: "black", exportPdfAsDocx: false, exportMarkdown: false }, image: { defaultMode: "default_star", maskStyle: "black", exportMarkdown: false },
    batch: { docxDefaultMode: "default_star", markdownDefaultMode: "default_star", pdfDefaultMode: "default_star", imageDefaultMode: "default_star", exportMarkdownByKind: { docx: false, pdf: false, image: false }, pseudonymTableNameTemplates: { singleDocument: "{fileName}_假名表", unifiedBatch: "本次脱敏_统一假名表", independentBatch: "{fileName}_假名表" } },
  });
}
export function defaultPreferences(): PresetPreferences { return { schemaVersion: 1, defaultProfileId: SYSTEM_PROFILE_ID, activeRuleSetId: null, lastSuccessfulExportByKind: {}, updatedAt: epoch }; }
export function normalizePattern(value: string) { return value.trim().replace(/\s+/gu, " "); }
export function presetNameWithSuffix(base: string, suffix: string) { return base + suffix; }
export function ruleKey(entry: Pick<RuleEntry, "entityType" | "pattern">) { return `${entityIdentity(sourceEntityMark(entry.entityType,entry.pattern))}\0${normalizePattern(entry.pattern)}\0exact`; }
/** Source Bd.validateRuleSet normalizes these retired fields before Rd/Cd.
 * Preserve own per-entry route extensions and unknown properties for strict validation.
 */
export function normalizeReferenceRuleSetInput(value:unknown):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const input=value as Record<string,unknown>;
 const applicability={mode:'all',materialRouteKeys:[]};
 return{...input,description:'',applicability,entries:Array.isArray(input.entries)?input.entries.map(entry=>entry&&typeof entry==='object'&&!Array.isArray(entry)?{...entry,matchMode:'exact'}:entry):input.entries};
}
/** Source PI replaces the retired party_slots template and downgrades selective modes. */
export function normalizeReferenceProfileInput(value:unknown, options:{writeInput?:boolean;preserveNativeSignature?:boolean}={}):unknown {
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const profile=structuredClone(value) as Record<string,any>;
 if(options.writeInput) profile.certNoPreferenceRecorded=true;
 if(profile.certNoPreferenceRecorded!==true&&Array.isArray(profile.enabledEntityTypeIds)) {
   if(profile.enabledEntityTypeIds.includes('case_number')&&!profile.enabledEntityTypeIds.includes('cert_no')) profile.enabledEntityTypeIds.push('cert_no');
   profile.certNoPreferenceRecorded=true;
 }
 if(!profile.pseudonymTypeActions||typeof profile.pseudonymTypeActions!=='object'||Array.isArray(profile.pseudonymTypeActions)) profile.pseudonymTypeActions={};
 if(profile.batch&&typeof profile.batch==='object'&&!profile.batch.markdownDefaultMode) profile.batch.markdownDefaultMode='default_star';
 if(!profile.markdown&&profile.batch&&typeof profile.batch==='object') profile.markdown={defaultMode:profile.batch.markdownDefaultMode||'default_star'};
 for(const key of ['docx','markdown','pdf','image']) if(profile[key]?.defaultMode==='default_pseudonym') profile[key].defaultMode='custom_pseudonym';
 for(const key of ['docxDefaultMode','markdownDefaultMode','pdfDefaultMode','imageDefaultMode']) if(profile.batch?.[key]==='default_pseudonym') profile.batch[key]='custom_pseudonym';
 if(profile.pseudonymTemplate?.kind==='party_slots') {
   profile.pseudonymTemplate={kind:'standard'};
   if(profile.docx?.defaultMode==='selective_pseudonym') profile.docx.defaultMode='default_star';
   if(profile.batch?.docxDefaultMode==='selective_pseudonym') profile.batch.docxDefaultMode='default_star';
 }
 if(!options.preserveNativeSignature&&Array.isArray(profile.enabledEntityTypeIds)&&profile.enabledEntityTypeIds.includes('signature')) {
   const enabled=profile.enabledEntityTypeIds.filter((key:string)=>key!=='signature');
   profile.enabledEntityTypeIds=enabled.length?enabled:[...SOURCE_DEFAULT_ENTITY_TYPES];
 }
 return profile;
}
export function checkedRuleset(value: unknown): RuleSet {
  const rules = rulesetSchema.parse(value), seen = new Map<string, RuleEntry["kind"]>();
  for (const entry of rules.entries) {
    entry.pattern = entry.pattern.trim(); entry.normalizedPattern = normalizePattern(entry.pattern);
    if (!entry.pattern) throw new Error("RULESET_PATTERN_REQUIRED");
    const key = ruleKey(entry), previous = seen.get(key);
    if (previous) throw new Error(previous === entry.kind ? "RULESET_DUPLICATE_ENTRY" : "RULESET_ENTRY_CONFLICT");
    seen.set(key, entry.kind);
  }
  return rules;
}
export {kindByEntityType} from "../contracts/entity-types.ts";
export const sourceFamilyByKind: Partial<Record<Mark["kind"],typeof entityTypeIds[number]>> = {"护照号":"id_card","国际身份证号":"id_card","社保号":"id_card","税号":"uscc","雇主识别号":"uscc","公文编号":"case_number"};
export function profileAllowsKind(profile: Profile, kind: Mark["kind"]) {
  if (kind === "固定电话") return profile.enabledEntityTypeIds.includes("phone");
  const type = Object.keys(kindByEntityType).find(key => kindByEntityType[key] === kind && !["other", "seal", "face", "signature"].includes(key));
  return type === undefined || profile.enabledEntityTypeIds.includes(type as typeof entityTypeIds[number]) || !!sourceFamilyByKind[kind] && profile.enabledEntityTypeIds.includes(sourceFamilyByKind[kind]!);
}
export function profileForFormat(profile: Profile, format: string, batch = false) {
  const key = isWordFormat(format) ? "docx" : format === "pdf" ? "pdf" : ["png", "jpg", "jpeg"].includes(format) ? "image" : "markdown";
  const settings = profile[key];
  const mode = batch ? profile.batch[`${key}DefaultMode` as "docxDefaultMode" | "pdfDefaultMode" | "imageDefaultMode" | "markdownDefaultMode"] : settings.defaultMode;
  const exportMarkdown = key === "markdown" ? false : batch ? profile.batch.exportMarkdownByKind[key] : profile[key].exportMarkdown;
  return { ...settings, defaultMode: mode === "default_pseudonym" ? "custom_pseudonym" as const : mode, exportMarkdown, enabledEntityTypeIds: profile.enabledEntityTypeIds, pseudonymTypeActions: profile.pseudonymTypeActions, pseudonymTableNameTemplates: profile.batch.pseudonymTableNameTemplates };
}
export function rulesetDictionary(value: RuleSet): DictionaryEntry[] {
  return checkedRuleset(value).entries.filter(e => e.enabled).map(e => ({ value: e.pattern, ...sourceEntityMark(e.entityType,e.pattern), ...(e.kind === "forceSkip" ? { action: "exclude" as const } : {}) }));
}
export type ImportRule = Pick<RuleEntry, "pattern" | "entityType" | "kind" | "enabled"> & { row: number };
export function previewRuleImport(ruleset: RuleSet, imported: ImportRule[], initialErrors: { row: number; message: string }[] = []) {
  const existing = new Map(checkedRuleset(ruleset).entries.map(e => [ruleKey(e), e])), seen = new Map<string, ImportRule>();
  const cleanEntries: ImportRule[] = [], conflicts: { imported: ImportRule; existing: RuleEntry; kind: "duplicate" | "opposite" }[] = [], errors = [...initialErrors];
  for (const input of imported) {
    const e = { ...input, pattern: input.pattern.trim() }, key = ruleKey(e), previous = existing.get(key), repeated = seen.get(key);
    if (repeated) errors.push({ row: e.row, message: repeated.kind === e.kind ? "文件内规则重复" : "文件内规则冲突" });
    else if (previous) conflicts.push({ imported: e, existing: previous, kind: previous.kind === e.kind ? "duplicate" : "opposite" });
    else cleanEntries.push(e);
    seen.set(key, e);
  }
  return { cleanEntries, conflicts, errors };
}
export function previewRulePromotion(ruleset: RuleSet, candidates: ImportRule[]) {
  const preview = previewRuleImport(ruleset, candidates);
  return { accepted: preview.cleanEntries, duplicates: preview.conflicts.filter(c => c.kind === "duplicate").map(c => c.imported), conflicts: preview.conflicts.filter(c => c.kind === "opposite"), errors: preview.errors };
}
export function importedEntries(candidates: ImportRule[], source: RuleEntry["source"], workspace?: string): RuleEntry[] {
  const now = new Date().toISOString();
  return candidates.map(c => ruleEntrySchema.parse({ id: randomUUID(), pattern: c.pattern.trim(), normalizedPattern: normalizePattern(c.pattern), entityType: c.entityType, kind: c.kind, matchMode: "exact", enabled: c.enabled, source, createdAt: now, updatedAt: now, ...(workspace ? { originWorkspaceId: workspace } : {}) }));
}
const headers = ["敏感信息内容", "实体类型", "名单类型", "状态"];
export async function importRulesWorkbook(bytes: Buffer) {
  if (bytes.length > 5 * 1024 * 1024) throw new Error("DICTIONARY_FILE_LIMIT");
  const parsed = await parseOffice(bytes, "xlsx");
  if (parsed.coverage.some(c => c.status !== "complete")) throw new Error("COVERAGE_INCOMPLETE");
  const cells = new Map<number, Map<number, string>>();
  // Vendor reads sheet1 only. Other sheets (e.g. export metadata) are deliberately not imported.
  for (const a of parsed.anchors) if (a.part === "xl/worksheets/sheet1.xml" && a.row && a.column && a.object?.startsWith("cell:")) {
    const row = cells.get(a.row) ?? new Map<number, string>(); row.set(a.column, parsed.text.slice(a.start, a.end).trim()); cells.set(a.row, row);
  }
  if (!cells.size) throw new Error("INVALID_DICTIONARY_TABLE");
  const oldMatchColumn = /匹配方式|match/iu.test(cells.get(1)?.get(4) ?? ""), imported: ImportRule[] = [], errors: { row: number; message: string }[] = [];
  for (const [number, cellsInRow] of [...cells].sort(([a], [b]) => a - b)) {
    if (number === 1 || ![...cellsInRow.values()].some(Boolean)) continue;
    const pattern = cellsInRow.get(1) ?? "", inputKind = cellsInRow.get(2) ?? "", list = cellsInRow.get(3) ?? "", status = cellsInRow.get(oldMatchColumn ? 5 : 4) ?? "";
    const entityType = ruleEntrySchema.shape.entityType.safeParse(inputKind).success ? inputKind : ({ "手机号/座机": "phone", "银行卡/账号": "bank_card", "网站 URL": "website_url", "统一社会信用代码": "uscc", "案号/文件号": "case_number", "证券/资金账户号": "securities_account", "身份证": "id_card", "其他": "other" } as Record<string, string>)[inputKind] ?? inputKind;
    const kind = /白名单|跳过|forceSkip/iu.test(list) ? "forceSkip" : /黑名单|脱敏|forceDetect/iu.test(list) ? "forceDetect" : null;
    const example = { pattern, entityType, kind, enabled: !/停用|false|否/iu.test(status), row: number };
    if (!kind || !pattern || !ruleEntrySchema.shape.entityType.safeParse(entityType).success) errors.push({ row: number, message: "敏感内容、实体类型或名单类型无效" });
    else imported.push(example as ImportRule);
  }
  return { imported, errors };
}
export async function exportRulesWorkbook(ruleset?: RuleSet) {
 const escape=encodeXlsxString;
  const table = ruleset ? [headers, ...checkedRuleset(ruleset).entries.map(e => [e.pattern, e.entityType, e.kind === "forceDetect" ? "黑名单（强制脱敏）" : "白名单（强制跳过）", e.enabled ? "启用" : "停用"])] : [headers.slice(0, 3), ["张三", "name_cn", "黑名单（强制脱敏）"], ["某某科技有限公司", "org_name", "白名单（强制跳过）"]];
  const sheet = (table: string[][], validations = false) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${table.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${"ABCDE"[c]}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData>${validations ? `<dataValidations count="2"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="B2:B1000"><formula1>"${entityTypeIds.join(",")}"</formula1></dataValidation><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="C2:C1000"><formula1>"黑名单（强制脱敏）,白名单（强制跳过）"</formula1></dataValidation></dataValidations>` : ""}</worksheet>`;
  const parts = new Map<string, Buffer>(Object.entries({
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="黑白名单" sheetId="1" r:id="rId1"/><sheet name="名单信息" sheetId="2" r:id="rId2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": sheet(table, !ruleset), "xl/worksheets/sheet2.xml": sheet([["名称", ruleset?.name ?? "导入模板"]]),
  }).map(([name, value]) => [name, Buffer.from(value)]));
  const bytes = await writeZip(parts), roundtrip = await importRulesWorkbook(bytes);
  if (roundtrip.errors.length || ruleset && JSON.stringify(roundtrip.imported.map(e => [e.pattern, e.entityType, e.kind, e.enabled])) !== JSON.stringify(ruleset.entries.map(e => [e.pattern, e.entityType, e.kind, e.enabled]))) throw new Error("ARTIFACT_MISMATCH");
  return bytes;
}
