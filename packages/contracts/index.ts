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
export const sourceFormatSchema = z.enum(["txt", "md", "csv", "docx", "pdf", "png", "jpg", "jpeg", "xlsx"]);
export type SourceFormat = z.infer<typeof sourceFormatSchema>;
export type Anchor = { start: number; end: number; row?: number; column?: number; kind: "text" | "cell" | "object" | "page"; part?: string; object?: string; page?: number };
export type Coverage = { id: string; status: "complete" | "blocked"; reason?: string; objects?: string[] };
export type ParsedPage = { index: number; width: number; height: number; rotation: number; confidence: number; previewId: string; previewHash: string; mapId: string; mapHash: string; part?: string };
export const pageReviewSchema = z.object({
  mode: z.enum(["unselected", "raster"]),
  regions: z.array(z.object({ id, page: z.number().int().min(0).max(299), x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(), width: z.number().finite().positive(), height: z.number().finite().positive(), reason: z.enum(["敏感区域", "印章", "签名", "人脸"]) }).strict()).max(3000),
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
  z.object({ mode: z.literal("mask"), prefix: z.number().int().min(0).max(100), suffix: z.number().int().min(0).max(100) }).strict(),
  z.object({ mode: z.literal("custom"), value: z.string().trim().min(1).max(100).regex(/^[^\x00-\x1f\x7f<>【】]+$/u) }).strict(),
  z.object({ mode: z.literal("alias"), mappingId: id, version: z.literal(1), token: z.string().regex(/^【(?:姓名|机构|地址|敏感项)_\d{6}】$/u) }).strict(),
]);
export const markSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  kind: z.enum(["手机号", "固定电话", "邮箱", "身份证号", "银行账号", "信用代码", "案号", "护照号", "姓名", "机构", "地址", "金额", "商业秘密", "自定义", "证券/资金账号", "车牌号", "微信号", "网址", "专利号", "备案号", "证照/许可证号"]),
  decision: z.enum(["pending", "redact", "ignore"]),
  replacement: replacementSchema.optional(),
  sources: z.array(z.object({ layer: z.enum(["rules", "ner", "ai", "manual"]), code: z.string().regex(/^[A-Za-z0-9._:-]{1,80}$/), score: z.number().min(0).max(1).optional(), uncertain: z.boolean().optional() })).max(8).optional(),
});
export type Mark = z.infer<typeof markSchema>;
export const dictionarySchema = z.object({ revision: z.number().int().nonnegative(), entries: z.array(z.object({ value: z.string().trim().min(1).max(200).refine(v => v.isWellFormed() && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(v)), kind: markSchema.shape.kind, action: z.enum(["include", "exclude"]).optional() })).max(1000) });
export type DictionaryEntry = z.infer<typeof dictionarySchema>["entries"][number];
export const textSchema = z.object({ text: z.string().min(1), requestId: id });
export const reviewSchema = z.object({
  revision: z.number().int().nonnegative(),
  marks: z.array(markSchema).max(MAX_MARKS),
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
  marks: Mark[];
  state: string;
  name?: string;
  format?: SourceFormat;
  parseVersion?: number;
  anchors?: Anchor[];
  coverage?: Coverage[];
  pages?: Pick<ParsedPage, "index" | "width" | "height" | "rotation" | "confidence" | "part">[];
  pageReview?: PageReview | null;
  job?: {
    id: string;
    kind: "detect" | "export";
    status: string;
    error_code: string | null;
    required_permissions?: Permission[];
  };
  canRunNer?: boolean;
  nerEnabled?: boolean;
  layers: { rules: string; ner: "not_configured" | "not_requested" | "pending" | "completed"; ai: "not_configured" };
};
