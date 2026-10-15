import {validAliasToken} from "./alias-token.ts";
import { z } from "zod";
export const id = z.uuid();
export const permissionSchema = z.enum(["view_original", "review", "export", "view_mapping", "restore", "manage_models", "manage_members", "upload", "manage_dictionary", "delete_material"]);
export type Permission = z.infer<typeof permissionSchema>;
export const permissionLabels: Record<Permission, string> = { view_original: "查看原件", review: "人工复核", export: "导出副本", view_mapping: "查看与创建映射", restore: "假名还原", manage_models: "模型管理", manage_members: "项目成员管理", upload: "导入材料", manage_dictionary: "词表管理", delete_material: "删除材料" };
export const TEXT_MAX_BYTES = 102400;
export const FILE_MAX_BYTES = 50 * 1024 * 1024;
export const BATCH_MAX_FILES = 20;
export const TEXT_PAGE_CHARS = 32768;
export const textPageSchema = z.object({ offset: z.coerce.number().int().min(0).max(FILE_MAX_BYTES).default(0), revision: z.coerce.number().int().nonnegative().optional() });
export const sourceFormatSchema = z.enum(["txt", "md", "csv", "doc", "wps", "docx", "pdf", "png", "jpg", "jpeg", "xlsx"]);
export type SourceFormat = z.infer<typeof sourceFormatSchema>;
export type Anchor = { start: number; end: number; row?: number; column?: number; kind: "text" | "cell" | "object" | "page"; part?: string; object?: string; page?: number };
export type Coverage = { id: string; status: "complete" | "blocked"; reason?: string; objects?: string[] };
export type ParsedPage = { index: number; width: number; height: number; rotation: number; confidence: number; previewId: string; previewHash: string; mapId: string; mapHash: string; part?: string };
export const pageReviewSchema = z.object({
  mode: z.enum(["unselected", "raster"]),
  maskStyle: z.enum(["black", "white", "purple", "lightGray"]).optional(),
  regions: z.array(z.object({ id, page: z.number().int().min(0).max(299), x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(), width: z.number().finite().positive(), height: z.number().finite().positive(), shape:z.enum(["rect","circle"]).optional(), entityType:z.string().min(1).refine(v=>v.isWellFormed()&&!v.includes("\0")).optional(),text:z.string().refine(v=>v.isWellFormed()&&!v.includes("\0")).optional(),meta:z.record(z.string(),z.json()).optional(), reason: z.enum(["敏感区域", "印章", "签名", "人脸"]) }).strict()).max(3000),
  deletedPages: z.array(z.number().int().min(0).max(299)).max(299),
}).strict();
export type PageReview = z.infer<typeof pageReviewSchema>;
export const batchSchema = z.object({
  id,
  files: z.array(z.object({ requestId: id, path: z.string().min(1).max(1024), size: z.number().int().positive().max(FILE_MAX_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional() })).min(1).max(BATCH_MAX_FILES),
});
export type UploadEntry = z.infer<typeof batchSchema>["files"][number];
export type UploadBatchView = { id: string; createdAt: string; files: (UploadEntry & { documentId: string | null })[] };
export const paginationSchema = z.object({
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
// Candidate resource budget; larger documents fail explicitly rather than truncating detections.
export const MAX_MARKS = 32768;
export const REVIEW_BODY_BYTES = MAX_MARKS * 1536 + 1024;
export const revisionSchema = z.object({ revision: z.number().int().nonnegative() });
export const replacementSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("type") }).strict(),
  z.object({ mode: z.literal("full") }).strict(),
  z.object({ mode: z.literal("mask"), prefix: z.number().int().min(0).max(100), suffix: z.number().int().min(0).max(100) }).strict(),
  z.object({ mode: z.literal("custom"), value: z.string().refine(v=>v.isWellFormed()&&!v.includes("\0")) }).strict(),
  z.object({ mode: z.literal("reference-mask"), variant: z.enum(["default", "official-name", "detected", "detected-raster"]).default("default") }).strict(),
  z.object({ mode: z.literal("clear") }).strict(),
  z.object({ mode: z.literal("alias"), mappingId: id, version: z.number().int().positive(), token: z.string().refine(validAliasToken) }).strict(),
]);
export const markSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  kind: z.enum(["手机号", "固定电话", "邮箱", "身份证号", "银行账号", "信用代码", "案号", "护照号", "姓名", "机构", "地址", "金额", "商业秘密", "自定义", "证券/资金账号", "车牌号", "微信号", "网址", "专利号", "备案号", "证照/许可证号", "税号", "雇主识别号", "国际身份证号", "社保号", "公文编号"]),
  rawEntityType:z.string().min(1).refine(v=>v.isWellFormed()&&!v.includes('\0')).optional(),
  decision: z.enum(["pending", "redact", "ignore"]),
  signatureGroup: z.object({id:z.string().regex(/^sig_[a-f0-9]{32}$/u),memberIndex:z.number().int().min(0).max(MAX_MARKS-1),memberCount:z.number().int().min(2).max(MAX_MARKS)}).strict().optional(),
  replacement: replacementSchema.optional(),
  replacementOrigin: z.enum(["manual", "overall", "type", "value"]).optional(),
  rasterReplacement: z.boolean().optional(),
  userAdded: z.boolean().optional(),
  hiddenByType: z.boolean().optional(),
  hiddenTypeWasUserAdded: z.boolean().optional(),
  sources: z.array(z.object({ layer: z.enum(["rules", "ner", "ai", "manual"]), code: z.string().regex(/^[A-Za-z0-9._:-]{1,80}$/), score: z.number().min(0).max(1).optional(), uncertain: z.boolean().optional() })).optional(),
}).refine(m=>m.rawEntityType===undefined||m.kind==='自定义',{message:'INVALID_ENTITY_TYPE'}).refine(m=>m.hiddenByType!==true||m.decision==='ignore',{message:'INVALID_TYPE_HIDDEN_DECISION'}).refine(m=>m.hiddenTypeWasUserAdded===undefined||m.hiddenByType===true,{message:'INVALID_TYPE_HIDDEN_ORIGIN'});
export type Mark = z.infer<typeof markSchema>;
/** Transport identity hint; validated against the current authenticated frame and stripped before persistence. */
export const reviewMarkSchema=markSchema.safeExtend({reviewEntityId:z.string().regex(/^entity_[a-f0-9]{32}$/u).optional()});
export type ReviewMark=z.infer<typeof reviewMarkSchema>;
export const dictionarySchema = z.object({ revision: z.number().int().nonnegative(), entries: z.array(z.object({ value: z.string().trim().min(1).max(200).refine(v => v.isWellFormed() && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(v)), kind: markSchema.shape.kind,rawEntityType:markSchema.shape.rawEntityType, action: z.enum(["include", "exclude"]).optional() }).refine(m=>m.rawEntityType===undefined||m.kind==="自定义")).max(1000) });
export type DictionaryEntry = z.infer<typeof dictionarySchema>["entries"][number];
export const textSchema = z.object({ text: z.string().min(1), requestId: id });
export const reviewSchema = z.object({
  revision: z.number().int().nonnegative(),
  marks: z.array(reviewMarkSchema).max(MAX_MARKS),
  pageReview: pageReviewSchema.optional(),
});
export const loginSchema = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(128),
});
export const projectSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type DocumentView = {
  permissions?: Permission[];
  id: string;
  project_id: string;
  text: string;
  textOffset?: number;
  textLength?: number;
  nextTextOffset?: number | null;
  markTexts?: Record<string, string>;
  revision: number;
  marks: ReviewMark[];
  state: string;
  name?: string;
  format?: SourceFormat;
  processingFormat?:string;
  normalization?:{ready:boolean;format:"docx";normalizedHash:string|null}|null;
  parseVersion?: number;
  anchors?: Anchor[];
  coverage?: Coverage[];
  pages?: Pick<ParsedPage, "index" | "width" | "height" | "rotation" | "confidence" | "part">[];
  pageReview?: PageReview | null;
  pageRotationState?: import("./page-rotation.ts").PageRotationState;
  entityCorrections?:import("../core/entity-corrections.ts").EntityCorrectionFrame|null;
  entityCorrectionsStale?:boolean;
  job?: {
    id: string;
    kind: "detect" | "export";
    status: string;
    error_code: string | null;
    required_permissions?: Permission[];
    canObserveEvents?: boolean;
  };
  canRunNer?: boolean;
  nerEnabled?: boolean;
  visualDiagnostics?:{complete:boolean;pages:{page:number;detectors:string[];warnings:string[]}[]}|null;
  visualCandidates?: {page:number;x:number;y:number;width:number;height:number;reason:"人脸"|"印章"|"签名";score:number;detector:string}[];
  layers: { rules: string; ner: "not_configured" | "not_requested" | "pending" | "completed"; ai: "not_configured" };
};
