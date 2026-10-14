import { useConfirmAction } from "./confirm-action.tsx";
import { appUrl } from "./urls.ts";
import React, { useEffect, useRef, useState } from "react";
import { BATCH_MAX_FILES, FILE_MAX_BYTES, type UploadBatchView, type UploadEntry } from "../../packages/contracts/index.ts";

type LocalEntry = UploadEntry & { file?: File; status: string };
const PAGE_SIZE = 10;
const messages: Record<string, string> = {
  CAPACITY_EXCEEDED: "组织材料容量或文件数已达上限，请联系管理员。",
  PERMISSION_DENIED: "没有导入材料的权限，请联系项目管理员。",
  RATE_LIMITED: "请求过于频繁，请稍后重试。",
  INVALID_PATH: "文件路径不安全，请检查目录和文件名。",
  DUPLICATE_FILE: "同一批次不能包含重复路径。",
  UNSUPPORTED_FORMAT: "文件类型不受支持，请使用 TXT、MD、CSV、DOCX、PDF、图片或 XLSX。",
  FILE_HASH_MISMATCH: "文件内容已变化，请重新选择原文件，或作为新文件导入。",
  FILE_SIZE_MISMATCH: "文件大小不一致，请重新选择原文件。",
  IDEMPOTENCY_CONFLICT: "上传记录与文件不一致，请重新载入上传记录。",
  LOGIN_REQUIRED: "会话已过期，请重新登录后继续上传。",
  NOT_FOUND: "上传记录不存在，或你已无权访问。",
};
async function checkedResponse(response: Response, signal: AbortSignal) {
  signal.throwIfAborted();
  if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    signal.throwIfAborted();
    throw new Error(messages[data.error] ?? "请求未完成，请稍后重试。");
  }
  const data = await response.json();
  signal.throwIfAborted();
  return data;
}
async function digest(file: File) {
  const bytes = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function Uploads({ project, signal, run, refresh, onPending }: { project: string; signal: AbortSignal; run: (fn: () => Promise<void>) => Promise<void>; refresh: () => Promise<void>; onPending: (pending: boolean) => void }) {
  const confirmAction = useConfirmAction();
  const checked = (response: Response) => checkedResponse(response, signal);
  const fetch: typeof window.fetch = (input, init) => {
    signal.throwIfAborted();
    return window.fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
  };
  const [batch, setBatch] = useState<string>(() => crypto.randomUUID());
  const [files, setFiles] = useState<LocalEntry[]>([]);
  const [resuming, setResuming] = useState(false), [error, setError] = useState("");
  const [history, setHistory] = useState<UploadBatchView[]>([]), [more, setMore] = useState(false);
  const [historyError, setHistoryError] = useState(""), [loading, setLoading] = useState(true);
  const historyRequest = useRef(0);
  const base = appUrl(`/api/projects/${project}/upload-batches`);
  const pending = files.some(f => f.status !== "已保存");
  useEffect(() => { onPending(pending); return () => onPending(false); }, [pending, onPending]);
  useEffect(() => {
    const controller = new AbortController();
    const request = ++historyRequest.current;
    const current = () => !controller.signal.aborted && request === historyRequest.current;
    fetch(`${base}?limit=${PAGE_SIZE}&offset=0`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(checked).then((next: UploadBatchView[]) => {
      if (current()) { setHistory(next); setMore(next.length === PAGE_SIZE); }
    }).catch(() => { if (current()) setHistoryError("无法读取上传记录，请重试。"); })
      .finally(() => { if (current()) setLoading(false); });
    return () => controller.abort();
  }, [base]);
  async function loadHistory(append = false) {
    const request = ++historyRequest.current;
    setHistoryError("");
    try {
      const next: UploadBatchView[] = await checked(await fetch(`${base}?limit=${PAGE_SIZE}&offset=${append ? history.length : 0}`, { signal: AbortSignal.timeout(20000) }));
      if (request !== historyRequest.current) return;
      setHistory(current => append ? [...current, ...next.filter(b => !current.some(old => old.id === b.id))] : next);
      setMore(next.length === PAGE_SIZE);
    } catch { if (request === historyRequest.current) setHistoryError("无法读取上传记录，请重试。"); }
    finally { if (request === historyRequest.current) setLoading(false); }
  }
  async function select(list: File[], resume: boolean) {
    if (!project || !list.length) return;
    if (!resume && pending && !await confirmAction("当前仍有文件未上传。重新选择后，已建立的批次可从上传记录继续。确定继续？")) return;
    setError("");
    if (list.length > BATCH_MAX_FILES || list.some(f => !f.size || f.size > FILE_MAX_BYTES)) {
      setError("每批最多 20 个非空文件，单文件不能超过 50 MB。"); return;
    }
    const selected: LocalEntry[] = [], paths = new Set<string>();
    for (const file of list) {
      const path = (file.webkitRelativePath || file.name).normalize("NFC");
      if (paths.has(path)) { setError(messages.DUPLICATE_FILE); return; }
      paths.add(path);
      const sha256 = await digest(file);
      const expected = resume ? files.find(entry => entry.path === path) : undefined;
      if (resume && (!expected || expected.size !== file.size || expected.sha256 !== sha256)) {
        setError(`“${path}”与原批次的路径或内容不一致。请选择原文件和原目录；如已修改，请新建上传。`); return;
      }
      selected.push({ file, path, sha256, size: file.size, requestId: expected?.requestId ?? crypto.randomUUID(), status: expected?.status === "已保存" ? "已保存" : "待上传" });
    }
    if (resume) setFiles(current => current.map(entry => selected.find(file => file.requestId === entry.requestId) ?? entry));
    else { setBatch(crypto.randomUUID()); setResuming(false); setFiles(selected); }
  }
  const status = (requestId: string, value: string) => setFiles(current => current.map(f => f.requestId === requestId ? { ...f, status: value } : f));
  async function resume(id: string) {
    if (pending && !await confirmAction("切换后需重新选择尚未上传的本地文件，确定继续？")) return;
    setError("");
    const saved: UploadBatchView = await checked(await fetch(`${base}/${id}`, { signal: AbortSignal.timeout(20000) }));
    setBatch(saved.id); setResuming(true);
    setFiles(saved.files.map(entry => ({ ...entry, status: entry.documentId ? "已保存" : "请重新选择文件" })));
  }
  async function upload() {
    setError("");
    try {
      // Repeating this immutable manifest is safe even when the previous response was lost.
      await checked(await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ id: batch, files: files.map(({ path, requestId, size, sha256 }) => ({ path, requestId, size, sha256 })) }),
      }));
      const saved: UploadBatchView = await checked(await fetch(`${base}/${batch}`, { signal: AbortSignal.timeout(20000) }));
      for (const entry of files) {
        signal.throwIfAborted();
        if (saved.files.some(file => file.requestId === entry.requestId && file.documentId)) { status(entry.requestId, "已保存"); continue; }
        if (!entry.file) continue;
        status(entry.requestId, "上传中");
        try {
          const response = await fetch(appUrl(`/api/projects/${project}/files?batchId=${batch}&requestId=${entry.requestId}`), {
            method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: entry.file, signal: AbortSignal.timeout(120000),
          });
          const expired = response.status === 401;
          try { await checked(response); status(entry.requestId, "已保存"); }
          catch (e) { status(entry.requestId, (e as Error).message); if (expired) return; }
        } catch { status(entry.requestId, "连接中断，可重试"); }
      }
      await refresh();
    } catch (e) { setError(e instanceof TypeError || (e as Error).name === "TimeoutError" ? "连接中断，请重试或从上传记录继续。" : (e as Error).message); }
    await loadHistory();
  }
  const legacy = resuming && files.some(file => file.status !== "已保存" && !file.sha256);
  async function startNew() {
    if (pending && !await confirmAction("当前批次仍有文件未上传，可稍后从上传记录继续。确定新建上传？")) return;
    setBatch(crypto.randomUUID()); setFiles([]); setResuming(false); setError("");
  }
  function picker(directory: boolean, resume: boolean) {
    const name = resume ? (directory ? "补选原目录" : "补选原文件") : (directory ? "选择目录" : "选择文件");
    return <label>{name}<input disabled={!project || (resume && legacy)} aria-label={name} type="file" multiple
      ref={el => { if (directory) el?.setAttribute("webkitdirectory", ""); }} onChange={e => {
        const selected = Array.from(e.target.files ?? []); e.target.value = "";
        void run(() => select(selected, resume));
      }} /></label>;
  }
  return <section className="panel upload-panel">
    <div className="upload-heading"><h2>{resuming ? "继续上传" : "导入文件"}</h2>{resuming && <button className="quiet" onClick={startNew}>新建上传</button>}</div>
    <p className="muted">支持 TXT、Markdown、CSV、DOCX、XLSX、PDF、PNG 和 JPEG。文本文件请使用 UTF-8 编码。PDF 导出需确认转换为不可选字的图片型副本；图片导出为 PNG。存在未处理内容时将阻止导出。</p>
    {!resuming && <div className="upload-choices">{picker(false, false)}{picker(true, false)}</div>}
    {error && <p role="alert" className="error">{error}</p>}
    {resuming && pending && <>
      <p className="muted">请重新选择尚未上传的原文件，目录上传需选择同一个目录。已保存文件会自动跳过。</p>
      {legacy ? <p role="alert" className="error">此批次未记录文件内容校验，不能安全续传。请点击“新建上传”重新选择未上传的文件；已保存文件仍在材料列表中。</p> : <div className="upload-choices">{picker(false, true)}{picker(true, true)}</div>}
    </>}
    {files.length > 0 && <ul className="upload-list" aria-label="本次上传文件">{files.map(f => <li key={f.requestId}><span title={f.path}>{f.path}</span><span role="status">{f.status}</span></li>)}</ul>}
    <div className="actions"><span className="muted">每批最多 20 个文件 · 单文件不超过 50 MB</span><button disabled={!project || legacy || !files.some(f => f.file && f.status !== "已保存")} onClick={() => void run(upload)}>上传文件</button></div>
    <section className="upload-history" aria-label="上传记录">
      <div className="upload-heading"><h3>上传记录</h3><button className="quiet" onClick={() => void run(() => loadHistory())}>刷新记录</button></div>
      {loading && <p className="muted">正在读取上传记录…</p>}
      {historyError && <p role="alert" className="error">{historyError}</p>}
      {!loading && !historyError && !history.length && <p className="muted">暂无上传记录。</p>}
      <ul className="upload-history-list">{history.map(record => {
        const saved = record.files.filter(file => file.documentId).length;
        return <li key={record.id}>
          <div><span className="upload-history-name">{record.files[0].path}{record.files.length > 1 ? ` 等 ${record.files.length} 个文件` : ""}</span><span className="muted">{new Date(record.createdAt).toLocaleString("zh-CN")} · 已保存 {saved}/{record.files.length}</span></div>
          <button className="secondary" onClick={() => void run(() => resume(record.id))}>{saved < record.files.length ? "继续上传" : "查看记录"}</button>
        </li>;
      })}</ul>
      {more && <button className="quiet" onClick={() => void run(() => loadHistory(true))}>更多上传记录</button>}
    </section>
  </section>;
}
