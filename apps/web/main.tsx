import {MarkdownBlockers} from "./markdown-blockers.tsx";
import {ProcessingProgress} from "./processing-progress.tsx";
import { MarkdownManualDraft } from "./markdown-manual-draft.tsx";
import {entityIdentity,entityLabel,entitySpanKey} from '../../packages/core/entity-identity.ts';
import { OcrDiagnostics } from "./image-utilities.tsx";
import {SupportPanel,installRendererErrorReporter} from "./support.tsx";
import {ProcessingObservability} from "./processing-observability.tsx";
import {ReferenceDictionaryFiles} from "./reference-dictionary.tsx";
import {RestorationBatch} from "./restoration-batch.tsx";
import {FeedbackPanel} from "./feedback.tsx";
import {RecoveryDraft,RecentWorkspaces} from "./workspace-recovery.tsx";
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
import { TextHighlights, typeColor } from "./text-highlights.tsx";
import { EntityGroups } from "./entity-groups.tsx";
import { MappingPicker, MappingList, RestoreDialog } from "./mappings.tsx";
import {MappingExport} from './mapping-export.tsx';
import { BatchReview } from "./batch-review.tsx";
import { PageEditor, emptyPageReview } from "./page-review.tsx";
import { OrganizationDialog, ProjectMembers, AuditPanel } from "./members.tsx";
import { HamburgerMenuIcon, PlusIcon, FileTextIcon, ExitIcon, PersonIcon, ChevronRightIcon } from "@radix-ui/react-icons";
const messages: Record<string, string> = {
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
  DOCUMENT_PASSWORD_INCORRECT: "文件密码不正确，请重新输入。",
  DOCUMENT_INTEGRITY_MISMATCH: "加密文件完整性核验失败，请核对原文件。",
  DOCUMENT_ENCRYPTION_UNSUPPORTED: "此文件加密方式暂不支持。",
  DOCUMENT_PASSWORD_INVALID: "文件密码不正确，请重新输入。",
  DOCUMENT_UNLOCK_VERIFICATION_FAILED: "解锁后的文件未通过完整性核验。",
  DOCUMENT_UNLOCK_UNSUPPORTED: "此文件加密方式暂不支持。",
  DOCUMENT_LEGACY_CONVERSION_REQUIRED: "旧版 Word／Excel 文件需要先转换为 docx／xlsx。",
  ENCRYPTED_PDF: "PDF 已加密，请先使用有权访问的解密副本",
  PAGE_LIMIT: "PDF 最多支持 300 页，请拆分文件",
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
async function apiRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(appUrl("/api" + path), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await r.json();
  signal?.throwIfAborted();
  if (r.status === 401) window.dispatchEvent(new Event("session-expired"));
  if (!r.ok) throw Object.assign(new Error(messages[data.error] ?? data.error), { code: data.error, status: r.status });
  return data;
}
type SessionControls = { validateSession: () => Promise<boolean>; rememberSession: (username: string | null) => void; sessionNotice: string };
function SessionWorkspace() {
  const identity = useRef<string | null | undefined>(undefined);
  const checking = useRef<Promise<boolean> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const [generation, setGeneration] = useState(0), [sessionNotice, setSessionNotice] = useState("");
  const rememberSession = useCallback((username: string | null) => {
    const changed = identity.current !== undefined && identity.current !== username;
    identity.current = username;
    if (changed) {
      setSessionNotice("");
      setGeneration(value => value + 1);
      channel.current?.postMessage("changed");
    }
  }, []);
  const validateSession = useCallback((): Promise<boolean> => {
    if (identity.current === undefined) return Promise.resolve(true);
    if (!checking.current) checking.current = apiRequest<{ username: string | null }>("/session").then(next => {
      if (next.username === identity.current) return true;
      identity.current = next.username;
      setSessionNotice(next.username ? "登录账号已切换，已刷新当前账号的项目列表。" : "登录状态已变化，请重新登录。");
      // Remount every workspace component so no previous account's projects, dialogs or drafts remain.
      setGeneration(value => value + 1);
      return false;
    }).finally(() => { checking.current = null; });
    return checking.current;
  }, []);
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
  const [user, setUser] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(sessionNotice),
    [conflict, setConflict] = useState(false),
    [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string; permissions: Permission[] }[]>([]),
    [project, setProject] = useState(""),
    [docs, setDocs] = useState<{ id: string; state: string; name?: string; job_state?: string; revision?: number }[]>([]),
    [doc, setDoc] = useState<DocumentView | null>(null),
    [marks, setMarks] = useState<Mark[]>([]),
    [dirty, setDirty] = useState(false);
  const [text, setText] = useState(""),
    [selection, setSelection] = useState<[number, number] | null>(null),
    [requestId, setRequestId] = useState(crypto.randomUUID());
  const [markPage, setMarkPage] = useState(0);
  const [feedbackOpen,setFeedbackOpen]=useState(false);
  const [pageReview, setPageReview] = useState<PageReview>(emptyPageReview);
  const [undoStack, setUndoStack] = useState<Mark[][]>([]), [redoStack, setRedoStack] = useState<Mark[][]>([]);
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
  const [docsLoading, setDocsLoading] = useState(false);
  const [moreProjects, setMoreProjects] = useState(false), [moreDocs, setMoreDocs] = useState(false);
  const original = useRef<HTMLTextAreaElement>(null);
  const highlightLayer = useRef<HTMLDivElement>(null);
  useEffect(() => { setReviewTool("marks"); }, [doc?.id, doc?.revision]);
  const busyRef = useRef(false), dirtyRef = useRef(false);
  const currentDoc = useRef(doc);
  const visualRequests = useRef(new Map<string,string>());
  const allowed = (permission: Permission) => (projects.find(p => p.id === project)?.permissions ?? []).includes(permission);
  const docAllowed = (permission: Permission) => (doc?.permissions ?? []).includes(permission);
  const canReview = docAllowed("review");
  const canManageJob = !!doc?.job?.required_permissions?.length && doc.job.required_permissions.every(docAllowed);
  useEffect(() => {
    if (doc) setDocs(current => current.map(item => item.id === doc.id ? { ...item, state: doc.state, revision: doc.revision, job_state: doc.job?.status } : item));
  }, [doc?.id, doc?.revision, doc?.state, doc?.job?.status]);
  currentDoc.current = doc;
  dirtyRef.current = dirty;
  useEffect(() => {
    const expire = () => {
      rememberSession(null);
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
      setError((e as Error).message);
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
    const next = await api<typeof docs>(`/projects/${project}/documents?limit=20&offset=${append ? docs.length : 0}`);
    setDocs(current => append ? [...current, ...next] : next);
    setMoreDocs(next.length === 20);
  }
  async function openDoc(id: string) {
    const d = await api<DocumentView>("/documents/" + id);
    setDoc(d);
    setDocxFocus(null);
    setMarks(d.marks);
    setDirty(false);
    setSelection(null);
    setConflict(false);
    setMarkPage(0);
    setPageReview(d.pageReview ?? emptyPageReview());
    setUndoStack([]); setRedoStack([]); setPreview(null);
    setImporting(false);
    void api(`/projects/${d.project_id}/workspace/recent`,"POST",{documentId:d.id}).catch(()=>{});
  }
  useEffect(() => {
    api<{ username: string | null }>("/session")
      .then(async (u) => {
        rememberSession(u.username);
        setUser(u.username);
        if (u.username) await refresh().catch((e) => setError(e.message));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(()=>{
    if(!ready||!user||!collaborationJob)return;
    let active=true;
    void (async()=>{
      const task=await api<{projectId:string}>(`/ai-collab/tasks/${collaborationJob}`);
      const target=await api<{id:string;name:string;permissions:Permission[]}>(`/projects/${task.projectId}`);
      if(!active)return;
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
          setDoc(d);
          setMarks(d.marks);
          setPageReview(d.pageReview ?? emptyPageReview());
        })
        .catch((e) => { if (active) setError(e.message); })
        .finally(() => { inFlight = false; });
    }, 800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [doc?.id, doc?.revision, doc?.textOffset, doc?.job?.status, dirty, busy, conflict]);
  async function loadText(offset: number, mark?: { start: number; end: number }) {
    if (mark) setDocxFocus(mark);
    const current = currentDoc.current;
    if (!current) return;
    const next = await api<DocumentView>(`/documents/${current.id}?offset=${offset}&revision=${current.revision}`);
    if (next.revision !== current.revision) throw new Error(messages.VERSION_CONFLICT);
    setDoc(d => d?.id === current.id ? { ...d, text: next.text, textOffset: next.textOffset, textLength: next.textLength, nextTextOffset: next.nextTextOffset, markTexts: { ...next.markTexts, ...d.markTexts } } : d);
    setSelection(null);
    setPreview(null);
    setPreviewMode(false);
    if (mark) requestAnimationFrame(() => {
      original.current?.focus(); original.current?.setSelectionRange(mark.start - (next.textOffset ?? 0), mark.end - (next.textOffset ?? 0));
    });
  }
  function update(next: Mark[], fromServer = false) {
    if (!canReview || (busyRef.current && !fromServer) || conflict || doc?.state !== "review" || currentDoc.current?.id !== doc.id) return;
    // ponytail: 10 in-memory edit steps, sharing unchanged mark objects; encrypted recovery drafts are stored separately.
    setUndoStack(stack => [...stack.slice(-9), marks]); setRedoStack([]); setPreview(null);
    dirtyRef.current = true;
    setMarks(next);
    setDirty(true);
    setNotice("");
  }
  function history(redo: boolean) {
    const source = redo ? redoStack : undoStack, next = source.at(-1);
    if (!canReview || !next || busyRef.current || conflict) return;
    if (redo) { setRedoStack(source.slice(0, -1)); setUndoStack(stack => [...stack.slice(-9), marks]); }
    else { setUndoStack(source.slice(0, -1)); setRedoStack(stack => [...stack.slice(-9), marks]); }
    setMarks(next); const changed = JSON.stringify(next) !== JSON.stringify(doc?.marks) || JSON.stringify(pageReview) !== JSON.stringify(doc?.pageReview ?? emptyPageReview());
    setDirty(changed); dirtyRef.current = changed; setPreview(null); setNotice("");
  }
  function captureSelection(t:HTMLTextAreaElement){
    const offset = currentDoc.current?.textOffset ?? 0;
    setSelection(t.selectionStart<t.selectionEnd?[t.selectionStart + offset,t.selectionEnd + offset]:null);
  }
  const feedbackDocument=doc?{id:doc.id,revision:doc.revision,name:doc.name??"文本材料",text:doc.text,textOffset:doc.textOffset??0}:undefined;
  const pending = marks.filter((m) => m.decision === "pending").length;
  const pageCount = Math.max(1, Math.ceil(marks.length / 50));
  const page = Math.min(markPage, pageCount - 1);
  const hasPages = !!doc?.pages?.length;
  const isPaged = ["pdf", "png", "jpg", "jpeg"].includes(doc?.format ?? "txt");
  const outputFormat = isPaged && doc?.format !== "pdf" ? "png" : doc?.format ?? "txt";
  if (!ready) return <main>正在连接工作台…</main>;
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
                    {doc.format === "docx" && " 副本移除超链接和动态域指令，保留已显示的文字。"}
                  </p></details>
                </div>
                <button
                  className="secondary"
                  disabled={!canReview || !dirty || busy || conflict || doc.state !== "review"}
                  onClick={() =>
                    void run(async () => {
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
                <button
                  disabled={
                    !docAllowed("export") || dirty || pending > 0 || doc.state !== "review" || busy || conflict || hasPages && doc.pageReview?.mode !== "raster" || !!doc.coverage?.some(c => c.status === "blocked")
                  }
                  onClick={() =>
                    void run(async () => {
                      await api("/documents/" + doc.id + "/export", "POST", {
                        revision: doc.revision,
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
      <header className="workspace-topbar"><div className="brand">脱敏汪 <small>文档脱敏工作台</small></div><span>{doc ? "人工复核" : importing ? "导入材料" : "项目空间"}</span></header>
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
                void run(async () => { await api(`/documents/${doc.id}/delete`, "POST", { revision: doc.revision }); setDoc(null); setMarks([]); setDirty(false); setConflict(false); await refreshDocs(); setNotice("材料已删除，不能恢复。已签发链接到期后清除对应文件。"); });
              }}>删除材料</button>}
              <button className="secondary" onClick={async () => {
                if (dirty && !await confirmAction("放弃未保存的复核？")) return;
                setDoc(null); setDirty(false); setConflict(false); setImporting(false);
              }}>返回材料列表</button>
              <button
                className="secondary"
                disabled={!allowed("upload")}
                onClick={async () => {
                  if (!dirty || await confirmAction("放弃未保存的复核？")) {
                    setDoc(null); setMarks([]); setDirty(false); setConflict(false); setSelection(null); setImporting(true);
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
            <RecentWorkspaces api={api} disabled={busy||dirty} onOpen={async(projectId,documentId)=>{await run(async()=>{const p=await api<typeof projects[number]>(`/projects/${projectId}`);setProjects(v=>v.some(x=>x.id===p.id)?v:[...v,p]);setProject(projectId);if(documentId)await openDoc(documentId);else setDoc(null);});}} />
            {project && <NetworkPolicy projectId={project} api={api} disabled={busy||!allowed("manage_models")} />}
            {project && allowed("view_original") && <AiCollaboration key={`collaboration:${project}`} project={project} focusJob={collaborationJob} documents={docs} api={api} run={run} onOpen={id => void run(() => openDoc(id))} />}
            {project && allowed("view_original") && allowed("review") && <ProjectEntities key={`entities:${project}`} project={project} api={api} run={run} changed={() => refreshDocs()} />}
            <WorkspacePortable key={`portable:${project}`} projectId={project || null} canExport={allowed("export") && allowed("view_original") && allowed("view_mapping")} canApply={allowed("manage_dictionary")&&allowed("review")&&!dirty} onApplied={async()=>{await refresh();setDoc(null);await refreshDocs();}} onImported={async id => { await refresh(); setProject(id); setDoc(null); }} />
            {project && <RestorationBatch key={`batch-restore:${project}`} projectId={project} enabled={allowed("restore")} />}
            {project && <RestorationFiles key={`restoration:${project}`} projectId={project} enabled={allowed("restore")} />}
            <PresetManager key={`presets:${project}`} project={project || undefined} permissions={projects.find(p => p.id === project)?.permissions} run={run} api={api} onPending={setDictionaryDirty} onApplied={async () => { await refreshDocs(); }} />
            {project && allowed("manage_dictionary") && <Dictionary key={project} project={project} signal={requests.signal} run={run} changed={() => refreshDocs()} onPending={setDictionaryDirty} active={activeTool === "dictionary"} activate={() => setActiveTool("dictionary")} />}
            {project && allowed("view_mapping") && <MappingList key={`mapping:${project}`} project={project} run={run} api={api} active={activeTool === "mapping"} activate={() => setActiveTool("mapping")} />}
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
                  <span className={"material-status " + (d.job_state ?? "")}>{d.state === "outdated" ? "需重新识别" : d.job_state === "failed" ? "处理失败" : d.job_state === "cancelled" ? "已取消" : d.state === "queued" ? "处理中" : "可复核"}</span>
                  <span className="material-open">打开 <ChevronRightIcon /></span>
                </button> : <div className="material-row limited-material" key={d.id}><span className="material-name"><FileTextIcon />材料 {docs.length - i}</span><span className="material-status">{d.job_state === "running" || d.job_state === "queued" ? "处理中" : d.state === "review" ? "已识别" : "待处理"}</span><div className="actions">
                  {allowed("export") && <><button className="secondary" disabled={d.state !== "review" || ["queued", "running"].includes(d.job_state ?? "")} onClick={() => void run(async () => { await api(`/documents/${d.id}/export`, "POST", { revision: d.revision }); await refreshDocs(); })}>生成副本</button><button className="quiet" onClick={() => void run(async () => { const result = await api<{ url: string }>(`/documents/${d.id}/download-link`, "POST", { revision: d.revision }); const a = document.createElement("a"); a.href = appUrl(result.url); a.click(); })}>下载副本</button></>}
                  {allowed("restore") && <RestoreDialog doc={{ id: d.id, revision: d.revision ?? 0 }} disabled={d.state !== "review"} run={run} api={api} />}
                  {allowed("delete_material") && <button className="quiet" onClick={async () => { if (await confirmAction("永久删除此材料的原件、复核和副本？不能恢复。项目共享词表、假名映射仍保留；已签发链接到期后清除文件。")) void run(async () => { await api(`/documents/${d.id}/delete`, "POST", { revision: d.revision }); await refreshDocs(); }); }}>删除材料</button>}
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
                  自动识别 {doc.layers.rules === "completed" ? "已完成" : "待处理"}
                </span>
                <span>
                  复核版本 {doc.revision}
                  {dirty ? " · 未保存" : ""}
                </span>
              </div>
              {doc.state === "outdated" && <p className="error" role="alert">项目词表已更新，请重新识别后复核。原有复核记录仍保留。</p>}
              <div className="actions">
                <button className="secondary" disabled={!canReview || dirty || conflict || ["queued", "running"].includes(doc.job?.status ?? "")} onClick={async () => {
                  if (await confirmAction("重新识别将创建新复核版本，原有处理决定不会自动沿用。确定继续？")) void run(async () => { await api(`/documents/${doc.id}/recognize`, "POST", { revision: doc.revision, ner: false }); await openDoc(doc.id); });
                }}>重新识别</button>
                {doc.canRunNer && canReview && docAllowed("manage_models") && <button className="secondary" disabled={dirty || conflict || ["queued", "running"].includes(doc.job?.status ?? "")} onClick={async () => {
                  if (await confirmAction("识别人名、机构和地址候选，并创建新复核版本。原有处理决定不会自动沿用，确定继续？")) void run(async () => { await api(`/documents/${doc.id}/recognize`, "POST", { revision: doc.revision, ner: true }); await openDoc(doc.id); });
                }}>识别实体候选</button>}
                {doc.visualDiagnostics&&!doc.visualDiagnostics.complete&&<p role="alert" className="error">部分页面的自动视觉检测未完成，请人工核对人脸、印章和签名区域后再保存复核。受影响页：{doc.visualDiagnostics.pages.filter(p=>p.warnings.length).map(p=>p.page+1).join("、")}</p>}
              {doc.layers.ner === "completed" && <span className="muted">实体候选已识别，请结合上下文复核。</span>}
              </div>
              {canReview && doc.job?.status==="failed" && ["ENCRYPTED_PDF","ENCRYPTED_OFFICE"].includes(doc.job.error_code??"") && <DocumentUnlock id={doc.id} revision={doc.revision} api={api} disabled={dirty||conflict} onDone={()=>openDoc(doc.id)} />}
              <button className="secondary" disabled={busy} onClick={()=>setFeedbackOpen(v=>!v)}>反馈与个人规则</button>{feedbackOpen&&<FeedbackPanel key={`feedback-doc:${doc.id}`} project={doc.project_id} document={feedbackDocument} api={api} run={run}/>}
              {canReview && doc.state==="review" && <RecoveryDraft key={`recovery:${doc.id}:${doc.revision}`} doc={doc} marks={marks} pageReview={pageReview} dirty={dirty} disabled={busy||conflict} api={api} onRestore={(next,pages)=>{if(pages)setPageReview(pages);update(next,true);}} />}
              {doc.job?.canObserveEvents === true && docAllowed("view_original") && <ProcessingProgress key={`progress:${doc.job.id}`} job={doc.job} api={api} />}
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
                  {canManageJob && doc.state !== "outdated" && ["failed", "cancelled"].includes(doc.job.status) && <button disabled={dirty || conflict} className="secondary" onClick={() => void run(async () => {
                    await api("/jobs/" + doc.job!.id + "/retry", "POST", { revision: doc.revision });
                    await openDoc(doc.id);
                  })}>重试任务</button>}
                  {canManageJob && ["queued", "running"].includes(doc.job.status) && (
                    <button
                      className="quiet"
                      onClick={() =>
                        void run(async () => {
                          await api("/jobs/" + doc.job!.id + "/cancel", "POST");
                          const latest = await api<DocumentView>("/documents/" + doc.id);
                          setDoc(current => current?.id === doc.id ? { ...current, job: latest.job } : current);
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
                    const result = await api<{ text: string }>(`/documents/${doc.id}/preview`, "POST", { revision: doc.revision, marks, offset: doc.textOffset ?? 0 }); setPreview(result.text); setPreviewMode(true);
                  })}>刷新处理预览</button></div>}
                  <div className="document-tool-actions" role="group" aria-label="复核视图">{([
                    ["marks", "敏感标记"], ["search", "全文查找"], ["bulk", "批量复核"], ["known", "漏标检查"],
                  ] as const).map(([key, label]) => <button key={key} className={reviewTool === key ? "active" : "quiet"} aria-pressed={reviewTool === key} onClick={() => { setReviewTool(key); if (key === "search") setPreviewMode(false); }}>{label}</button>)}</div>
                  <button
                    className="secondary manual-mark-button"
                    disabled={!canReview || !selection || previewMode && !hasPages || doc.state !== "review" || marks.length >= MAX_MARKS || conflict}
                    onClick={() => {
                      if (selection) {
                        const label = doc.text.slice(selection[0] - (doc.textOffset ?? 0), Math.min(selection[1], selection[0] + 120) - (doc.textOffset ?? 0));
                        setDoc(d => d ? { ...d, markTexts: { ...d.markTexts, [`${selection[0]}:${selection[1]}`]: label } } : d);
                        update([
                          ...marks,
                          {
                            start: selection[0],
                            end: selection[1],
                            kind: "自定义",
                            decision: "pending",
                          },
                        ]);
                        setSelection(null);
                      }
                    }}
                  >
                    将选中文字加入标记
                  </button>
                  </div>
                  <div className="material-tools">
                    {docAllowed("view_original") && docAllowed("export") && <MarkdownManualDraft key={`${doc.id}:${doc.revision}`} document={doc} api={api} run={run} />}
                    {doc.format === "md" && doc.parseVersion === 2 && doc.state === "review" && docAllowed("view_original") && docAllowed("review") && !dirty && !conflict && <MarkdownBlockers key={`blockers:${doc.id}`} document={doc} api={api} run={run} onChanged={() => openDoc(doc.id)} />}
                    <DocumentConfigurationEditor key={`configuration:${doc.id}:${doc.revision}`} doc={doc} api={api} run={run} onChanged={() => openDoc(doc.id)} disabled={!canReview || dirty || conflict || ["queued","running"].includes(doc.job?.status ?? "")} />
                    <AutomaticVisual key={`automatic-visual:${doc.id}:${doc.revision}`} doc={doc} value={pageReview} disabled={!canReview || conflict || doc.state !== "review"} change={value => { setPageReview(value); setDirty(true); }} />
                    <OfficeFaces key={`office-faces:${doc.id}:${doc.revision}`} doc={doc} value={pageReview} api={api} run={run} disabled={!canReview || conflict || doc.state !== "review"} change={value => { setPageReview(value); setDirty(true); }} />
                    <ImportedPortableDraft key={`portable-draft:${doc.id}:${doc.revision}`} documentId={doc.id} revision={doc.revision} enabled={doc.state === "review" && docAllowed("review") && docAllowed("view_original") && docAllowed("view_mapping") && !dirty && !conflict} onChanged={() => openDoc(doc.id)} />
                  </div>
                  <div className="document-search" hidden={reviewTool !== "search"}>
                    <ReviewTools key={`search:${doc.id}:${doc.revision}`} surface="search" doc={doc} marks={marks} pageReview={pageReview} update={update} run={run} api={api} canReview={canReview} canUseAliases={docAllowed("view_mapping")} mode={reviewTool === "search" ? "search" : "marks"} showMarks={() => setReviewTool("marks")} disabled={busy || conflict || doc.state !== "review"} locate={span => loadText(Math.max(0, span.start - 256), span)} />
                  </div>
                  {previewMode && !hasPages && <section className="document-output" aria-label="文本处理预览"><p className="muted">当前原文段落的处理结果；待确认项仍显示原值。实际下载还需保存复核并通过文件核验。</p>{preview !== null ? <textarea readOnly aria-label="处理预览" value={preview} /> : <p role="status" className="empty">复核已修改，请刷新处理预览。</p>}</section>}
                  <div hidden={previewMode && !hasPages}>
                  <p className="muted">选中文字后，可补充自定义标记。</p>
                  {hasPages && <PageEditor imageSearch={(query,pageIndex)=>api(`/documents/${doc.id}/image-search`,"POST",{revision:doc.revision,query,...pageIndex!==undefined?{pageIndex}:{}})} key={`${doc.id}:${doc.revision}`} doc={doc} value={pageReview} marks={marks} run={run} ocr={{ disabled: dirty, load: (page, revision) => api(`/documents/${doc.id}/pages/${page}/ocr-text?revision=${revision}`), save: (page, input) => api(`/documents/${doc.id}/pages/${page}/ocr-text`, "PUT", input), onSaved: async () => { if (currentDoc.current?.id !== doc.id) return; await openDoc(doc.id); setNotice("识别文字已更新，请重新确认敏感标记并保存复核。"); } }} imageUtility={async(page,operation,payload)=>{const route=operation==='clear-cache'?`/documents/${doc.id}/ocr-cache/clear`:`/documents/${doc.id}/pages/${page}/${({region:'ocr-region',rerun:'ocr-rerun',labels:'labels',annotations:'annotations'} as const)[operation]}`;if(operation==='labels'||operation==='annotations'){const response=await fetch(appUrl('/api'+route),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await downloadResponse(response,`${operation==='labels'?'训练标注':'图像标注'}-${page+1}.json`);return {};}return api(route,'POST',payload);}} pauseVisualSeals={async page=>{const requestId=visualRequests.current.get(`${doc.id}:${page}`);if(!requestId)throw new Error('VISUAL_REQUEST_NOT_ACTIVE');await api(`/documents/${doc.id}/visual-requests/${requestId}/pause-seals`,'POST',{});}} detectVisual={async(page, detectors)=>{const key=`${doc.id}:${page}`,requestId=crypto.randomUUID();visualRequests.current.set(key,requestId);try{return await api(`/documents/${doc.id}/pages/${page}/visual-candidates`,'POST',{revision:doc.revision,detectors,requestId});}finally{if(visualRequests.current.get(key)===requestId)visualRequests.current.delete(key);}}} previewPage={async index => {
                    const response = await fetch(appUrl(`/api/documents/${doc.id}/pages/${index}/preview`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: doc.revision, marks, pageReview }), signal: requests.signal });
                    requests.signal.throwIfAborted();
                    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
                    if (!response.ok) { const data = await response.json(); throw new Error(messages[data.error] ?? data.error); }
                    return response.blob();
                  }} disabled={!canReview || busy || conflict || doc.state !== "review"} change={value => {
                    if (!canReview || busyRef.current || conflict) return;
                    setPageReview(value); const changed = JSON.stringify(value) !== JSON.stringify(doc.pageReview ?? emptyPageReview()) || JSON.stringify(marks) !== JSON.stringify(doc.marks);
                    setDirty(changed); dirtyRef.current = changed; setNotice("");
                  }} />}
                  {doc.format === "csv" && <p className="muted">按单元格顺序展示；标记不可跨越单元格。</p>}
                  {doc.coverage?.some(c => c.status === "blocked") && <div role="alert" className="error"><p>文件存在未处理内容，暂不能导出。</p><ul>{doc.coverage.filter(c => c.status === "blocked").map(c => <li key={c.id}>{c.id}：{c.reason === "MISSING_FORMULA_CACHE" ? "公式缺少已计算的值" : c.reason === "EXTERNAL_OFFICE_OBJECT" ? "包含外部内容引用" : "内容尚未处理"}</li>)}</ul></div>}
                  {doc.format === "docx" && <><div role="group" aria-label="Word审查视图" className="actions"><button className={docxView === "layout" ? "active" : "quiet"} aria-pressed={docxView === "layout"} onClick={() => { setDocxView("layout"); setSelection(null); }}>Word 版式审查</button><button className={docxView === "text" ? "active" : "quiet"} aria-pressed={docxView === "text"} onClick={() => { setDocxView("text"); setSelection(null); }}>对象原文</button></div>{docxView === "layout" && ["review", "outdated"].includes(doc.state) && <DocxReview key={`${doc.id}:${doc.revision}`} documentId={doc.id} revision={doc.revision} marks={marks} api={api} disabled={!canReview || busy || conflict || doc.state !== "review"} focusRange={docxFocus} onSelect={range => { if (!range) { setSelection(null); return; } if (range.start < (doc.textOffset ?? 0) || range.end > (doc.textOffset ?? 0) + doc.text.length) void run(async () => { await loadText(Math.max(0, range.start - 256)); setSelection([range.start, range.end]); }); else setSelection([range.start, range.end]); }} onMark={mark => { const index = marks.indexOf(mark); if (index >= 0) { setEntityView("individual"); setMarkPage(Math.floor(index / 50)); setEditingIndex(index); } }} />}</>}
                  <div hidden={doc.format === "docx" && docxView === "layout"}>
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
                  <div className="entity-view-switch" role="group" aria-label="标记展示方式"><button className={entityView === "groups" ? "active" : "quiet"} aria-pressed={entityView === "groups"} onClick={() => setEntityView("groups")}>按实体</button><button className={entityView === "individual" ? "active" : "quiet"} aria-pressed={entityView === "individual"} onClick={() => { setEntityView("individual"); setEditingIndex(null); }}>逐条复核</button></div>
                  {marks.length >= MAX_MARKS && <p role="alert" className="error">已达到 {MAX_MARKS} 项标记上限，请先删除重复标记。</p>}
                  {!marks.length && (
                    <p className="empty">
                      {doc.state === "queued"
                        ? "等待规则识别…"
                        : "规则无命中，不代表没有敏感信息。可在原文中补充标记。"}
                    </p>
                  )}
                  {entityView === "groups" && <EntityGroups key={`${doc.id}:${doc.revision}`} doc={doc} marks={marks} update={update} locate={span => loadText(Math.max(0, span.start - 256), span)} run={run} disabled={busy || conflict || doc.state !== "review"} canReview={canReview} onEdit={index => { setEntityView("individual"); setMarkPage(Math.floor(index / 50)); setEditingIndex(index); }} onCheck={() => setReviewTool("known")} />}
                  <div hidden={entityView !== "individual"}>
                  <div className="marklist">
                    {marks.slice(page * 50, (page + 1) * 50).map((m, offset) => {
                      const i = page * 50 + offset;
                      return (
                      <article className="mark" id={`review-mark-${i}`} key={i} style={{ "--entity-color": typeColor(m.kind) } as React.CSSProperties}>
                        <div>
                          <button
                            className="quote"
                            onClick={() => {
                              setPreviewMode(false);
                              setDocxFocus({ start: m.start, end: m.end });
                              const offset = doc.textOffset ?? 0;
                              if (m.start < offset || m.end > offset + doc.text.length) { void run(() => loadText(Math.max(0, m.start - 256), m)); return; }
                              requestAnimationFrame(() => { original.current?.focus();
                              original.current?.setSelectionRange(
                                m.start - offset,
                                m.end - offset,
                              ); });
                            }}
                          >
                            {m.start >= (doc.textOffset ?? 0) && m.end <= (doc.textOffset ?? 0) + doc.text.length ? doc.text.slice(m.start - (doc.textOffset ?? 0), Math.min(m.end, m.start + 120) - (doc.textOffset ?? 0)) : doc.markTexts?.[`${m.start}:${m.end}`] ?? "定位原文"}
                          </button>
                          <small>
                            {entityLabel(m)} · {m.start}-{m.end}
                            {m.sources?.length ? ` · ${[...new Set(m.sources.map(s => ({ rules: "规则匹配", ner: "实体识别", ai: "语义识别", manual: "人工标记" })[s.layer]))].join("、")}` : ""}
                            {m.sources?.some(s => s.code === "project-whitelist") ? " · 白名单建议" : ""}
                            {doc.format === "csv" && (() => { const a = doc.anchors?.find(a => a.start <= m.start && a.end >= m.end); return a ? ` · 第 ${a.row} 行 / 第 ${a.column} 列` : ""; })()}
                          </small>
                        </div>
                        <label>
                          处理决定
                          <select
                            disabled={!canReview || conflict || doc.state !== "review"}
                            aria-label={"标记 " + (i + 1) + " 处理决定"}
                            value={m.decision}
                            onChange={(e) =>
                              update(
                                marks.map((v, j) =>
                                  j === i
                                    ? {
                                        ...v,
                                        decision: e.target
                                          .value as Mark["decision"],
                                      }
                                    : v,
                                ),
                              )
                            }
                          >
                            <option value="pending">待确认</option>
                            <option value="redact">脱敏处理</option>
                            <option value="ignore">保留原值</option>
                          </select>
                        </label>
                        <label>信息类型<select aria-label={`标记 ${i + 1} 信息类型`} disabled={!canReview || conflict || doc.state !== "review"} value={entityIdentity(m)} onChange={e => update(marks.map((v, j) => j === i ? { ...v, kind: e.target.value as Mark["kind"], rawEntityType:undefined,replacement: undefined, rasterReplacement:undefined,replacementOrigin: undefined, sources: [{ layer: "manual", code: "human-mark" }] } : v))}>{m.rawEntityType!==undefined&&<option value={entityIdentity(m)}>{entityLabel(m)}</option>}{markSchema.shape.kind.options.map(k => <option key={k}>{k}</option>)}</select></label>{m.kind==="自定义"&&<label>自定义类型名称<input value={m.rawEntityType??""} placeholder="留空使用通用自定义类型" disabled={!canReview||conflict||doc.state!=="review"} onChange={e=>update(marks.map((v,j)=>j===i?{...v,rawEntityType:e.target.value||undefined,replacement:undefined,rasterReplacement:undefined,replacementOrigin:undefined,sources:[{layer:"manual",code:"human-mark"}]}:v))}/></label>}
                        {m.decision === "redact" && <fieldset disabled={!canReview || conflict || doc.state !== "review"}><ReplacementEditor mark={m} index={i} change={replacement => update(marks.map((v, j) => j === i ? { ...v, replacement, rasterReplacement:undefined,replacementOrigin: "manual" } : v))} />{docAllowed("view_mapping") && <MappingPicker key={`${doc.id}:${doc.revision}:${entitySpanKey(m)}`} doc={doc} mark={m} run={run} api={api} assigned={replacement => update(marks.map((v, j) => j === i ? { ...v, replacement, rasterReplacement:undefined,replacementOrigin: "manual" } : v), true)} />}</fieldset>}
                        <button
                          className="quiet"
                          disabled={!canReview || conflict || doc.state !== "review"}
                          onClick={() =>
                            update(marks.filter((_, j) => i !== j))
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
                <ReviewTools key={`actions:${doc.id}:${doc.revision}`} surface="actions" doc={doc} marks={marks} pageReview={pageReview} update={update} run={run} api={api} canReview={canReview} canUseAliases={docAllowed("view_mapping")} mode={reviewTool === "bulk" || reviewTool === "known" ? reviewTool : "marks"} showMarks={() => setReviewTool("marks")} disabled={busy || conflict || doc.state !== "review"} locate={async span => { setReviewTool("marks"); await loadText(Math.max(0, span.start - 256), span); }} />
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
