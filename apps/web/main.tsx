import {createApiRequest,readSessionWithOneRateRetry,waitForRateWindow} from './http-client.ts';
import {textareaCoordinateBridge} from './textarea-coordinates.ts';
import {restoreHiddenReviewEntities}from'../../packages/core/review-type-hide.ts';
import {createReviewFeedbackDispatcher} from './review-feedback.ts';
import {createAutomaticRuntimeRuleDispatcher} from './automatic-runtime-rules.ts';
import type {ReviewFeedbackCause} from '../../packages/core/review-feedback.ts';
import {useReviewMarkFilter,ReviewMarkFilters} from './review-mark-filter.tsx';
import {ManualOccurrences} from './manual-occurrences.tsx';
import {correctionForMark} from '../../packages/core/entity-corrections.ts';
import {pruneEntityGeometryRegions}from'../../packages/contracts/entity-geometry.ts';
import {ProjectEntityCorrections} from './entity-corrections.tsx';
import {MarkdownSourceReview} from './source-review.tsx';
import {emptyPageRotationState} from '../../packages/contracts/page-rotation.ts';
import {ReviewProvenance} from './review-provenance.tsx';
import {UnifiedAliases} from './unified-aliases.tsx';
import {DocumentNormalization} from './document-normalization.tsx';
import {isWordFormat,isLegacyWordFormat} from '../../packages/core/document-format.ts';
import {businessErrors} from './business-errors.ts';
import {FolderOutput} from './folder-output.tsx';
import {DocumentRoutePreview} from './document-route.tsx';
import {DocxImageOcr} from './docx-image-ocr.tsx';
import {MappingLibrary} from './mapping-library.tsx';
import {MarkdownBlockers} from "./markdown-blockers.tsx";
import {ProcessingProgress,type SharedProgressEvents} from "./processing-progress.tsx";
import {PdfSealRuntime} from "./pdf-seal-runtime.tsx";
import {PdfOcrLiveDraft,type PdfOcrLiveDraftHandle} from './pdf-ocr-live-draft.tsx';
import { MarkdownManualDraft } from "./markdown-manual-draft.tsx";
import {entityIdentity,entityLabel,entitySpanKey} from '../../packages/core/entity-identity.ts';
import { OcrDiagnostics } from "./image-utilities.tsx";
import {SupportPanel,installRendererErrorReporter} from "./support.tsx";
import {ProcessingObservability} from "./processing-observability.tsx";
import {ReferenceDictionaryFiles} from "./reference-dictionary.tsx";
import {RestorationBatch} from "./restoration-batch.tsx";
import {FeedbackPanel} from "./feedback.tsx";
import {RecoveryDraft,RecentWorkspaces,type ManualRecoveryDraft,type RecoveryDraftHandle} from "./workspace-recovery.tsx";
import {NetworkPolicy} from "./network-policy.tsx";
import { AutomaticVisual } from "./automatic-visual.tsx";
import { AiCollaboration } from "./ai-collab.tsx";
import { DocumentConfigurationEditor } from "./document-configuration.tsx";
import { OfficeFaces } from "./office-faces.tsx";
import { ImportedPortableDraft } from "./portable-draft.tsx";
import { ProjectEntities } from "./project-entities.tsx";
import { ExportOutputs } from "./export-outputs.tsx";
import { WorkspacePortable, downloadResponse } from "./workspace-portable.tsx";
import { RestorationFiles } from "./restoration-files.tsx";
import { PresetManager } from "./presets.tsx";
import { RevisionHistory } from "./revision-history.tsx";
import { PaginatedDocxReview as DocxReview } from "./docx-paginated-review.tsx";
import {DocumentUnlock} from './document-unlock.tsx';
import { ConfirmationDialog, useConfirmAction } from "./confirm-action.tsx";
import { appUrl } from "./urls.ts";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { DocumentView, Mark, PageReview, Permission } from "../../packages/contracts/index.ts";
import { MAX_MARKS, TEXT_MAX_BYTES, TEXT_PAGE_CHARS, markSchema } from "../../packages/contracts/index.ts";
import "./style.css";
import { Uploads } from "./uploads.tsx";
import { Dictionary } from "./dictionary.tsx";
import { ReviewToolDialog } from "./review-tool-dialog.tsx";
import { ReviewTools, ReplacementEditor } from "./review-tools.tsx";
import {applySignatureDecision,signatureGroupLabel} from "../../packages/core/review-group-ui.ts";
import { TextHighlights, typeColor } from "./text-highlights.tsx";
import { EntityGroups } from "./entity-groups.tsx";
import { MappingPicker, MappingList, RestoreDialog } from "./mappings.tsx";
import {MappingExport} from './mapping-export.tsx';
import { BatchReview } from "./batch-review.tsx";
import { PageEditor, emptyPageReview } from "./page-review.tsx";
import { OrganizationDialog, ProjectMembers, AuditPanel } from "./members.tsx";
import { HamburgerMenuIcon, PlusIcon, FileTextIcon, ExitIcon, PersonIcon, ChevronRightIcon } from "@radix-ui/react-icons";
function savedReviewOrigin(doc: DocumentView, dirty: boolean) {
  const pending = doc.marks.some(mark => mark.decision === 'pending');
  const saved = doc.reviewOrigin === 'automatic' ? (pending ? '系统自动决定，未人工复核，仍有待确认' : '系统自动决定，未人工复核')
    : doc.reviewOrigin === 'human_review' ? (pending ? '人工保存，仍有待确认' : '人工复核已保存')
    : doc.reviewOrigin === 'legacy' ? '审定来源未记录' : '尚无已保存审定';
  return dirty ? `当前修改未保存 · 上一版本：${saved}` : saved;
}
const messages: Record<string, string> = {
  ...businessErrors,
  PERMISSION_DENIED: "没有执行此操作的权限，请联系项目管理员",
  PERMISSION_REVOKED: "操作权限已撤销，任务已停止",
  NOT_FOUND: "记录不存在，或你已无权访问",
  USERNAME_TAKEN: "账号名称已被使用，请换一个名称",
  MEMBER_LIMIT: "组织成员已达到上限",
  OWNER_IMMUTABLE: "不能修改所有者的权限或停用所有者",
  SELF_PERMISSION_CHANGE: "不能修改自己的项目权限",
  ACCOUNT_DISABLED: "该账号已停用，请先启用账号",
  PROCESSING_BUSY: "系统正在处理另一个文件，请稍后再试",
  CAPACITY_EXCEEDED: "组织材料容量或文件数已达上限，请联系管理员",
  CAPACITY_BELOW_USAGE: "配额不能低于当前已用量；不会自动删除已有材料",
  INVALID_PAGE_REVIEW: "页面区域超出范围、重复或删除了全部页面，请检查",
  PAGE_CONVERSION_REQUIRED: "请先选择副本转换方式并保存复核",
  PAGE_POSITION_MISSING: "部分敏感文字无法可靠定位到页面，请检查原件或重新解析",
  PAGE_REPLACEMENT_UNSUPPORTED: "图片型副本只支持完整清除选区，请取消假名、自定义替换或部分遮盖",
  POLICY_TARGET_NOT_FOUND: "原值选择已失效，请重新选择",
  POLICY_VALUE_CONFLICT: "相同原值存在不同策略，请先统一",
  AMBIGUOUS_MAPPING: "相同原值对应多个实体，请逐项选择假名",
  PIXEL_VERIFICATION_FAILED: "副本像素或隐藏内容核验失败，已阻止下载",
  OUTPUT_SIZE_LIMIT: "生成的副本超过 50 MB，请拆分材料",
  RATE_LIMITED: "请求过于频繁，请稍后重试",
  INVALID_REPLACEMENT: "遮盖必须隐藏至少一个字，替换文字不能包含完整原值、空字符或无效编码",
  INVALID_SEARCH: "查找文字无效，请输入不超过 200 字的内容",
  KNOWN_ENTITY_VALUE_LIMIT: "单个已知原值超过 2,000 个字符，请缩小标记范围后再检查",
  KNOWN_ENTITY_SCAN_LIMIT: "材料过长或已知原值过多，无法完成本次漏标检查；请拆分材料后重试",
  MAPPING_MISMATCH: "假名与此处原值、类型或版本不一致，请重新选择",
  MAPPING_ACCESS_DENIED: "没有查看映射或还原的权限",
  MAPPING_LIMIT: "项目假名已达到 1,000 项上限",
  MAPPING_VALUE_LIMIT: "单个假名最多对应 2,000 字，请缩小选择范围",
  UNKNOWN_ALIAS: "存在未知、变形或不可还原的代号，或没有找到本版本的假名；未进行还原",
  AMBIGUOUS_ALIAS: "假名对应关系有歧义，已停止还原",
  BULK_REVIEW_LIMIT: "所选材料合计过大，请减少批量选择后重试",
  DOCX_LAYOUT_LIMIT: "此文档版式内容过多，请使用对象原文审查。",
  OCR_TEXT_CONFLICT: "识别文字已改变，请刷新后重新选择。",
  OCR_POSITION_REQUIRED: "所选文字缺少图像坐标，请改用手动框选。",
  VISUAL_MODEL_REQUIRED: "人脸识别资源未配置，请联系管理员；仍可手动框选。",
  VISUAL_MODEL_MISMATCH: "人脸模型完整性校验失败，请联系管理员。",
  VISUAL_OUTPUT_INVALID: "图像识别结果无效，请手动检查并框选。",
  VISUAL_INPUT_INVALID: "图像无法用于自动识别，请手动检查。",
  NER_MODEL_REQUIRED: "实体识别资源未配置，请联系管理员",
  NER_MODEL_MISMATCH: "实体识别资源校验失败，请联系管理员",
  NER_TEXT_LIMIT: "实体识别最多支持 20 万字符，请拆分材料",
  NER_OUTPUT_INVALID: "实体识别结果无法可靠定位，请重试",
  JOB_ACTIVE: "请等待当前任务完成，或先取消当前任务",
  POLICY_CHANGED: "项目词表已更新，请重新识别后复核",
  DUPLICATE_DICTIONARY_ENTRY: "词表中有重复项目，请检查",
  INVALID_PDF: "PDF 文件损坏或无法读取，请检查原件",
  ENCRYPTED_OFFICE: "文件已加密，请输入文件密码解锁。",
  RECOVERY_OUTDATED: "草稿所属材料版本已变化，请使用当前材料重新复核。",
  RECOVERY_CONFLICT: "自动草稿已被其他窗口更新，请重新打开材料。",
  RECOVERY_WRITER_CONFLICT: "这份草稿已由另一个窗口接管，请重新打开最新记录。",
  RECOVERY_SAVE_PENDING: "自动草稿尚未完成读取或保存，请稍后再试。",
  RECOVERY_OPEN_UNCONFIRMED: "自动草稿尚未确认打开，请重新选择工作区。",
  RECOVERY_CLOSE_UNCONFIRMED: "自动保存会话尚未确认结束，请重新打开最新草稿。",
  DRAFT_UNIFIED_MODE_USE_PROJECT_ALIASES: "项目已启用统一假名，请在项目统一假名中编辑。",
  DRAFT_SOURCE_MISMATCH: "材料原文已变化，请重新打开后编辑假名。",
  DRAFT_ACTION_UNAVAILABLE: "当前材料不支持此脱敏方式。",
  PDF_OCR_CHECKPOINT_STALE: "材料或识别任务已变化，请重新载入后继续。",
  PDF_OCR_CHECKPOINT_WRITE_FAILED: "识别进度保存失败，请重新载入查看可恢复的页面。",
  PDF_OCR_PREVIEW_FAILED: "本页处理预览失败，请检查草稿后重试。",
  PDF_OCR_PREVIEW_INVALID: "本页处理预览响应无效，请重新打开材料后重试。",
  IRREVERSIBLE_MASK: "当前星号或遮盖无法还原，请使用假名模式，或选择不还原的任务。",
  PARTIALLY_IRREVERSIBLE_MASK: "部分标记使用了不可还原的替换，请全部改为假名，或选择不还原的任务。",
  CONFLICTING_PSEUDONYM_RULES: "假名规则与导出模式冲突，请调整后重试。",
  REVIEW_MARKS_INVALID: "复核标记格式异常，请重新打开材料并检查。",
  AI_RESULT_ARCHIVE_INVALID: "返回稿归档记录校验失败，请重新打开任务并检查。",
  AI_RESULT_ARCHIVE_CONFLICT: "此轮已归档的返回稿与本次提交不一致，请保留原文件并核对名称和内容。",
  DOCUMENT_PASSWORD_INCORRECT: "文件密码不正确，请重新输入。",
  DOCUMENT_INTEGRITY_MISMATCH: "加密文件完整性核验失败，请核对原文件。",
  DOCUMENT_ENCRYPTION_UNSUPPORTED: "此文件加密方式暂不支持。",
  DOCUMENT_PASSWORD_INVALID: "文件密码不正确，请重新输入。",
  DOCUMENT_UNLOCK_VERIFICATION_FAILED: "解锁后的文件未通过完整性核验。",
  DOCUMENT_UNLOCK_UNSUPPORTED: "此文件加密方式暂不支持。",
  DOCUMENT_LEGACY_CONVERSION_REQUIRED: "旧版 Word／Excel 文件需要先转换为 docx／xlsx。",
  ENCRYPTED_PDF: "PDF 已加密，请先使用有权访问的解密副本",
  PAGE_LIMIT: "材料页数无效或超出处理范围",
  INVALID_PDF_PAGE: "PDF 页面无法读取，已停止处理",
  INVALID_PDF_TEXT: "PDF 文字编码无法可靠定位，请检查原件",
  PDF_TEXT_LIMIT: "页面文字数量超过安全处理限制，请拆分文件",
  PIXEL_LIMIT: "图片或页面超过 2,500 万像素，请降低分辨率",
  INVALID_IMAGE: "图片损坏或内容与扩展名不一致，请检查文件",
  MULTIPAGE_IMAGE: "请将多帧图片拆分为单张图片后上传",
  OCR_MODEL_REQUIRED: "文字识别资源缺失，请联系管理员",
  OCR_MODEL_MISMATCH: "文字识别资源校验失败，请联系管理员",
  PAGE_NOT_READY: "页面尚未就绪，请稍后重试",
  LOGIN_REQUIRED: "会话已过期，请重新登录",
  INVALID_CREDENTIALS: "账号或密码不正确",
  VERSION_CONFLICT: "内容已在其他窗口更新，请重新打开文档",
  INVALID_MARKS: "请处理所有待确认标记，并检查选择范围",
  OVERLAPPING_MARKS: "选定范围重叠，请排除或删除冲突标记",
  RESIDUE_FOUND: "输出中仍存在已选择的敏感值，请检查同值的其他位置",
  EXPORT_NOT_READY: "文件尚未生成，请稍后重试",
  ARTIFACT_VERIFICATION_FAILED: "实际文件核验失败，下载已阻止",
  TEXT_SIZE_LIMIT: "请输入非空文本，最大 100 KiB",
  DETECTION_INCOMPLETE: "识别尚未完成",
  JOB_NOT_ACTIVE: "任务已结束，不能取消",
  JOB_NOT_RETRYABLE: "任务状态已变化，请重新打开文件",
  UNSUPPORTED_FORMAT: "此文件暂不能安全处理，请转换为 TXT、Markdown 或 CSV 后导入",
  INVALID_ENCODING: "文本编码无法读取，请转换为 UTF-8 后导入",
  INVALID_CSV: "CSV 行列或引号格式不正确，请检查文件",
  CELL_LIMIT: "文件单元格数量超过处理限制，请拆分文件",
  MARKDOWN_RECOGNITION_REQUIRED: "此 Markdown 使用旧版识别坐标，请重新识别后复核。",
  SIGNATURE_GROUP_RECOGNITION_REQUIRED: "此材料的分格姓名需要重新识别，并由你重新复核后才能保存或生成新副本。原有复核记录与已签发链接保留。",
  SIGNATURE_GROUP_INVALID: "分格姓名需要整组决定，请重新打开材料并核对。",
  SIGNATURE_GROUP_RULE_CONFLICT: "规则只排除了分格姓名的一部分，无法按组复核；请调整该规则后重新识别。",
  MARKDOWN_SIDECAR_REQUIRED: "Markdown 源码映射缺失，请重新识别后复核。",
  MARKDOWN_BLOCKERS_UNREVIEWED: "请在“Markdown 图片与 HTML 处理”确认嵌入内容后再导出。",
  MARKDOWN_BLOCKER_INVALID: "嵌入内容已变化，请重新打开材料后确认。",
  MARKDOWN_CONTENT_MISMATCH: "Markdown 处理结果与复核内容不一致，已阻止导出，请重新核对。",
  MARKDOWN_ASSET_RESIDUE: "Markdown 仍含未处理嵌入内容，已阻止导出。",
  MARKDOWN_EXPORT_FAILED: "Markdown 无法安全回写，请检查复核范围后重试。",
  MARKDOWN_DRAFT_CONFLICT: "手工稿已被其他窗口更新，请重新打开。",
  MARKDOWN_DRAFT_OUTDATED: "手工稿所属材料版本已变化，请重新载入当前材料。",
  SIGNATURE_MODEL_REQUIRED: "签名识别资源未配置，请联系管理员。",
  SIGNATURE_MODEL_MISMATCH: "签名识别资源校验失败，请联系管理员。",
  SIGNATURE_OUTPUT_INVALID: "签名候选无法可靠定位，请人工检查。",
  PAGE_REVIEW_STORAGE_INVALID: "页面复核记录校验失败，请重新打开材料后核对。",
  IMAGE_SEARCH_INVALID: "请输入有效的图像查找文字，空白不能作为查询。",
  PROCESSING_EVENT_WRITE_FAILED: "处理进度保存失败，请重新打开材料后重试。",
  UNSUPPORTED_MARKDOWN_OBJECT: "Markdown 包含图片或 HTML，请移除这些内容后重新导入",
  CROSS_CELL_MARK: "标记不能跨越单元格，请分别选择每个单元格内的内容",
  CROSS_OBJECT_MARK: "标记不能跨越段落、单元格或属性，请分开选择",
  OFFICE_XML_VALUE_INVALID: "替换文字含此 Office 格式无法保存的字符，请调整文字后重试。",
  INVALID_OFFICE: "Office 文件损坏、加密或结构不完整，请检查后重新上传",
  ZIP_LIMIT: "文件解压后超过限制：单项 50 MB、合计 256 MB、最多 10,000 项",
  XML_LIMIT: "文件结构过于复杂，无法安全处理",
  UNSAFE_XML: "文件包含不安全的 XML 声明，无法处理",
  OBJECT_LIMIT: "文件包含超过 20,000 个内容对象，请拆分后上传",
  EMPTY_DOCUMENT: "未找到可处理的文字内容",
  SOURCE_MISMATCH: "原件完整性核验失败，已停止处理",
  FILE_SIZE_LIMIT: "文件超过 50 MB，请拆分后导入",
  MARK_LIMIT: "敏感标记数量超过处理上限，请拆分文件后重新导入",
  PROCESSING_TIMEOUT: "文件处理超时，请拆分文件后重试",
  PROCESSING_MEMORY_LIMIT: "文件结构超出可用处理资源，请拆分或简化后重试",
  COVERAGE_INCOMPLETE: "文件存在未处理内容或定位信息缺失，暂不能导出",
  SNAPSHOT_MISMATCH: "复核记录与当前内容不一致，暂不能导出，请重新打开材料核对",
  EXPORT_POLICY_FAILED: "导出校验失败，请重试或联系管理员",
  VISUAL_FONT_REQUIRED: '文字遮盖所需字体尚未配置，请联系管理员',
  VISUAL_FONT_MISMATCH: '文字遮盖字体完整性核验失败，已停止处理',
  VISUAL_FONT_GLYPH_REQUIRED: '遮盖标签含字体不支持的字，请调整替换文字',
  VISUAL_TEXT_FIT_FAILED: '替换文字无法完整放入所选区域，请缩短文字或扩大区域',
  VISUAL_CANDIDATE_LIMIT: '候选区域过多，请分批复核材料',
  MAPPING_NOT_FOUND: '所选材料没有已确认的假名，请先复核并保存假名替换',
  CONFIG_MODE_CONFLICT: '当前替换模式与逐类规则不一致，请核对设置',
};
const apiRequest = createApiRequest(messages);
async function retryRateLimited<T>(request: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await request(); }
    catch (error) {
      const failure = error as { status?: number; retryAfterMs?: number };
      if (failure.status !== 429 || typeof failure.retryAfterMs !== "number" || attempt >= 2) throw error;
      await waitForRateWindow(failure.retryAfterMs, signal);
    }
  }
}
type SessionControls = { validateSession: () => Promise<boolean>; rememberSession: (username: string | null) => void; sessionNotice: string };
function SessionWorkspace() {
  const identity = useRef<string | null | undefined>(undefined);
  const identityEpoch = useRef(0);
  const checking = useRef<Promise<boolean> | null>(null);
  const sessionCheckAbort = useRef(new AbortController());
  const channel = useRef<BroadcastChannel | null>(null);
  const [generation, setGeneration] = useState(0), [sessionNotice, setSessionNotice] = useState("");
  const rememberSession = useCallback((username: string | null) => {
    const changed = identity.current !== undefined && identity.current !== username;
    if (changed) identityEpoch.current++;
    identity.current = username;
    if (changed) {
      setSessionNotice("");
      setGeneration(value => value + 1);
      channel.current?.postMessage("changed");
    }
  }, []);
  const validateSession = useCallback((): Promise<boolean> => {
    if (identity.current === undefined) return Promise.resolve(true);
    if (!checking.current) {
      const expected = identity.current, expectedEpoch = identityEpoch.current;
      checking.current = readSessionWithOneRateRetry(apiRequest, sessionCheckAbort.current.signal).then(next => {
        // An A→B→A account switch still invalidates the old action.
        if (identity.current !== expected || identityEpoch.current !== expectedEpoch) return false;
        if (next.username === expected) return true;
        identityEpoch.current++;
        identity.current = next.username;
        setSessionNotice(next.username ? "登录账号已切换，已刷新当前账号的项目列表。" : "登录状态已变化，请重新登录。");
        // Remount every workspace component so no previous account's projects, dialogs or drafts remain.
        setGeneration(value => value + 1);
        return false;
      }).finally(() => { checking.current = null; });
    }
    return checking.current;
  }, []);
  useEffect(() => () => sessionCheckAbort.current.abort(), []);
  useEffect(() => {
    const check = () => { if (document.visibilityState === "visible") void validateSession().catch(() => {}); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("tuominwang-session:" + appUrl("/"));
      channel.current.onmessage = check;
    }
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      channel.current?.close();
      channel.current = null;
    };
  }, [validateSession]);
  return <App key={generation} validateSession={validateSession} rememberSession={rememberSession} sessionNotice={sessionNotice} />;
}
function App({ validateSession, rememberSession, sessionNotice }: SessionControls) {
  const confirmAction = useConfirmAction();
  const [requests] = useState(() => new AbortController());
  const [collaborationJob] = useState(()=>{const value=new URLSearchParams(window.location.search).get('collab');return value&&/^lbj_[a-f0-9]{32}$/u.test(value)?value:undefined;});
  useEffect(() => () => requests.abort(), [requests]);
  useEffect(()=>installRendererErrorReporter(),[]);
  function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    return apiRequest<T>(path, method, body, requests.signal);
  }
  const [reviewFeedback] = useState(()=>createReviewFeedbackDispatcher((path,method,body)=>apiRequest(path,method??"GET",body,AbortSignal.any([requests.signal,AbortSignal.timeout(15000)]))));
  const [automaticRuntimeRules] = useState(()=>createAutomaticRuntimeRuleDispatcher((path,method,body)=>apiRequest(path,method??'GET',body,AbortSignal.any([requests.signal,AbortSignal.timeout(15000)]))));
  const [manualRuleScope,setManualRuleScope]=useState<'file'|'project'|'spot'>('file');
  const [user, setUser] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [connectionError, setConnectionError] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(sessionNotice),
    [conflict, setConflict] = useState(false),
    [busy, setBusy] = useState(false);
  const [rotationActive,setRotationActive]=useState(false);
  const [exportMappingName,setExportMappingName]=useState('');
  const [projects, setProjects] = useState<{ id: string; name: string; permissions: Permission[] }[]>([]),
    [project, setProject] = useState(""),
    [docs, setDocs] = useState<{ id: string; state: string; name?: string; job_state?: string; job_kind?: "detect" | "export"; detect_state?: string; revision?: number }[]>([]),
    [doc, setDoc] = useState<DocumentView | null>(null),
    [marks, setMarks] = useState<Mark[]>([]),
    [dirty, setDirty] = useState(false);
  const [text, setText] = useState(""),
    [selection, setSelection] = useState<[number, number] | null>(null),
    [requestId, setRequestId] = useState(crypto.randomUUID());
  const [markPage, setMarkPage] = useState(0);
  const [feedbackOpen,setFeedbackOpen]=useState(false);
  const [pageReview, setPageReview] = useState<PageReview>(emptyPageReview);
  const [undoStack, setUndoStack] = useState<{marks:Mark[];pageReview:PageReview}[]>([]), [redoStack, setRedoStack] = useState<{marks:Mark[];pageReview:PageReview}[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [entityView, setEntityView] = useState<"groups" | "individual">("groups");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  useEffect(() => { setEntityView("groups"); setEditingIndex(null); setPreviewMode(false); }, [doc?.id]);
  useEffect(() => {
    if (entityView !== "individual" || editingIndex === null) return;
    const frame = requestAnimationFrame(() => document.getElementById(`review-mark-${editingIndex}`)?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [entityView, editingIndex]);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [dictionaryPending, setDictionaryDirty] = useState(false), [memberPending, setMemberPending] = useState(false);
  const dictionaryDirty = dictionaryPending || memberPending;
  const [importing, setImporting] = useState(false), [collapsed, setCollapsed] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [reviewTool, setReviewTool] = useState<"marks" | "search" | "bulk" | "known">("marks");
  const [docxView, setDocxView] = useState<"layout" | "text">("layout");
  const [docxFocus, setDocxFocus] = useState<{ start: number; end: number } | null>(null);
  const [pendingAuditFocus,setPendingAuditFocus] = useState<{documentId:string;projectId:string;revision:number;textOffset:number;start:number;end:number}|null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [moreProjects, setMoreProjects] = useState(false), [moreDocs, setMoreDocs] = useState(false);
  const original = useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{
    if(!pendingAuditFocus||busy||doc?.id!==pendingAuditFocus.documentId||doc?.project_id!==pendingAuditFocus.projectId||doc?.revision!==pendingAuditFocus.revision)return;
    const offset=doc.textOffset??0;
    if(offset!==pendingAuditFocus.textOffset||pendingAuditFocus.start<offset||pendingAuditFocus.end>offset+doc.text.length)return;
    const frame=requestAnimationFrame(()=>{
      const field=original.current;
      if(!field||busyRef.current||field.matches(':disabled')||!field.getClientRects().length||currentDoc.current?.id!==pendingAuditFocus.documentId||currentDoc.current?.revision!==pendingAuditFocus.revision||(currentDoc.current?.textOffset??0)!==pendingAuditFocus.textOffset||currentProject.current!==pendingAuditFocus.projectId)return;
      let start:number,end:number;
      try {
        const bridge=textareaCoordinateBridge(doc.text,field.value);
        start=bridge.toTextarea(pendingAuditFocus.start-offset);
        end=bridge.toTextarea(pendingAuditFocus.end-offset);
      } catch(error) {
        if((error as Error).message!=='TEXTAREA_VALUE_MISMATCH'){
          setError('当前标记的换行位置无法在原文框中精确选取，请在原文中手动核对。');
          setPendingAuditFocus(current=>current===pendingAuditFocus?null:current);
        }
        return;
      }
      field.focus();field.setSelectionRange(start,end);
      if(field.selectionStart===start&&field.selectionEnd===end){field.scrollIntoView({block:'nearest'});setPendingAuditFocus(current=>current===pendingAuditFocus?null:current);}
    });
    return()=>cancelAnimationFrame(frame);
  },[pendingAuditFocus,busy,doc?.id,doc?.project_id,doc?.revision,doc?.textOffset,doc?.text,docxView]);
  const highlightLayer = useRef<HTMLDivElement>(null);
  useEffect(() => { setReviewTool("marks"); }, [doc?.id, doc?.revision]);
  const busyRef = useRef(false), dirtyRef = useRef(false), pdfDraftRef = useRef<PdfOcrLiveDraftHandle|null>(null);
  const [pdfDraftPending,setPdfDraftPending]=useState(false);
  const [pdfSharedEvents,setPdfSharedEvents]=useState<SharedProgressEvents|null>(null);
  async function flushPdfDraft(){if(pdfDraftRef.current&&!await pdfDraftRef.current.flush())throw new Error("运行中 PDF 草稿尚未保存，操作未执行；请修正草稿错误后重试。");}
  const currentDoc = useRef(doc), currentProject = useRef(project);
  const lastWorkspaceDocument = useRef<{project:string;id:string}|null>(null);
  const restoredWorkspaceDrafts=useRef(new Map<string,{recoveryRevision:number;draft:{revision:number;marks:Mark[];pageReview?:PageReview;manualDraft?:ManualRecoveryDraft|null}}>());
  const recoveryDraftRef=useRef<RecoveryDraftHandle|null>(null);
  const[projectRecovered,setProjectRecovered]=useState<{documentId:string;recoveryRevision:number}|null>(null);
  const[manualRecovery,setManualRecovery]=useState<ManualRecoveryDraft|null>(null),[manualRestoreEpoch,setManualRestoreEpoch]=useState(0);
  const manualRecoveryRef=useRef(manualRecovery);manualRecoveryRef.current=manualRecovery;
  const visualRequests = useRef(new Map<string,string>());
  const allowed = (permission: Permission) => (projects.find(p => p.id === project)?.permissions ?? []).includes(permission);
  const docAllowed = (permission: Permission) => (doc?.permissions ?? []).includes(permission);
  const canReview = docAllowed("review");
  const canManageJob = !!doc?.job?.required_permissions?.length && doc.job.required_permissions.every(docAllowed);
  useEffect(() => {
    if (doc) setDocs(current => current.map(item => item.id === doc.id ? { ...item, state: doc.state, revision: doc.revision, job_state: doc.job?.status, job_kind: doc.job?.kind, detect_state: doc.state === "queued" && doc.job?.kind === "detect" ? doc.job.status : doc.layers.rules } : item));
  }, [doc?.id, doc?.revision, doc?.state, doc?.job?.status, doc?.job?.kind, doc?.layers.rules]);
  currentDoc.current = doc;
  currentProject.current = project;
  dirtyRef.current = dirty;
  useEffect(() => {
    const expire = () => {
      rememberSession(null);
      lastWorkspaceDocument.current=null;
      setUser(null);
      setDoc(null);
      setProjects([]);
      setProject("");
      setDocs([]);
      setMarks([]);
      setText("");
      setDirty(false);
      setConflict(false);
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [rememberSession]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    if (dirty || text.trim() || pendingUpload || dictionaryDirty) window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, text, pendingUpload, dictionaryDirty]);
  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (user && !await validateSession()) return;
      await fn();
    } catch (e) {
      if((e as any).code==='UNIFIED_ALIAS_REVIEW_REQUIRED'){await refreshDocs();if(currentDoc.current)await openDoc(currentDoc.current.id);}
      const code=(e as Error).message;
      setError(messages[code as keyof typeof messages]??code);
      if ((e as Error).message === messages.VERSION_CONFLICT) setConflict(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function refresh(append = false) {
    const next = await api<typeof projects>(`/projects?limit=20&offset=${append ? projects.length : 0}`);
    setProjects(current => append ? [...current, ...next] : next);
    setMoreProjects(next.length === 20);
  }
  async function refreshDocs(append = false) {
    const requestedProject = project;
    const next = await api<typeof docs>(`/projects/${requestedProject}/documents?limit=20&offset=${append ? docs.length : 0}`);
    if (currentProject.current !== requestedProject) return;
    setDocs(current => append ? [...current, ...next] : next);
    setMoreDocs(next.length === 20);
  }
  async function openDoc(id: string, focus?: {start:number;end:number}, snapshot?: DocumentView, onlyIfCurrent = false) {
    if(currentDoc.current?.id!==id){await flushPdfDraft();await recoveryDraftRef.current?.flush();}
    const d = snapshot ?? await api<DocumentView>("/documents/" + id + (focus?`?offset=${Math.max(0,focus.start-256)}`:""));
    if (d.id !== id) throw new Error("材料状态已变化，请重新打开。");
    if (onlyIfCurrent && (currentDoc.current?.id !== id || currentProject.current !== d.project_id || dirtyRef.current||manualRecoveryRef.current)) return;
    const recovered=restoredWorkspaceDrafts.current.get(id);
    if(recovered&&recovered.draft.revision!==d.revision){restoredWorkspaceDrafts.current.clear();throw new Error('RECOVERY_OUTDATED');}
    lastWorkspaceDocument.current={project:d.project_id,id:d.id};
    const enteredDocument = currentDoc.current?.id !== id || currentProject.current !== d.project_id;
    const pageFocus=!!focus&&d.anchors?.some(a=>a.start<focus.end&&a.end>focus.start&&(a.kind==='page'||a.kind==='object'&&a.object==='image-text'));
    setPendingAuditFocus(focus&&!pageFocus?{documentId:id,projectId:d.project_id,revision:d.revision,textOffset:d.textOffset??0,...focus}:null);
    if(focus&&!pageFocus&&isWordFormat(d.format))setDocxView('text');
    setDoc(d);
    setProjectRecovered(recovered?{documentId:id,recoveryRevision:recovered.recoveryRevision}:null);
    setExportMappingName('');
    setDocxFocus(focus??null);
    if(recovered)restoredWorkspaceDrafts.current.delete(id);
    setManualRecovery(recovered?.draft.manualDraft??(enteredDocument||d.revision!==currentDoc.current?.revision?null:manualRecoveryRef.current));
    if(recovered?.draft.manualDraft)setManualRestoreEpoch(value=>value+1);
    setMarks(recovered?.draft.marks??d.marks);
    setDirty(!!recovered);
    setSelection(null);
    setConflict(false);
    setMarkPage(0);
    setPageReview(recovered?.draft.pageReview??d.pageReview??emptyPageReview());
    setUndoStack([]); setRedoStack([]); setPreview(null);
    setImporting(false);
    if (enteredDocument) void api(`/projects/${d.project_id}/workspace/recent`,"POST",{documentId:d.id}).catch(()=>{});
  }
  async function prepareUnifiedPreview(current: DocumentView, pageIndex?: number): Promise<{ doc: DocumentView; previewMarks: Mark[] }> {
    // Qo2 calls Um2 only when entering preview in unified batch mode. The
    // project alias state is the cloud's explicit unified-mode switch; the
    // BatchReview checkbox selects a different operation and is not mo2.
    if (!docAllowed('view_mapping') || !canReview || !current.contentHash) return { doc: current, previewMarks: marks };
    const frame = await api<{revision:number;enabled:boolean;documents:{id:string;revision:number;contentHash:string}[]}>(`/projects/${current.project_id}/unified-aliases`);
    if (!frame.enabled) return { doc: current, previewMarks: marks };
    const result = await api<{revision:number;changedDocuments:Record<string,number>;previewMarks:Mark[];documents:{id:string;revision:number;contentHash:string}[]}>(`/projects/${current.project_id}/unified-aliases/prepare-preview`,'POST',{
      revision:frame.revision,documents:frame.documents,active:{id:current.id,revision:current.revision,contentHash:current.contentHash,
        localReviewDirty:dirtyRef.current,marks,...current.state==='queued'?{jobId:current.job?.id,pageIndex}:{}},
    });
    if (currentDoc.current?.id !== current.id || currentProject.current !== current.project_id) throw new Error(messages.VERSION_CONFLICT);
    const latest = await api<DocumentView>(`/documents/${current.id}`);
    if (latest.revision !== current.revision || latest.contentHash !== current.contentHash || latest.id !== current.id || latest.project_id !== current.project_id) {
      await openDoc(current.id, undefined, latest, true);
      await refreshDocs();
      throw new Error('统一假名已同步，请核对当前材料的新复核版本后再预览。');
    }
    if (Object.keys(result.changedDocuments).length) await refreshDocs();
    return { doc: latest, previewMarks: result.previewMarks };
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await retryRateLimited(() => api<{ username: string | null }>("/session"), requests.signal);
        if (!active) return;
        // Register the identity before a rate-window wait so cross-tab changes
        // can invalidate this workspace and abort its pending project request.
        rememberSession(session.username);
        if (session.username) await retryRateLimited(() => refresh(), requests.signal);
        if (!active) return;
        setUser(session.username);
      } catch {
        // A rate window or transport failure does not prove the user logged out.
        if (active && !requests.signal.aborted) setConnectionError(true);
      } finally {
        if (active && !requests.signal.aborted) setReady(true);
      }
    })();
    return () => { active = false; };
  }, []);
  useEffect(()=>{
    if(!ready||!user||!collaborationJob)return;
    let active=true;
    void (async()=>{
      const task=await api<{projectId:string}>(`/ai-collab/tasks/${collaborationJob}`);
      const target=await api<{id:string;name:string;permissions:Permission[]}>(`/projects/${task.projectId}`);
      if(!active)return;
      if(currentProject.current!==target.id)await recoveryDraftRef.current?.flush();
      setProjects(previous=>previous.some(p=>p.id===target.id)?previous:[target,...previous]);setProject(target.id);
    })().catch(e=>{if(active)setError((e as Error).message);});
    return()=>{active=false;};
  },[ready,user,collaborationJob]);
  useEffect(() => {
    let active = true;
    setActiveTool(null);
    setDocs([]);
    setImporting(false);
    setDocsLoading(Boolean(project));
    if (project)
      void api<typeof docs>(
        "/projects/" + project + "/documents?limit=20&offset=0",
      )
        .then((result) => {
          if (active) { setDocs(result); setMoreDocs(result.length === 20); setDocsLoading(false); }
        })
        .catch((e) => {
          if (active) { setError(e.message); setDocsLoading(false); }
        });
    setDoc(null);
    setPendingAuditFocus(null);
    setDirty(false);
    setConflict(false);
    return () => {
      active = false;
    };
  }, [project]);
  useEffect(() => {
    if (!doc || dirty || busy || conflict || !["queued", "running"].includes(doc.job?.status ?? "")) return;
    let active = true;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void api<DocumentView>(`/documents/${doc.id}?offset=${doc.textOffset ?? 0}&revision=${doc.revision}`)
        .then((d) => {
          if (!active || busyRef.current || dirtyRef.current || currentDoc.current?.id !== doc.id) return;
          if (d.revision !== doc.revision) {
            setConflict(true);
            setError(messages.VERSION_CONFLICT);
            return;
          }
          if (pdfDraftPending && d.job?.id !== doc.job?.id) {
            setConflict(true);
            setError('运行中 PDF 草稿尚未保存，材料任务已变化；当前编辑仍保留。');
            return;
          }
          setDoc(d);
          setMarks(d.marks);
          setPageReview(d.pageReview ?? emptyPageReview());
        })
        .catch((e) => { if (active) setError(e.message); })
        .finally(() => { inFlight = false; });
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [doc?.id, doc?.revision, doc?.textOffset, doc?.job?.id, doc?.job?.status, dirty, busy, conflict, pdfDraftPending]);
  async function loadText(offset: number, mark?: { start: number; end: number }) {
    if (mark) setDocxFocus({start:mark.start,end:mark.end});
    const current = currentDoc.current;
    if (!current) return;
    const next = await api<DocumentView>(`/documents/${current.id}?offset=${offset}&revision=${current.revision}`);
    if (next.id !== current.id || next.project_id !== current.project_id || next.revision !== current.revision) throw new Error(messages.VERSION_CONFLICT);
    if (currentDoc.current?.id !== current.id || currentDoc.current?.revision !== current.revision || currentProject.current !== current.project_id) return;
    setDoc(d => d?.id === current.id && d.revision === current.revision && d.project_id === current.project_id ? { ...d, text: next.text, textOffset: next.textOffset, textLength: next.textLength, nextTextOffset: next.nextTextOffset, markTexts: { ...next.markTexts, ...d.markTexts } } : d);
    setSelection(null);
    setPreview(null);
    setPreviewMode(false);
    const pageFocus=mark&&current.anchors?.some(a=>a.start<mark.end&&a.end>mark.start&&(a.kind==='page'||a.kind==='object'&&a.object==='image-text'));
    setPendingAuditFocus(mark&&!pageFocus?{documentId:current.id,projectId:current.project_id,revision:current.revision,textOffset:next.textOffset??0,...mark}:null);
  }
  function update(next: Mark[], fromServer = false) {
    if (!canReview || (busyRef.current && !fromServer) || conflict || doc?.state !== "review" || currentDoc.current?.id !== doc.id) return false;
    // ponytail: 10 in-memory edit steps, sharing unchanged mark objects; encrypted recovery drafts are stored separately.
    setUndoStack(stack => [...stack.slice(-9), {marks,pageReview}]); setRedoStack([]); setPreview(null);
    setPageReview(policy=>pruneEntityGeometryRegions(marks,next,policy));
    dirtyRef.current = true;
    setMarks(next);
    setDirty(true);
    setNotice("");
    return true;
  }
  function changeMarks(next:Mark[], producer:ReviewFeedbackCause["producer"]) {
    const before=marks;if(update(next)&&doc){const cause={producer,before,after:next};void reviewFeedback.dispatch(doc.id,doc.revision,cause);void automaticRuntimeRules.dispatch(doc.id,doc.revision,cause,manualRuleScope);}
  }
  function history(redo: boolean) {
    const source = redo ? redoStack : undoStack, next = source.at(-1);
    if (!canReview || !next || busyRef.current || conflict) return;
    if (redo) { setRedoStack(source.slice(0, -1)); setUndoStack(stack => [...stack.slice(-9), {marks,pageReview}]); }
    else { setUndoStack(source.slice(0, -1)); setRedoStack(stack => [...stack.slice(-9), {marks,pageReview}]); }
    setMarks(next.marks);setPageReview(next.pageReview); const changed = JSON.stringify(next.marks) !== JSON.stringify(doc?.marks) || JSON.stringify(next.pageReview) !== JSON.stringify(doc?.pageReview ?? emptyPageReview());
    setDirty(changed); dirtyRef.current = changed; setPreview(null); setNotice("");
  }
  function captureSelection(t:HTMLTextAreaElement){
    const current=currentDoc.current;
    if(!current||t!==original.current){setSelection(null);return;}
    try {
      const bridge=textareaCoordinateBridge(current.text,t.value),offset=current.textOffset??0;
      const start=bridge.toCanonical(t.selectionStart),end=bridge.toCanonical(t.selectionEnd);
      setSelection(start<end?[offset+start,offset+end]:null);
    } catch { setSelection(null); }
  }
  const feedbackDocument=doc?{id:doc.id,revision:doc.revision,name:doc.name??"文本材料",text:doc.text,textOffset:doc.textOffset??0}:undefined;
  const pending = marks.filter((m) => m.decision === "pending").length;
  const individual=useReviewMarkFilter({doc,marks,page:markPage,active:entityView==='individual',request:(input,signal)=>apiRequest(`/documents/${doc!.id}/entity-filter`,'POST',input,AbortSignal.any([requests.signal,signal])),onResetPage:()=>setMarkPage(0)});
  const pageCount = Math.max(1, Math.ceil(individual.total / 50));
  const page = Math.min(markPage, pageCount - 1);
  const hasPages = !!doc?.pages?.length;
  const pdfLiveDraftOwnsEvents = !!doc && canReview && docAllowed('view_original') && doc.job?.canObserveEvents === true && doc.job.ordinaryPdfDetection === true && doc.format === 'pdf' && doc.job.kind === 'detect' && doc.state === 'queued' && ['queued','running'].includes(doc.job.status);
  const sealJobId = doc?.state === "review" ? doc.sealDetectJobId : doc?.job?.kind === "detect" ? doc.job.id : null;
  const sealRuntimeActive = !!doc && !!sealJobId && canManageJob && doc.job?.canObserveEvents === true && doc.job?.ordinaryPdfDetection === true && doc.state === "queued" && doc.job?.status === "running";
  const sealRuntimeReady = !!doc && !!sealJobId && canReview && doc.state === "review";
  const sealDeferred = doc?.format === "pdf" && (doc.visualDiagnostics as {sealProgress?:{status:string}} | null | undefined)?.sealProgress?.status === "deferred";
  const sealProgress = (doc?.visualDiagnostics as {sealProgress?:{status:string;completedPageNumbers:number[]}} | null | undefined)?.sealProgress;
  const resolvedSealPages = new Set([...(sealProgress?.completedPageNumbers ?? []), ...(doc?.pageReview?.deletedPages ?? []).map(page => page + 1)]);
  const visualWarningPages = doc?.visualDiagnostics?.pages.filter(page => page.warnings.some(warning => warning !== "SEAL_DEFERRED" || !(sealProgress?.status === "complete" || resolvedSealPages.has(page.page + 1)))) ?? [];
  const isPaged = ["pdf", "png", "jpg", "jpeg"].includes(doc?.format ?? "txt");
  const outputFormat = isPaged && doc?.format !== "pdf" ? "png" : doc?.format ?? "txt";
  if (!ready) return <main>正在连接工作台…</main>;
  if (connectionError) return <main><p role="alert">会话验证暂不可用，请稍后重试连接。</p><button onClick={() => window.location.reload()}>重试连接</button></main>;
  if (!user)
    return (
      <main className="login-shell">
      <section className="login-intro">
        <div className="brand">
          脱敏汪 <small>敏感信息处理工作台</small>
        </div>
        <h1>
          让敏感信息，
          <br />
          停在边界内。
        </h1>
        <p>登录私有工作台，开始文本识别与人工复核。</p>
      </section>
      <section className="login-panel">
        <h2>登录脱敏汪</h2>
        <p className="muted">请输入账号和密码</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              const u = await api<{ username: string }>("/login", "POST", {
                username: f.get("username"),
                password: f.get("password"),
              });
              rememberSession(u.username);
              setUser(u.username);
              await refresh();
            });
          }}
        >
          <fieldset disabled={busy}>
          <label>
            账号
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={1}
              required
            />
          </label>
          <button disabled={busy}>登录工作台</button>
          </fieldset>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      </main>
    );
  const exportControls = doc ? (
              <section className="panel actions export-bar" aria-label="保存与导出">
                {docAllowed("restore") && <RestoreDialog key={`${doc.id}:${doc.revision}`} doc={doc} disabled={dirty || conflict || doc.state !== "review" || !doc.marks.some(m => m.decision === "redact" && m.replacement?.mode === "alias")} run={run} api={api} />}
                <div>
                  <strong>保存后再生成副本</strong>
                  <details className="export-guidance"><summary>副本说明</summary><p className="muted">
                    按已保存的处理方式生成 {outputFormat.toUpperCase()} 副本，原件保持不变。
                    {doc.format === "xlsx" && " 工作簿导出为值快照，不保留公式、超链接、条件格式和数据验证。"}
                    {isWordFormat(doc.format) && " 副本移除超链接和动态域指令，保留已显示的文字。"}
                  </p></details>
                </div>
                <button
                  className="secondary"
                  disabled={!canReview || !dirty || busy || conflict || doc.state !== "review"}
                  onClick={() =>
                    void run(async () => {
                      await reviewFeedback.flush();
                      await automaticRuntimeRules.flush();
                      await api("/documents/" + doc.id + "/review", "PUT", {
                        revision: doc.revision,
                        marks,
                        ...(hasPages ? { pageReview } : {}),
                      });
                      await openDoc(doc.id);
                      setNotice("复核已保存");
                    })
                  }
                >
                  保存复核
                </button>
                {docAllowed("export") && <label>本次假名表名称（可选）<input aria-label="本次导出假名表名称" maxLength={80} value={exportMappingName} placeholder="留空使用方案默认名称" onChange={e=>setExportMappingName(e.target.value)}/></label>}
                <button
                  disabled={
                    !docAllowed("export") || dirty || pending > 0 || doc.state !== "review" || busy || conflict || (sealDeferred && doc.reviewOrigin !== "human_review") || hasPages && doc.pageReview?.mode !== "raster" || !!doc.coverage?.some(c => c.status === "blocked")
                  }
                  onClick={() =>
                    void run(async () => {
                      if (sealDeferred && !await confirmAction("印章自动检查未完成。请先补检印章，或人工检查并标注遗漏印章后继续导出。", {title:"请确认已人工检查印章",confirmText:"已检查，继续导出",cancelText:"返回人工检查"})) return;
                      await api("/documents/" + doc.id + "/export", "POST", {
                        revision: doc.revision,
                        ...(sealDeferred ? {manualSealChecked:true} : {}),
                        ...(exportMappingName.trim()?{pseudonymTableName:exportMappingName.trim()}:{}),
                      });
                      await openDoc(doc.id);
                      setNotice("已提交副本生成任务");
                    })
                  }
                >
                  导出已选标记的处理副本
                </button>
                <button
                  className="secondary"
                  disabled={
                    !docAllowed("export") || dirty ||
                    busy ||
                    conflict ||
                    doc.job?.kind !== "export" ||
                    doc.job.status !== "succeeded"
                  }
                  onClick={() =>
                    void run(async () => {
                      const result = await api<{ url: string }>(
                        "/documents/" + doc.id + "/download-link",
                        "POST",
                        { revision: doc.revision },
                      );
                      const a = document.createElement("a");
                      a.href = appUrl(result.url);
                      a.download = `redacted.${outputFormat}`;
                      a.click();
                      setNotice("文件已核验，下载链接 5 分钟内有效");
                    })
                  }
                >
                  核验并下载 {outputFormat.toUpperCase()}
                </button>
                <ExportOutputs doc={doc} api={api} run={run} disabled={!docAllowed("export") || dirty || busy || conflict} />
              </section>
  ) : null;
  return (
    <fieldset className="workspace-controls" disabled={busy} aria-busy={busy}>
      <header className="workspace-topbar"><div className="brand">脱敏汪 <small>文档脱敏工作台</small></div><span>{doc ? savedReviewOrigin(doc, dirty) : importing ? "导入材料" : "项目空间"}</span></header>
      <div className={"shell" + (collapsed ? " sidebar-collapsed" : "") + (doc ? " review-shell" : "")}>
        <aside aria-label="项目导航">
      <header className="sidebar-brand">
        <div className="brand">
          项目空间
        </div>
        <button className="quiet icon-button" aria-label={collapsed ? "展开侧栏" : "收起侧栏"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><HamburgerMenuIcon /></button>
      </header>
      <div className="sidebar-account">
        <PersonIcon /><span className="account-name" title={user}>{user}</span>
          <button
            className="quiet"
            aria-label="退出"
            title="退出"
            onClick={async () => {
              if ((dirty || text.trim() || pendingUpload || dictionaryDirty) && !await confirmAction("存在未保存的内容或未上传文件，确定退出？")) return;
              void run(async () => {
                await api("/logout", "POST");
                rememberSession(null);
                lastWorkspaceDocument.current=null;
                setUser(null);
                setDoc(null);
                setProject("");
                setProjects([]);
                setDocs([]);
                setMarks([]);
                setText("");
                setDirty(false);
              });
            }}
          >
            <ExitIcon /><span className="sidebar-label">退出</span>
          </button>
      </div>
      <OrganizationDialog run={run} api={api} />
      <div className="sidebar-content">
          <h2>项目空间</h2>
          <details className="create-project">
          <summary><PlusIcon /><span>新建项目</span></summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = new FormData(form).get("name");
              if ((dirty || pendingUpload || dictionaryDirty) && !await confirmAction("存在未保存的内容或未上传文件，确定离开？")) return;
              void run(async () => {
                await flushPdfDraft();await recoveryDraftRef.current?.flush();
                const p = await api<{ id: string }>("/projects", "POST", {
                  name,
                  applyDefaultPresets:true,
                });
                await refresh();
                setProject(p.id);
                form.reset();
                const disclosure = form.closest("details");
                if (disclosure) disclosure.open = false;
              });
            }}
          >
            <label>
              项目名称
              <input
                name="name"
                placeholder="例如：合同审阅"
                maxLength={100}
                required
              />
            </label>
            <button className="secondary" disabled={busy}>
              新建项目
            </button>
          </form>
          </details>
          {projects.length > 5 && <label className="project-search"><span className="visually-hidden">搜索项目</span><input aria-label="搜索项目" value={projectQuery} onChange={e => setProjectQuery(e.target.value)} placeholder="搜索项目" /></label>}
          <nav aria-label="项目列表">
            {projects.filter(p => p.name.toLocaleLowerCase().includes(projectQuery.trim().toLocaleLowerCase())).map((p) => (
              <button
                className={project === p.id ? "active" : "quiet"}
                key={p.id}
                title={p.name}
                aria-label={p.name}
                aria-current={project === p.id ? "page" : undefined}
                onClick={() => void run(async () => {
                  if ((!dirty && !pendingUpload && !dictionaryDirty) || await confirmAction("存在未保存的内容或未上传文件，确定离开？")) {
                    await flushPdfDraft();
                    await recoveryDraftRef.current?.flush();
                    setProject(p.id);
                    setDoc(null); setImporting(false); setDirty(false); setConflict(false);
                  }
                })}
              >
                <FileTextIcon /><span className="sidebar-label">{p.name}</span>
              </button>
            ))}
          </nav>
          {projectQuery && !projects.some(p => p.name.toLocaleLowerCase().includes(projectQuery.trim().toLocaleLowerCase())) && <p className="sidebar-empty">没有匹配的项目</p>}
          {moreProjects && <button className="quiet" onClick={() => void run(() => refresh(true))}>更多项目</button>}
          {doc && allowed("view_original") && <section className="document-navigation" aria-label="当前项目材料">
            <h2>当前项目材料 <small>{docs.length}{moreDocs ? "+" : ""}</small></h2>
            <nav aria-label="材料导航">{docs.map((item, index) => <button key={item.id} className={item.id === doc.id ? "active" : "quiet"} aria-current={item.id === doc.id ? "page" : undefined} title={item.name ?? `文本 ${docs.length - index}`} onClick={async () => {
              if (item.id === doc.id || dirty && !await confirmAction("放弃未保存的复核？")) return;
              void run(() => openDoc(item.id));
            }}><FileTextIcon /><span className="sidebar-label">{item.name ?? `文本 ${docs.length - index}`}</span></button>)}</nav>
            {moreDocs && <button className="quiet" onClick={() => void run(() => refreshDocs(true))}>更多文件</button>}
          </section>}
      </div>
          {!collapsed && exportControls}
        </aside>
        <main><div className="main-content">
          <p className="breadcrumb">项目空间 <span>/</span> {projects.find(p => p.id === project)?.name ?? "我的项目"} {doc && <><span>/</span>复核详情</>}</p>
          <div className="title">
            <div>
              <h1>{doc ? doc.name ?? "复核文本" : importing ? "导入材料" : projects.find(p => p.id === project)?.name ?? "我的项目"}</h1>
            </div>
            {doc && (
              <div className="detail-actions">
              {docAllowed("delete_material") && <button className="quiet" onClick={async () => {
                if (!await confirmAction("永久删除这份材料、全部复核版本和副本？原件不能恢复；项目共享词表和假名映射仍保留。已签发链接到期前仍可用，对应加密文件会在到期后清除。")) return;
                void run(async () => { await api(`/documents/${doc.id}/delete`, "POST", { revision: doc.revision }); if(lastWorkspaceDocument.current?.id===doc.id)lastWorkspaceDocument.current=null; setDoc(null); setMarks([]); setDirty(false); setConflict(false); await refreshDocs(); setNotice("材料已删除，不能恢复。已签发链接到期后清除对应文件。"); });
              }}>删除材料</button>}
              <button className="secondary" onClick={async () => {
                if (dirty && !await confirmAction("放弃未保存的复核？")) return;
                void run(async()=>{await flushPdfDraft();await recoveryDraftRef.current?.flush();setDoc(null); setDirty(false); setConflict(false); setImporting(false);});
              }}>返回材料列表</button>
              <button
                className="secondary"
                disabled={!allowed("upload")}
                onClick={async () => {
                  if (!dirty || await confirmAction("放弃未保存的复核？")) {
                    void run(async()=>{await flushPdfDraft();await recoveryDraftRef.current?.flush();setDoc(null); setMarks([]); setDirty(false); setConflict(false); setSelection(null); setImporting(true);});
                  }
                }}
              >
                提交新文本
              </button>
              </div>
            )}
            {!doc && project && allowed("upload") && <button className={importing ? "secondary" : ""} onClick={async () => {
              if (dictionaryDirty && !await confirmAction("放弃未保存的词表修改？")) return;
              if (importing && pendingUpload && !await confirmAction("存在未上传文件，确定返回材料列表？")) return;
              setImporting(!importing);
            }}>{importing ? "返回材料列表" : "导入材料"}</button>}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="success">
              {notice}
            </p>
          )}
          {conflict && doc && <button className="secondary" onClick={async () => {
            if (!dirty || await confirmAction("重新载入将放弃本窗口未保存的复核，确定继续？")) void run(() => openDoc(doc.id));
          }}>重新载入最新复核</button>}
          {!doc && !importing ? (
            <>
            <div className="project-tools">
            <button className="secondary" disabled={busy} onClick={()=>setFeedbackOpen(v=>!v)}>反馈与个人规则</button>{feedbackOpen&&<FeedbackPanel key={`feedback:${project}`} project={project||undefined} document={feedbackDocument} api={api} run={run} />}
            {project && allowed("view_original") && allowed("export") && <ProcessingObservability project={project} documents={docs.map((d,i)=>({id:d.id,revision:d.revision??0,name:d.name??`文本 ${i+1}`}))} loadDocuments={async()=>{const all:typeof docs=[];for(let offset=0;;offset+=100){const page=await api<typeof docs>(`/projects/${project}/documents?limit=100&offset=${offset}`);all.push(...page);if(page.length<100)break;}return all.map((d,i)=>({id:d.id,revision:d.revision??0,name:d.name??`文本 ${i+1}`}));}} api={api} run={run} onChanged={async()=>{await refreshDocs();}} />}
            {project && feedbackOpen && <ReferenceDictionaryFiles project={project} api={api} run={run} />}
            <details><summary>帮助与产品资料</summary><SupportPanel run={run} api={api}/><OcrDiagnostics run={async operation=>{if(operation==='health')return api('/ocr/health');const response=await fetch(appUrl('/api/ocr/diagnostic'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'用户请求 OCR 检查'})});if(!response.ok){await downloadResponse(response,'OCR诊断.json');return;}const result=await response.clone().json();await downloadResponse(response,'OCR诊断.json');return result;}} /></details>
            <RecentWorkspaces api={api} disabled={busy||dirty} onPrepare={async()=>{await flushPdfDraft();await recoveryDraftRef.current?.flush();}} onOpen={async(projectId,documentId)=>{await run(async()=>{await flushPdfDraft();await recoveryDraftRef.current?.flush();const p=await api<typeof projects[number]>(`/projects/${projectId}`);setProjects(v=>v.some(x=>x.id===p.id)?v:[...v,p]);setProject(projectId);if(documentId)await openDoc(documentId);else setDoc(null);});}} onRecover={async(projectId,entries,activeDocumentId)=>{let completed=false;await run(async()=>{const p=await api<typeof projects[number]>(`/projects/${projectId}`);restoredWorkspaceDrafts.current.clear();for(const entry of entries)if(entry.draft)restoredWorkspaceDrafts.current.set(entry.documentId,{recoveryRevision:entry.revision,draft:entry.draft});setProjects(v=>v.some(x=>x.id===p.id)?v:[...v,p]);setProject(projectId);const selected=activeDocumentId??entries[0]?.documentId;if(selected)await openDoc(selected);else setDoc(null);completed=true;});if(!completed)throw Error('RECOVERY_OPEN_UNCONFIRMED');}} />
            {project && <NetworkPolicy projectId={project} api={api} disabled={busy||!allowed("manage_models")} />}
            {project && allowed("view_original") && <AiCollaboration key={`collaboration:${project}`} project={project} focusJob={collaborationJob} documents={docs} api={api} run={run} onOpen={id => void run(() => openDoc(id))} />}
            {project && allowed("view_original") && allowed("review") && <ProjectEntities key={`entities:${project}`} project={project} api={api} run={run} changed={() => refreshDocs()} onOpen={(id,span)=>openDoc(id,span)} />}
            <WorkspacePortable key={`portable:${project}`} projectId={project || null} activeDocumentId={lastWorkspaceDocument.current?.project===project?lastWorkspaceDocument.current.id:undefined} canExport={allowed("export") && allowed("view_original") && allowed("view_mapping")} canApply={allowed("manage_dictionary")&&allowed("review")&&!dirty} onApplied={async()=>{await refresh();setDoc(null);await refreshDocs();}} onImported={async id => { await refresh(); setProject(id); setDoc(null); }} />
            {project && allowed("view_original") && allowed("export") && <FolderOutput key={`folder-output:${project}`} projectId={project} enabled={!dirty && !conflict} canViewMapping={allowed("view_mapping")} api={api} run={run} />}
            {project && <RestorationBatch key={`batch-restore:${project}`} projectId={project} enabled={allowed("restore")} />}
            {project && <RestorationFiles key={`restoration:${project}`} projectId={project} enabled={allowed("restore")} />}
            <PresetManager key={`presets:${project}`} project={project || undefined} permissions={projects.find(p => p.id === project)?.permissions} run={run} api={api} onPending={setDictionaryDirty} onApplied={async () => { await refreshDocs(); }} />
            {project && allowed("manage_dictionary") && <Dictionary key={project} project={project} signal={requests.signal} run={run} changed={() => refreshDocs()} onPending={setDictionaryDirty} active={activeTool === "dictionary"} activate={() => setActiveTool("dictionary")} />}
            {project && allowed("view_mapping") && <MappingList key={`mapping:${project}`} project={project} run={run} api={api} active={activeTool === "mapping"} activate={() => setActiveTool("mapping")} />}
            {project&&allowed("view_original")&&allowed("view_mapping")&&<UnifiedAliases key={`unified:${project}`} projectId={project} enabled={!dirty&&!conflict} canReview={allowed("review")} api={api} run={run} onChanged={async()=>{await refreshDocs();if(currentDoc.current)await openDoc(currentDoc.current.id);}}/>}
            {project&&allowed("view_original")&&allowed("review")&&<ProjectEntityCorrections projectId={project} document={doc} selectedMark={editingIndex===null?undefined:marks[editingIndex]} selectedMarkIndex={editingIndex??undefined} enabled={!dirty&&!conflict} disabled={busy} api={api} run={run} onApplied={async()=>{await refreshDocs();if(currentDoc.current)await openDoc(currentDoc.current.id);}}/>}
            {project && allowed("view_original") && allowed("view_mapping") && <MappingLibrary key={`mapping-library:${project}`} projectId={project} enabled={!dirty && !conflict} canExport={allowed("export")} api={api} run={run} />}
            {project && <MappingExport key={`mapping-export:${project}`} projectId={project} enabled={allowed('view_original')&&allowed('view_mapping')&&allowed('export')}/>}
            {project && allowed("review") && <BatchReview key={`batch:${project}`} project={project} docs={docs} run={run} api={api} changed={() => refreshDocs()} active={activeTool === "batch"} activate={() => setActiveTool("batch")} />}
            {project && allowed("manage_members") && <ProjectMembers key={`members:${project}`} project={project} username={user} run={run} api={api} onPending={setMemberPending} active={activeTool === "members"} activate={() => setActiveTool("members")} />}
            {project && allowed("manage_members") && <AuditPanel key={`audit:${project}`} project={project} run={run} api={api} active={activeTool === "audit"} activate={() => setActiveTool("audit")} />}
            </div>
            <section className="materials" aria-label="材料列表" aria-busy={docsLoading}>
              {!project ? <div className="empty-state"><FileTextIcon /><h2>选择一个项目</h2><p>从左侧选择项目查看材料，或新建项目开始处理。</p></div> : docsLoading ? <p className="empty-state" role="status">正在加载材料…</p> : !docs.length ? <div className="empty-state"><FileTextIcon /><h2>{error ? "材料加载失败" : "还没有材料"}</h2><p>{error ? "请重新选择项目后重试。" : "点击右上角导入材料，上传文件或粘贴文本。"}</p></div> : <>
                <div className="material-head"><span>材料名称</span><span>状态</span><span>操作</span></div>
                {docs.map((d, i) => allowed("view_original") ? <button className="material-row quiet" key={d.id} onClick={async () => { if (dictionaryDirty && !await confirmAction("放弃未保存的词表修改？")) return; void run(() => openDoc(d.id)); }}>
                  <span className="material-name"><FileTextIcon />{d.name ?? `文本 ${docs.length - i}`}</span>
                  <span className={"material-status " + (d.state === "queued" ? d.detect_state ?? "" : d.job_kind === "export" ? d.job_state ?? "" : "")}>{d.state === "outdated" ? "需重新识别" : d.state === "queued" && d.detect_state === "failed" ? "识别失败" : d.state === "queued" && d.detect_state === "cancelled" ? "识别已取消" : d.state === "queued" && ["queued", "running"].includes(d.detect_state ?? "") ? "处理中" : d.state === "review" && d.job_kind === "export" && d.job_state === "failed" ? "可复核 · 副本失败" : d.state === "review" && d.job_kind === "export" && d.job_state === "cancelled" ? "可复核 · 副本已取消" : d.state === "review" && d.job_kind === "export" && ["queued", "running"].includes(d.job_state ?? "") ? "可复核 · 副本处理中" : d.state === "review" ? "可复核" : "待处理"}</span>
                  <span className="material-open">打开 <ChevronRightIcon /></span>
                </button> : <div className="material-row limited-material" key={d.id}><span className="material-name"><FileTextIcon />材料 {docs.length - i}</span><span className="material-status">{d.state === "outdated" ? "需重新识别" : d.state === "queued" && d.detect_state === "failed" ? "识别失败" : d.state === "queued" && d.detect_state === "cancelled" ? "识别已取消" : d.state === "queued" && ["running", "queued"].includes(d.detect_state ?? "") ? "处理中" : d.state === "review" && d.job_kind === "export" && d.job_state === "failed" ? "已识别 · 副本失败" : d.state === "review" && d.job_kind === "export" && d.job_state === "cancelled" ? "已识别 · 副本已取消" : d.state === "review" && d.job_kind === "export" && ["queued", "running"].includes(d.job_state ?? "") ? "已识别 · 副本处理中" : d.state === "review" ? "已识别" : "待处理"}</span><div className="actions">
                  {allowed("export") && <><button className="secondary" disabled={d.state !== "review" || ["queued", "running"].includes(d.job_state ?? "")} onClick={() => void run(async () => { await api(`/documents/${d.id}/export`, "POST", { revision: d.revision }); await refreshDocs(); })}>生成副本</button><button className="quiet" onClick={() => void run(async () => { const result = await api<{ url: string }>(`/documents/${d.id}/download-link`, "POST", { revision: d.revision }); const a = document.createElement("a"); a.href = appUrl(result.url); a.click(); })}>下载副本</button></>}
                  {allowed("restore") && <RestoreDialog doc={{ id: d.id, revision: d.revision ?? 0 }} disabled={d.state !== "review"} run={run} api={api} />}
                  {allowed("delete_material") && <button className="quiet" onClick={async () => { if (await confirmAction("永久删除此材料的原件、复核和副本？不能恢复。项目共享词表、假名映射仍保留；已签发链接到期后清除文件。")) void run(async () => { await api(`/documents/${d.id}/delete`, "POST", { revision: d.revision }); if(lastWorkspaceDocument.current?.id===d.id)lastWorkspaceDocument.current=null; await refreshDocs(); }); }}>删除材料</button>}
                </div></div>)}
                <button className="quiet" onClick={() => void run(async () => { await refresh(); await refreshDocs(); })}>刷新材料</button>
                {moreDocs && <button className="quiet" onClick={() => void run(() => refreshDocs(true))}>更多文件</button>}
              </>}
            </section>
            </>
          ) : !doc ? (
            <>
            <Uploads key={project} project={project} signal={requests.signal} run={run} refresh={() => refreshDocs()} onPending={setPendingUpload} />
            <section className="panel">
              <h2>粘贴文本</h2>
              <p className="muted">
                识别电话、证件、银行账号、信用代码和案号等信息。请复核结果，并补充遗漏内容。
              </p>
              <label>
                待处理文本
                <textarea
                  rows={14}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                  placeholder="请粘贴合同条款、案情或财务文本…"
                />
              </label>
              <div className="actions">
                <span className="muted">
                  {new TextEncoder().encode(text).length} / {TEXT_MAX_BYTES} 字节
                </span>
                <button
                  disabled={!project || !text.trim() || busy || new TextEncoder().encode(text).length > TEXT_MAX_BYTES}
                  onClick={() =>
                    void run(async () => {
                      if (pendingUpload && !await confirmAction("提交文本将离开导入页，尚未上传的文件将被清除，确定继续？")) return;
                      const d = await api<{ id: string }>(
                        "/projects/" + project + "/documents",
                        "POST",
                        { text, requestId },
                      );
                      if (allowed("view_original")) await openDoc(d.id); else setImporting(false);
                      await refreshDocs();
                      setText("");
                      setRequestId(crypto.randomUUID());
                    })
                  }
                >
                  提交并识别
                </button>
              </div>
              {!project && <p className="muted">请先在左侧创建或选择项目。</p>}
            </section>
            </>
          ) : (
            <>
              <div className="review-toolbar">
              <div className="statusbar">
                <span>
                  自动识别 {({ completed: "已完成", outdated: "需重新识别", pending: "待处理", failed: "失败", cancelled: "已取消" } as Record<string, string>)[doc.layers.rules] ?? "待处理"}
                </span>
                <span>
                  复核版本 {doc.revision} · {savedReviewOrigin(doc, dirty)}
                </span>
              </div>
              {doc.state === "outdated" && <p className="error" role="alert">材料的处理状态已变化，请重新识别后复核。原有复核记录仍保留。</p>}
              <div className="actions">
                <button className="secondary" disabled={!canReview || dirty || conflict || ["queued", "running"].includes(doc.job?.status ?? "")} onClick={async () => {
                  if (await confirmAction("重新识别将创建新复核版本，原有处理决定不会自动沿用。确定继续？")) void run(async () => { await api(`/documents/${doc.id}/recognize`, "POST", { revision: doc.revision, ner: false }); await openDoc(doc.id); });
                }}>重新识别</button>
                {doc.canRunNer && canReview && docAllowed("manage_models") && <button className="secondary" disabled={dirty || conflict || ["queued", "running"].includes(doc.job?.status ?? "")} onClick={async () => {
                  if (await confirmAction("识别人名、机构和地址候选，并创建新复核版本。原有处理决定不会自动沿用，确定继续？")) void run(async () => { await api(`/documents/${doc.id}/recognize`, "POST", { revision: doc.revision, ner: true }); await openDoc(doc.id); });
                }}>识别实体候选</button>}
                {visualWarningPages.length>0&&<p role="alert" className="error">部分页面的自动视觉检测未完成，请人工核对人脸、印章和签名区域后再保存复核。受影响页：{visualWarningPages.map(page=>page.page+1).join("、")}</p>}
              {doc.layers.ner === "completed" && <span className="muted">实体候选已识别，请结合上下文复核。</span>}
              </div>
              {canReview && doc.job?.status==="failed" && ["ENCRYPTED_PDF","ENCRYPTED_OFFICE"].includes(doc.job.error_code??"") && <DocumentUnlock id={doc.id} revision={doc.revision} api={api} disabled={dirty||conflict} onDone={()=>openDoc(doc.id)} />}
              <button className="secondary" disabled={busy} onClick={()=>setFeedbackOpen(v=>!v)}>反馈与个人规则</button>{feedbackOpen&&<FeedbackPanel key={`feedback-doc:${doc.id}`} project={doc.project_id} document={feedbackDocument} api={api} run={run}/>}
              {canReview && doc.state==="review" && <RecoveryDraft ref={recoveryDraftRef} key={`recovery:${doc.id}:${doc.revision}`} doc={doc} marks={marks} pageReview={pageReview} manualDraft={manualRecovery} projectRecoveryRevision={projectRecovered?.documentId===doc.id?projectRecovered.recoveryRevision:undefined} dirty={dirty} disabled={busy||conflict} api={api} onRestore={(next,pages,manual)=>{if(pages)setPageReview(pages);setManualRecovery(manual??null);if(manual)setManualRestoreEpoch(value=>value+1);update(next,true);}} />}
              {doc.job?.canObserveEvents === true && doc.state !== "outdated" && !conflict && docAllowed("view_original") && <ProcessingProgress key={`progress:${doc.job.id}`} job={doc.job} api={api} sharedEvents={pdfLiveDraftOwnsEvents?pdfSharedEvents:undefined} readPdfCheckpoints={doc.job.ordinaryPdfDetection === true && doc.state === "queued"} />}
              {sealJobId && doc.format === "pdf" && doc.state !== "outdated" && docAllowed("view_original") && (sealRuntimeActive || sealRuntimeReady) && <PdfSealRuntime key={`seals:${sealJobId}:${doc.revision}`} jobId={sealJobId} revision={doc.revision} api={api} active={sealRuntimeActive} ready={sealRuntimeReady} busy={busy || conflict} onPause={() => void run(async () => {
                await api(`/jobs/${sealJobId}/pdf-seals/pause`, "POST", {revision:doc.revision});
                setNotice("已请求暂停印章检查；当前批次完成后保留结果，其他检测继续。");
              })} onSupplement={() => void run(async () => {
                const result=await api<{sealProgress:{status:'deferred'|'complete';completedPageNumbers:number[];sealWarning?:string}}>(`/jobs/${sealJobId}/pdf-seals/supplement`, "POST", {revision:doc.revision,requestId:crypto.randomUUID()});
                const latest=await api<DocumentView>(`/documents/${doc.id}`);
                if (latest.id!==doc.id || latest.project_id!==doc.project_id || latest.revision!==doc.revision) {setConflict(true);throw new Error(messages.VERSION_CONFLICT);}
                if (currentDoc.current?.id!==doc.id || currentDoc.current.revision!==doc.revision) return;
                setDoc(current=>current?.id===doc.id&&current.revision===doc.revision?{...current,visualCandidates:latest.visualCandidates,visualDiagnostics:latest.visualDiagnostics}:current);
                setNotice(result.sealProgress.status==='complete'&&!result.sealProgress.sealWarning?'印章补检完成，已保留原有审查修改。':'印章已暂停，已完成页面和结果已保留；请核对未完成页面。');
              })} />}
              {canReview && docAllowed('view_original') && doc.job?.canObserveEvents===true && doc.job.ordinaryPdfDetection===true && doc.format==='pdf' && doc.job.kind==='detect' && (doc.state==='queued' && (['queued','running'].includes(doc.job.status)||doc.job.status==='cancelled'&&['PDF_OCR_PAUSED','PDF_OCR_PRIORITY_PREEMPTED'].includes(doc.job.error_code??'')) || pdfDraftPending && doc.state==='review' && doc.job.status==='succeeded') && <PdfOcrLiveDraft ref={pdfDraftRef} key={`pdf-draft:${doc.job.id}:${doc.revision}`} jobId={doc.job.id} documentId={doc.id} revision={doc.revision} jobStatus={doc.job.status} api={api} onPendingChange={setPdfDraftPending} onEvents={data=>{if(currentDoc.current?.id===doc.id&&currentDoc.current.job?.id===doc.job?.id)setPdfSharedEvents({jobId:doc.job!.id,generation:data.generation,items:data.items});}} onMerged={async()=>{if(currentDoc.current?.id===doc.id)await openDoc(doc.id);}} onPreparePreview={async pageIndex=>{await prepareUnifiedPreview(doc,pageIndex);}} errorText={code=>messages[code]??code} rotation={{state:doc.pageRotationState??emptyPageRotationState(),disabled:dirty||conflict,apply:async(input,signal)=>{await flushPdfDraft();if(busyRef.current)throw new Error('其他处理正在进行，请稍后重试。');busyRef.current=true;setRotationActive(true);setBusy(true);try{if(!await validateSession())throw new Error('登录已失效，请重新登录。');return await apiRequest(`/documents/${doc.id}/page-rotations`,'POST',{...input,revision:doc.revision},signal?AbortSignal.any([requests.signal,signal]):requests.signal);}finally{busyRef.current=false;setBusy(false);setRotationActive(false);}},onApplied:async()=>{if(currentDoc.current?.id!==doc.id)return;await openDoc(doc.id);await refreshDocs();setNotice('页面旋转已更新，请重新核对并保存复核。');}}}/>}
              {doc.job && (
                <p className="muted" role="status">
                  任务：
                  {
                    (
                      {
                        queued: "排队中",
                        running: "处理中",
                        succeeded: "已完成",
                        failed: "失败",
                        cancelled: "已取消",
                      } as Record<string, string>
                    )[doc.job.status]
                  }{" "}
                  {doc.job.error_code ? messages[doc.job.error_code] ?? "处理失败，请重试" : ""}
                  {canManageJob && doc.job.canObserveEvents && doc.job.ordinaryPdfDetection === true && doc.format === "pdf" && doc.job.kind === "detect" && doc.state === "queued" && ["queued", "running"].includes(doc.job.status) && <button disabled={busy || dirty || conflict} className="quiet" onClick={() => void run(async () => {
                    if (!await confirmAction("暂停图片识别？已完成的页面会保留，稍后可继续识别剩余页面。")) return;
                    await flushPdfDraft();
                    const pausedJob = doc.job!.id;
                    let pauseError: unknown;
                    try { await api(`/jobs/${pausedJob}/pdf-ocr/pause`, "POST", { revision: doc.revision }); }
                    catch (error) { pauseError = error; }
                    const latest = await api<DocumentView>(`/documents/${doc.id}`);
                    await openDoc(doc.id, undefined, latest, true);
                    if (pauseError && !(latest.job?.id === pausedJob && latest.job.status === "cancelled" && latest.job.error_code === "PDF_OCR_PAUSED")) throw pauseError;
                    setNotice("图片识别已暂停，可随时继续");
                  })}>暂停图片识别</button>}
                  {canManageJob && doc.job.canObserveEvents && doc.job.ordinaryPdfDetection === true && doc.format === "pdf" && doc.job.kind === "detect" && doc.state === "queued" && ((doc.job.status === "cancelled" && doc.job.error_code === "PDF_OCR_PAUSED") || (doc.job.status === "queued" && doc.job.pdfOcrPriorityWaiting === true)) && <button disabled={busy || dirty || conflict} className="secondary" onClick={() => void run(async () => {
                    await flushPdfDraft();
                    const pausedJob = doc.job!.id;
                    const wasWaiting = doc.job!.pdfOcrPriorityWaiting === true;
                    let resumeError: unknown;
                    try { await api(`/jobs/${pausedJob}/pdf-ocr/prioritize`, "POST", { revision: doc.revision, requestId: crypto.randomUUID() }); }
                    catch (error) { resumeError = error; }
                    const latest = await api<DocumentView>(`/documents/${doc.id}`);
                    await openDoc(doc.id, undefined, latest, true);
                    if (resumeError && !(latest.job?.kind === "detect" && ["queued", "running", "succeeded"].includes(latest.job.status) && latest.revision === doc.revision && (wasWaiting ? latest.job.id === pausedJob && latest.job.pdfOcrPriorityWaiting !== true : latest.job.id !== pausedJob))) throw resumeError;
                    setNotice("正在继续识别未完成页面");
                  })}>继续图片识别</button>}
                  {canManageJob && doc.state !== "outdated" && ["failed", "cancelled"].includes(doc.job.status) && doc.job.error_code !== "PDF_OCR_PAUSED" && <button disabled={dirty || conflict} className="secondary" onClick={() => void run(async () => {
                    await api("/jobs/" + doc.job!.id + "/retry", "POST", { revision: doc.revision });
                    await openDoc(doc.id);
                  })}>重试任务</button>}
                  {canManageJob && ["queued", "running"].includes(doc.job.status) && (
                    <button
                      className="quiet"
                      disabled={busy || conflict || (doc.job.kind === "detect" && dirty)}
                      onClick={() =>
                        void run(async () => {
                          const documentId = doc.id, projectId = doc.project_id, jobId = doc.job!.id, jobKind = doc.job!.kind;
                          let cancelError: unknown;
                          try { await api("/jobs/" + jobId + "/cancel", "POST"); }
                          catch (error) { cancelError = error; }
                          // A lost response may follow a committed cancellation. Read the
                          // complete material snapshot before deciding what to show or retry.
                          let latest: DocumentView;
                          try { latest = await api<DocumentView>("/documents/" + documentId); }
                          catch (readError) {
                            if (currentDoc.current?.id === documentId && currentProject.current === projectId) {
                              setConflict(true);
                              setNotice("取消结果尚未确认，请重新加载材料状态后继续操作。");
                            }
                            throw readError;
                          }
                          if (jobKind === "detect" || !dirtyRef.current) await openDoc(documentId, undefined, latest, true);
                          if (jobKind === "export" && dirtyRef.current && currentDoc.current?.id === documentId) {
                            // Preserve the local review draft while showing the export outcome.
                            setDoc(current => current?.id === documentId ? { ...current, job: latest.job } : current);
                            if (currentDoc.current.revision !== latest.revision) setConflict(true);
                          }
                          if (currentDoc.current?.id !== documentId || currentProject.current !== latest.project_id) return;
                          await refreshDocs();
                          if (cancelError) {
                            if (latest.job?.id === jobId && latest.job.status === "cancelled") setNotice("取消已生效，已读取最新材料状态。");
                            else throw cancelError;
                          }
                        })
                      }
                    >
                      取消任务
                    </button>
                  )}
                </p>
              )}
              <RevisionHistory key={`history:${doc.id}:${doc.revision}`} load={() => api(`/documents/${doc.id}/revisions`)} disabled={busy || conflict} />
              <div className="actions review-history"><button className="secondary" disabled={!undoStack.length || conflict || doc.state !== "review"} onClick={() => history(false)}>撤销修改</button><button className="quiet" disabled={!redoStack.length || conflict || doc.state !== "review"} onClick={() => history(true)}>重做修改</button><span className="muted">保存前可撤销最近 10 步</span></div>
              </div>
              <div className="review">
                <section className="panel document-pane">
                  <div className="document-mode-bar"><h2>{previewMode && !hasPages ? "处理预览" : "原文"} <small>只读</small></h2>
                  {!hasPages && <div role="group" aria-label="文档视图"><button className={!previewMode ? "active" : "quiet"} aria-pressed={!previewMode} onClick={() => setPreviewMode(false)}>原文审查</button><button className={previewMode ? "active" : "secondary"} disabled={conflict || doc.state !== "review"} onClick={() => void run(async () => {
                    const {doc:current,previewMarks} = await prepareUnifiedPreview(doc);
                    const result = await api<{ text: string }>(`/documents/${current.id}/preview`, "POST", { revision: current.revision, marks:previewMarks, offset: current.textOffset ?? 0 }); setPreview(result.text); setPreviewMode(true);
                  })}>刷新处理预览</button></div>}
                  <div className="document-tool-actions" role="group" aria-label="复核视图">{([
                    ["marks", "敏感标记"], ["search", "全文查找"], ["bulk", "批量复核"], ["known", "漏标检查"],
                  ] as const).map(([key, label]) => <button key={key} className={reviewTool === key ? "active" : "quiet"} aria-pressed={reviewTool === key} onClick={() => { setReviewTool(key); if (key === "search") setPreviewMode(false); }}>{label}</button>)}</div>
                  {canReview&&<label>补录规则范围<select aria-label="补录规则范围" value={manualRuleScope} disabled={busy||conflict||doc.state!=='review'} onChange={e=>setManualRuleScope(e.target.value as typeof manualRuleScope)}><option value="spot">仅添加当前标记</option><option value="file">当前文件</option><option value="project">当前项目</option></select><small>补录规则仅影响尚在进行的识别。</small></label>}
                  <button
                    className="secondary manual-mark-button"
                    disabled={!canReview || !selection || previewMode && !hasPages || doc.state !== "review" || marks.length >= MAX_MARKS || conflict}
                    onClick={() => {
                      if (selection) {
                        const label = doc.text.slice(selection[0] - (doc.textOffset ?? 0), Math.min(selection[1], selection[0] + 120) - (doc.textOffset ?? 0));
                        setDoc(d => d ? { ...d, markTexts: { ...d.markTexts, [`${selection[0]}:${selection[1]}`]: label } } : d);
                        changeMarks([
                          ...marks,
                          {
                            start: selection[0],
                            end: selection[1],
                            kind: "自定义",
                            decision: "pending",
                          },
                        ],"manual-add");
                        setSelection(null);
                      }
                    }}
                  >
                    将选中文字加入标记
                  </button>
                  </div>
                  <div className="material-tools">
                    {project&&allowed("view_original")&&allowed("review")&&<ProjectEntityCorrections projectId={project} document={doc} selectedMark={editingIndex===null?undefined:marks[editingIndex]} selectedMarkIndex={editingIndex??undefined} enabled={!dirty&&!conflict} disabled={busy} api={api} run={run} onApplied={async()=>{await refreshDocs();if(currentDoc.current)await openDoc(currentDoc.current.id);}}/>}
                    {docAllowed("view_original")&&canReview&&<ManualOccurrences documentId={doc.id} revision={doc.revision} marks={marks} busy={busy} disabled={conflict||doc.state!=='review'} search={query=>{if(busyRef.current)throw Error('PROCESSING_BUSY');return api(`/documents/${doc.id}/manual-occurrences`,'POST',{revision:doc.revision,query});}} onMarksChange={(next,previews)=>{changeMarks(next,"one-click-add");if(previews)setDoc(current=>current?.id===doc.id&&current.revision===doc.revision?{...current,markTexts:{...current.markTexts,...previews}}:current);}} onCoveredSelection={selection=>{void automaticRuntimeRules.dispatch(doc.id,doc.revision,{producer:isWordFormat(doc.format)?'manual-add':'one-click-add',before:marks,after:marks},manualRuleScope,selection);}} locate={match=>{const span=match.segments[0];if(span)void run(async()=>{await loadText(Math.max(0,span.start-256),span);setDocxFocus({start:span.start,end:span.end});});}}/>}
                    {docAllowed("view_original") && docAllowed("export") && <MarkdownManualDraft key={`${doc.id}:${doc.revision}`} document={doc} api={api} run={run} restored={manualRecovery} restoreEpoch={manualRestoreEpoch} onDraftChange={setManualRecovery} />}
                    {doc.format === "md" && doc.parseVersion === 2 && doc.state === "review" && docAllowed("view_original") && docAllowed("review") && !dirty && !conflict && <MarkdownBlockers key={`blockers:${doc.id}`} document={doc} api={api} run={run} onChanged={() => openDoc(doc.id)} />}
                    {docAllowed("view_original") && <DocumentRoutePreview key={`document-route:${doc.id}:${doc.revision}`} document={doc} api={api} run={run} />}
                    {isLegacyWordFormat(doc.format) && <DocumentNormalization documentId={doc.id} revision={doc.revision} originalFormat={doc.format} ready={doc.normalization?.ready??false} enabled={docAllowed("view_original") && canReview && !busy && !dirty && !conflict && !["queued","running"].includes(doc.job?.status ?? "")} api={api} onApplied={async () => { await openDoc(doc.id); await refreshDocs(); }} />}
                    {isWordFormat(doc.format) && <DocxImageOcr key={`docx-image-ocr:${doc.id}:${doc.revision}`} documentId={doc.id} revision={doc.revision} enabled={docAllowed("view_original") && canReview && !busy && !dirty && !conflict && doc.state === "review" && !["queued","running"].includes(doc.job?.status ?? "")} api={api} onApplied={async () => { await openDoc(doc.id); await refreshDocs(); setNotice("已应用新的 Word 图片识别版本，请重新逐项复核并保存。"); }} />}
                    <DocumentConfigurationEditor key={`configuration:${doc.id}:${doc.revision}`} doc={doc} api={api} run={run} onChanged={() => openDoc(doc.id)} disabled={!canReview || dirty || conflict || ["queued","running"].includes(doc.job?.status ?? "")} />
                    <AutomaticVisual key={`automatic-visual:${doc.id}:${doc.revision}:${doc.visualCandidates?.length??0}`} doc={doc} value={pageReview} disabled={!canReview || conflict || doc.state !== "review"} change={value => { setPageReview(value); setDirty(true); }} />
                    <OfficeFaces key={`office-faces:${doc.id}:${doc.revision}`} doc={doc} value={pageReview} api={api} run={run} disabled={!canReview || conflict || doc.state !== "review"} change={value => { setPageReview(value); setDirty(true); }} />
                    <ImportedPortableDraft key={`portable-draft:${doc.id}:${doc.revision}`} documentId={doc.id} revision={doc.revision} enabled={doc.state === "review" && docAllowed("review") && docAllowed("view_original") && docAllowed("view_mapping") && !dirty && !conflict} onChanged={() => openDoc(doc.id)} />
                  </div>
                  <div className="document-search" hidden={reviewTool !== "search"}>
                    <ReviewTools key={`search:${doc.id}:${doc.revision}`} surface="search" doc={doc} marks={marks} pageReview={pageReview} update={update} run={run} api={api} canReview={canReview} canUseAliases={docAllowed("view_mapping")} mode={reviewTool === "search" ? "search" : "marks"} showMarks={() => setReviewTool("marks")} disabled={busy || conflict || doc.state !== "review"} locate={span => loadText(Math.max(0, span.start - 256), span)} />
                  </div>
                  {previewMode && !hasPages && <section className="document-output" aria-label="文本处理预览"><p className="muted">当前原文段落的处理结果；待确认项仍显示原值。实际下载还需保存复核并通过文件核验。</p>{preview !== null ? <textarea readOnly aria-label="处理预览" value={preview} /> : <p role="status" className="empty">复核已修改，请刷新处理预览。</p>}</section>}
                  <div hidden={previewMode && !hasPages}>
                  <p className="muted">选中文字后，可补充自定义标记。</p>
                  {hasPages && <PageEditor focusRange={docxFocus} entityGeometry={page=>api(`/documents/${doc.id}/pages/${page}/entity-geometries`,'POST',{revision:doc.revision})} rotation={doc.format==='pdf'?{state:doc.pageRotationState??emptyPageRotationState(),disabled:dirty||conflict,apply:async(input,signal)=>{if(busyRef.current)throw new Error('其他处理正在进行，请稍后重试。');busyRef.current=true;setRotationActive(true);setBusy(true);try{if(!await validateSession())throw new Error('登录已失效，请重新登录。');return await apiRequest(`/documents/${doc.id}/page-rotations`,'POST',{...input,revision:doc.revision},signal?AbortSignal.any([requests.signal,signal]):requests.signal);}finally{busyRef.current=false;setBusy(false);setRotationActive(false);}},onApplied:async()=>{if(currentDoc.current?.id!==doc.id)return;await openDoc(doc.id);await refreshDocs();setNotice('页面旋转已更新，请重新核对并保存复核。');}}:undefined} imageSearch={(query,pageIndex)=>api(`/documents/${doc.id}/image-search`,"POST",{revision:doc.revision,query,...pageIndex!==undefined?{pageIndex}:{}})} key={`${doc.id}:${doc.revision}`} doc={doc} value={pageReview} marks={marks} run={run} onMarksChange={(next,previews)=>{changeMarks(next,"manual-add");if(previews)setDoc(current=>current?.id===doc.id&&current.revision===doc.revision?{...current,markTexts:{...current.markTexts,...previews}}:current);}} ocr={{ disabled: dirty, load: (page, revision) => api(`/documents/${doc.id}/pages/${page}/ocr-text?revision=${revision}`), save: (page, input) => api(`/documents/${doc.id}/pages/${page}/ocr-text`, "PUT", input), onSaved: async () => { if (currentDoc.current?.id !== doc.id) return; await openDoc(doc.id); setNotice("识别文字已更新，请重新确认敏感标记并保存复核。"); } }} imageUtility={async(page,operation,payload)=>{const route=operation==='clear-cache'?`/documents/${doc.id}/ocr-cache/clear`:`/documents/${doc.id}/pages/${page}/${({region:'ocr-region',rerun:'ocr-rerun',labels:'labels',annotations:'annotations'} as const)[operation]}`;if(operation==='labels'||operation==='annotations'){const response=await fetch(appUrl('/api'+route),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await downloadResponse(response,`${operation==='labels'?'训练标注':'图像标注'}-${page+1}.json`);return {};}return api(route,'POST',payload);}} pauseVisualSeals={async page=>{const requestId=visualRequests.current.get(`${doc.id}:${page}`);if(!requestId)throw new Error('VISUAL_REQUEST_NOT_ACTIVE');await api(`/documents/${doc.id}/visual-requests/${requestId}/pause-seals`,'POST',{});}} detectVisual={async(page, detectors)=>{const key=`${doc.id}:${page}`,requestId=crypto.randomUUID();visualRequests.current.set(key,requestId);try{return await api(`/documents/${doc.id}/pages/${page}/visual-candidates`,'POST',{revision:doc.revision,detectors,requestId});}finally{if(visualRequests.current.get(key)===requestId)visualRequests.current.delete(key);}}} previewPage={async index => {
                    const {doc:current,previewMarks} = await prepareUnifiedPreview(doc);
                    const response = await fetch(appUrl(`/api/documents/${current.id}/pages/${index}/preview`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: current.revision, marks:previewMarks, pageReview }), signal: requests.signal });
                    requests.signal.throwIfAborted();
                    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
                    if (!response.ok) { const data = await response.json(); throw new Error(messages[data.error] ?? data.error); }
                    return response.blob();
                  }} disabled={!canReview || (busy&&!rotationActive) || conflict || doc.state !== "review"} change={value => {
                    if (!canReview || busyRef.current || conflict) return;
                    if(JSON.stringify(value)===JSON.stringify(pageReview))return;
                    setUndoStack(stack=>[...stack.slice(-9),{marks,pageReview}]);setRedoStack([]);
                    setPageReview(value); const changed = JSON.stringify(value) !== JSON.stringify(doc.pageReview ?? emptyPageReview()) || JSON.stringify(marks) !== JSON.stringify(doc.marks);
                    setDirty(changed); dirtyRef.current = changed; setNotice("");
                  }} />}
                  {doc.format==='md'&&<MarkdownSourceReview key={`source-review:${doc.id}:${doc.revision}`} documentId={doc.id} revision={doc.revision} enabled={!dirty&&!conflict&&doc.state==='review'} api={api} onLocate={(start,end)=>{void run(async()=>{await loadText(Math.max(0,start-256),{start,end});});}} onSelection={({start,end})=>{if(!canReview)return;void run(async()=>{if(currentDoc.current?.id!==doc.id)return;if(start<(doc.textOffset??0)||end>(doc.textOffset??0)+doc.text.length)await loadText(Math.max(0,start-256));setSelection([start,end]);});}}/>}
                  {doc.format === "csv" && <p className="muted">按单元格顺序展示；标记不可跨越单元格。</p>}
                  {doc.coverage?.some(c => c.status === "blocked") && <div role="alert" className="error"><p>文件存在未处理内容，暂不能导出。</p><ul>{doc.coverage.filter(c => c.status === "blocked").map(c => <li key={c.id}>{c.id}：{c.reason === "MISSING_FORMULA_CACHE" ? "公式缺少已计算的值" : c.reason === "EXTERNAL_OFFICE_OBJECT" ? "包含外部内容引用" : "内容尚未处理"}</li>)}</ul></div>}
                  {isWordFormat(doc.format) && <><div role="group" aria-label="Word审查视图" className="actions"><button className={docxView === "layout" ? "active" : "quiet"} aria-pressed={docxView === "layout"} onClick={() => { setDocxView("layout"); setSelection(null); }}>Word 版式审查</button><button className={docxView === "text" ? "active" : "quiet"} aria-pressed={docxView === "text"} onClick={() => { setDocxView("text"); setSelection(null); }}>对象原文</button></div>{docxView === "layout" && ["review", "outdated"].includes(doc.state) && <DocxReview key={`${doc.id}:${doc.revision}`} documentId={doc.id} revision={doc.revision} marks={marks} api={api} canonicalText={doc.text} canonicalTextOffset={doc.textOffset ?? 0} canonicalTextLength={doc.textLength ?? doc.text.length} disabled={!canReview || busy || conflict || doc.state !== "review"} focusRange={docxFocus} onSelect={range => { if (!range) { setSelection(null); return; } if (range.start < (doc.textOffset ?? 0) || range.end > (doc.textOffset ?? 0) + doc.text.length) void run(async () => { await loadText(Math.max(0, range.start - 256)); setSelection([range.start, range.end]); }); else setSelection([range.start, range.end]); }} onMark={mark => { const index = marks.indexOf(mark); if (index >= 0) { individual.clear();setEntityView("individual"); setMarkPage(Math.floor(index / 50)); setEditingIndex(index); } }} />}</>}
                  <div hidden={isWordFormat(doc.format) && docxView === "layout"}>
                  <div className="highlighted-original">
                  <div className="highlight-layer" ref={highlightLayer}><TextHighlights text={doc.text} offset={doc.textOffset ?? 0} marks={marks} /></div>
                  <textarea
                    ref={original}
                    aria-label="原文"
                    readOnly
                    rows={18}
                    value={doc.text}
                    spellCheck={false}
                    onScroll={e => { if (highlightLayer.current) { highlightLayer.current.scrollTop = e.currentTarget.scrollTop; highlightLayer.current.scrollLeft = e.currentTarget.scrollLeft; } }}
                    onSelect={e=>captureSelection(e.currentTarget)}
                    onKeyUp={e=>captureSelection(e.currentTarget)}
                    onMouseUp={e=>captureSelection(e.currentTarget)}
                  />
                  </div>
                  {(doc.textLength ?? doc.text.length) > doc.text.length && <div className="pagination" aria-label="原文分段">
                    <button className="secondary" disabled={!(doc.textOffset ?? 0) || conflict} onClick={() => void run(() => loadText(Math.max(0, (doc.textOffset ?? 0) - TEXT_PAGE_CHARS)))}>上一段原文</button>
                    <span>文本位置 {(doc.textOffset ?? 0) + 1}–{(doc.textOffset ?? 0) + doc.text.length} / {doc.textLength}</span>
                    <button className="secondary" disabled={doc.nextTextOffset == null || conflict} onClick={() => void run(() => loadText(doc.nextTextOffset!))}>下一段原文</button>
                  </div>}
                  </div>

                  </div>
                </section>
                <section className="panel inspector-pane" aria-label="文档复核">
                  <div className="inspector-marks">
                  <h2>
                    敏感标记 <small>{marks.length} 项</small>
                  </h2>
                  <p className="muted">
                    {pending} 项待确认；重叠的处理范围需要先解决。
                  </p>
                  {docAllowed("view_original")&&<ReviewProvenance key={`provenance:${doc.id}:${doc.revision}`} documentId={doc.id} revision={doc.revision} disabled={busy||dirty||conflict||doc.state!=="review"} api={api} run={run}/>}
                  <div className="entity-view-switch" role="group" aria-label="标记展示方式"><button className={entityView === "groups" ? "active" : "quiet"} aria-pressed={entityView === "groups"} onClick={() => setEntityView("groups")}>按实体</button><button className={entityView === "individual" ? "active" : "quiet"} aria-pressed={entityView === "individual"} onClick={() => { setEntityView("individual"); setEditingIndex(null); }}>逐条复核</button></div>
                  {marks.length >= MAX_MARKS && <p role="alert" className="error">已达到 {MAX_MARKS} 项标记上限，请先删除重复标记。</p>}
                  {!marks.length && (
                    <p className="empty">
                      {doc.state === "queued"
                        ? "等待规则识别…"
                        : "规则无命中，不代表没有敏感信息。可在原文中补充标记。"}
                    </p>
                  )}
                  {entityView === "groups" && <EntityGroups key={`${doc.id}:${doc.revision}`} doc={doc} marks={marks} api={api} refresh={()=>openDoc(doc.id,undefined,undefined,true)} canUseAliases={docAllowed("view_mapping")} filterEntities={async filter=>{const indices:number[]=[];for(let offset=0;;){const result=await api<any>(`/documents/${doc.id}/entity-filter`,'POST',{...filter,revision:doc.revision,marks,offset,limit:1000});indices.push(...result.items.map((item:any)=>item.index));if(!result.hasMore)break;offset=result.nextOffset;}return indices;}} update={(next,cause,fromServer)=>{if(update(next,fromServer)&&cause)void reviewFeedback.dispatch(doc.id,doc.revision,cause);}} locate={span => loadText(Math.max(0, span.start - 256), span)} run={run} disabled={busy || conflict || doc.state !== "review"} draftDisabled={busy || conflict || dirty || doc.state !== "review"} canReview={canReview} onEdit={index => { setDocxFocus({start:marks[index].start,end:marks[index].end}); individual.clear();setEntityView("individual"); setMarkPage(Math.floor(index / 50)); setEditingIndex(index); }} onCheck={() => setReviewTool("known")} />}
                  <div hidden={entityView !== "individual"}>
                  <ReviewMarkFilters marks={marks} value={individual.filter} change={individual.setFilter} disabled={busy||conflict||doc.state!=='review'}/>
                  {individual.loading&&<p role="status">正在查找完整原文中的标记…</p>}{individual.error&&<p role="alert">{individual.error}</p>}{individual.enabled&&!individual.loading&&!individual.error&&<p role="status">符合筛选条件 {individual.total} 项</p>}
                  <div className="marklist">
                    {individual.indices.map(i => {
                      const m = marks[i];
                      return (
                      <article className="mark" id={`review-mark-${i}`} key={i} style={{ "--entity-color": typeColor(m.kind) } as React.CSSProperties}>
                        <div>
                          <button
                            className="quote"
                            onClick={() => {
                              setPreviewMode(false);
                              setDocxFocus({ start: m.start, end: m.end });
                              if(doc.anchors?.some(a=>a.start<m.end&&a.end>m.start&&(a.kind==='page'||a.kind==='object'&&a.object==='image-text')))return;
                              const offset = doc.textOffset ?? 0;
                              if (m.start < offset || m.end > offset + doc.text.length) { void run(() => loadText(Math.max(0, m.start - 256), m)); return; }
                              setPendingAuditFocus({documentId:doc.id,projectId:doc.project_id,revision:doc.revision,textOffset:offset,start:m.start,end:m.end});
                            }}
                          >
                            {m.start >= (doc.textOffset ?? 0) && m.end <= (doc.textOffset ?? 0) + doc.text.length ? doc.text.slice(m.start - (doc.textOffset ?? 0), Math.min(m.end, m.start + 120) - (doc.textOffset ?? 0)) : doc.markTexts?.[`${m.start}:${m.end}`] ?? "定位原文"}
                          </button>
                          {m.hiddenByType&&<p className="muted">已按类型隐藏，不参与处理。<button className="quiet" disabled={!canReview||conflict||doc.state!=="review"} onClick={()=>update(restoreHiddenReviewEntities(marks,m))}>恢复此类型为待确认</button></p>}{(()=>{const corrected=correctionForMark(doc,m,i);return corrected?<p className="muted">OCR 纠正为：{corrected.correctedText}</p>:null;})()}
                          <small>
                            {m.signatureGroup ? `签名姓名 ${signatureGroupLabel(marks,m.signatureGroup.id,doc.text,doc.textOffset??0,doc.markTexts)} · 第 ${m.signatureGroup.memberIndex+1}/${m.signatureGroup.memberCount} 格 · 整组决定 · ` : ""}{entityLabel(m)} · {m.start}-{m.end}
                            {m.sources?.length ? ` · ${[...new Set(m.sources.map(s => ({ rules: "规则匹配", ner: "实体识别", ai: "语义识别", manual: "人工标记" })[s.layer]))].join("、")}` : ""}
                            {m.sources?.some(s => s.code === "project-whitelist") ? " · 白名单建议" : ""}
                            {doc.format === "csv" && (() => { const a = doc.anchors?.find(a => a.start <= m.start && a.end >= m.end); return a ? ` · 第 ${a.row} 行 / 第 ${a.column} 列` : ""; })()}
                          </small>
                        </div>
                        <label>
                          处理决定
                          <select
                            disabled={!canReview || conflict || doc.state !== "review" || m.hiddenByType}
                            aria-label={"标记 " + (i + 1) + " 处理决定"}
                            value={m.decision}
                            onChange={(e) =>
                              update(applySignatureDecision(marks,new Set([i]),e.target.value as Mark["decision"]))
                            }
                          >
                            <option value="pending">待确认</option>
                            <option value="redact">脱敏处理</option>
                            <option value="ignore">保留原值</option>
                          </select>
                        </label>
                        <label>信息类型<select aria-label={`标记 ${i + 1} 信息类型`} disabled={!canReview || conflict || doc.state !== "review" || m.hiddenByType || !!m.signatureGroup} value={entityIdentity(m)} onChange={e => update(marks.map((v, j) => j === i ? { ...v, kind: e.target.value as Mark["kind"], rawEntityType:undefined,replacement: undefined, rasterReplacement:undefined,replacementOrigin: undefined, sources: [{ layer: "manual", code: "human-mark" }] } : v))}>{m.rawEntityType!==undefined&&<option value={entityIdentity(m)}>{entityLabel(m)}</option>}{markSchema.shape.kind.options.map(k => <option key={k}>{k}</option>)}</select></label>{m.kind==="自定义"&&<label>自定义类型名称<input value={m.rawEntityType??""} placeholder="留空使用通用自定义类型" disabled={!canReview||conflict||doc.state!=="review"} onChange={e=>update(marks.map((v,j)=>j===i?{...v,rawEntityType:e.target.value||undefined,replacement:undefined,rasterReplacement:undefined,replacementOrigin:undefined,sources:[{layer:"manual",code:"human-mark"}]}:v))}/></label>}
                        {m.decision === "redact" && <fieldset disabled={!canReview || conflict || doc.state !== "review"}><ReplacementEditor mark={m} index={i} change={replacement => update(marks.map((v, j) => j === i ? { ...v, replacement, rasterReplacement:undefined,replacementOrigin: "manual" } : v))} />{docAllowed("view_mapping") && <MappingPicker key={`${doc.id}:${doc.revision}:${entitySpanKey(m)}`} doc={doc} mark={m} markIndex={i} run={run} api={api} assigned={replacement => update(marks.map((v, j) => j === i ? { ...v, replacement, rasterReplacement:undefined,replacementOrigin: "manual" } : v), true)} />}</fieldset>}
                        <button
                          className="quiet"
                          disabled={!canReview || conflict || doc.state !== "review" || !!m.signatureGroup}
                          onClick={() =>
                            changeMarks(marks.filter((_, j) => i !== j),"single-delete")
                          }
                        >
                          删除标记
                        </button>
                      </article>
                    ); })}
                  </div>
                  {pageCount > 1 && <div className="pagination" aria-label="标记分页">
                    <button className="secondary" disabled={page === 0} onClick={() => setMarkPage(page - 1)}>上一页</button>
                    <span>第 {page + 1} / {pageCount} 页 · 每页 50 项</span>
                    <button className="secondary" disabled={page === pageCount - 1} onClick={() => setMarkPage(page + 1)}>下一页</button>
                  </div>}
                  </div>
                  </div>
                </section>
              </div>
              <ReviewToolDialog error={error} open={reviewTool === "bulk" || reviewTool === "known"} title={reviewTool === "bulk" ? "批量复核" : "漏标检查"} close={() => setReviewTool("marks")}>
                <ReviewTools key={`actions:${doc.id}:${doc.revision}`} surface="actions" doc={doc} marks={marks} pageReview={pageReview} onAddMissing={next=>changeMarks(next,"audit-add")} update={update} run={run} api={api} canReview={canReview} canUseAliases={docAllowed("view_mapping")} mode={reviewTool === "bulk" || reviewTool === "known" ? reviewTool : "marks"} showMarks={() => setReviewTool("marks")} disabled={busy || conflict || doc.state !== "review"} locate={async span => { setReviewTool("marks"); await loadText(Math.max(0, span.start - 256), span); }} />
              </ReviewToolDialog>
              {collapsed && exportControls}
            </>
          )}
        </div></main>
      </div>
    </fieldset>
  );
}
createRoot(document.getElementById("root")!).render(<><SessionWorkspace /><ConfirmationDialog /></>);
