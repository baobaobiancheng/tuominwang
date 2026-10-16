import { useConfirmAction } from "./confirm-action.tsx";
import { appUrl } from "./urls.ts";
import React, { useEffect, useRef, useState } from "react";
import { FILE_MAX_BYTES, type UploadBatchView, type UploadEntry } from "../../packages/contracts/index.ts";
import { folderDirectorySkip, folderSkip, type SkippedFolderEntry } from "../../packages/core/folder-scan.ts";

type LocalEntry = UploadEntry & { file?: File; status: string };
type SelectedFile = { file: File; path: string };
type DirectoryHandle = { name: string; entries(): AsyncIterable<[string, DirectoryHandle | { kind: 'file'; getFile(): Promise<File> }]>; kind: 'directory' };
const PAGE_SIZE = 10;
const messages: Record<string, string> = {
  CAPACITY_EXCEEDED: "组织材料容量或文件数已达上限，请联系管理员。",
  PERMISSION_DENIED: "没有导入材料的权限，请联系项目管理员。",
  RATE_LIMITED: "请求过于频繁，请稍后重试。",
  INVALID_PATH: "文件路径不安全，请检查目录和文件名。",
  DUPLICATE_FILE: "同一批次不能包含重复路径。",
  UNSUPPORTED_FORMAT: "文件类型不受支持，请使用 TXT、MD、CSV、DOC、WPS、DOCX、PDF、图片或 XLSX。",
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
  const [folderScan, setFolderScan] = useState<{sourceRootName:string;skippedEntries:SkippedFolderEntry[];emptyDirectories:string[]}|null>(null);
  const [resuming, setResuming] = useState(false), [manifestLocked, setManifestLocked] = useState(false), [error, setError] = useState("");
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
  async function select(list: SelectedFile[], resume: boolean, directory = false, emptyDirectories: string[] = [], skippedDirectories:SkippedFolderEntry[] = []) {
    if (!project || (!list.length && !directory)) return;
    if (!resume && pending && !await confirmAction("当前仍有文件未上传。重新选择后，已建立的批次可从上传记录继续。确定继续？")) return;
    setError("");
    if (!directory && list.some(({file}) => file.size > FILE_MAX_BYTES)) {
      setError("单文件不能超过 50 MB。"); return;
    }
    const selected: LocalEntry[] = [], skippedEntries:SkippedFolderEntry[] = skippedDirectories.map(item=>({...item,sourceRelativePath:item.sourceRelativePath.normalize('NFC')})), normalizedEmptyDirectories=emptyDirectories.map(path=>path.normalize('NFC')), paths = new Set<string>();
    for (const item of list) {
      const file=item.file,path=item.path.normalize("NFC");
      if (paths.has(path)) { setError(messages.DUPLICATE_FILE); return; }
      paths.add(path);
      if (directory) { const skipped=file.size>FILE_MAX_BYTES?{sourceRelativePath:path,reasonCode:'FILE_SIZE_LIMIT',reason:'单文件超过 50 MB，未处理'}:folderSkip(path,file.name,file.size); if(skipped){skippedEntries.push(skipped);continue;} }
      else if(!file.size){setError("文件不能为空。");return;}
      const sha256 = await digest(file);
      const expected = resume ? files.find(entry => entry.path === path) : undefined;
      if (resume && (!expected || expected.size !== file.size || expected.sha256 !== sha256)) {
        setError(`“${path}”与原批次的路径或内容不一致。请选择原文件和原目录；如已修改，请新建上传。`); return;
      }
      selected.push({ file, path, sha256, size: file.size, requestId: expected?.requestId ?? crypto.randomUUID(), documentType: expected?.documentType, status: expected?.status === "已保存" ? "已保存" : "待上传" });
    }
    const observed=[...paths,...skippedDirectories.map(item=>item.sourceRelativePath.normalize('NFC')),...normalizedEmptyDirectories];
    if(new Set(observed).size!==observed.length){setError(messages.DUPLICATE_FILE);return;}
    if(!selected.length){
      if(directory&&!resume){setFiles([]);setFolderScan({sourceRootName:(list[0]?.path.split('/')[0]??normalizedEmptyDirectories[0]?.split('/')[0]??skippedEntries[0]?.sourceRelativePath.split('/')[0]??'文件夹').normalize('NFC'),skippedEntries,emptyDirectories:normalizedEmptyDirectories});}
      setError("这个目录及其子目录中没有可处理的文档。已跳过的条目不会建立上传批次。");return;
    }
    if(resume&&folderScan&&selected.length!==files.length){setError("原目录中的可处理文件与上传记录不一致，请选择原目录。");return;}
    if (resume) setFiles(current => current.map(entry => selected.find(file => file.requestId === entry.requestId) ?? entry));
    else { setBatch(crypto.randomUUID()); setResuming(false); setManifestLocked(false); setFiles(selected);setFolderScan(directory?{sourceRootName:(selected[0].path.split('/')[0]??'文件夹').normalize('NFC'),skippedEntries,emptyDirectories:normalizedEmptyDirectories}:null); }
  }
  const status = (requestId: string, value: string) => setFiles(current => current.map(f => f.requestId === requestId ? { ...f, status: value } : f));
  async function resume(id: string) {
    if (pending && !await confirmAction("切换后需重新选择尚未上传的本地文件，确定继续？")) return;
    setError("");
    const saved: UploadBatchView = await checked(await fetch(`${base}/${id}`, { signal: AbortSignal.timeout(20000) }));
    setBatch(saved.id); setResuming(true); setManifestLocked(true);
    setFolderScan(saved.sourceRootName?{sourceRootName:saved.sourceRootName,skippedEntries:saved.skippedEntries??[],emptyDirectories:saved.emptyDirectories??[]}:null);
    setFiles(saved.files.map(entry => ({ ...entry, status: entry.documentId ? "已保存" : "请重新选择文件" })));
  }
  async function upload() {
    setError("");
    // Once the first immutable manifest may have reached the API, route choices
    // cannot be changed during retry or resume even if its response was lost.
    setManifestLocked(true);
    try {
      // Repeating this immutable manifest is safe even when the previous response was lost.
      await checked(await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ id: batch, files: files.map(({ path, requestId, size, sha256, documentType }) => ({ path, requestId, size, sha256, ...(documentType && documentType !== 'auto' ? { documentType } : {}) })),...folderScan }),
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
    setBatch(crypto.randomUUID()); setFiles([]); setFolderScan(null); setResuming(false); setManifestLocked(false); setError("");
  }
  async function scanDirectory(handle:DirectoryHandle,resume:boolean){
    const list:SelectedFile[]=[],emptyDirectories:string[]=[],skipped:SkippedFolderEntry[]=[];
    async function visit(dir:DirectoryHandle,path:string){
      let count=0;
      try{for await(const[name,entry]of dir.entries()){
        signal.throwIfAborted();count++;
        const relative=`${path}/${name}`;
        const hidden=folderDirectorySkip(relative,name);
        if(hidden){skipped.push(hidden);continue;}
        if(entry.kind==='directory')await visit(entry as DirectoryHandle,relative);
        else try{list.push({file:await entry.getFile(),path:relative});}catch{skipped.push({sourceRelativePath:relative,reasonCode:'unreadable',reason:'无法读取该文件'});}
      }}catch(e){if(signal.aborted)throw e;skipped.push({sourceRelativePath:path,reasonCode:'unreadable',reason:'无权读取该目录'});return;}
      if(!count)emptyDirectories.push(path);
    }
    await visit(handle,handle.name);
    await select(list,resume,true,emptyDirectories,skipped);
  }
  function picker(directory: boolean, resume: boolean) {
    const name = resume ? (directory ? "补选原目录" : "补选原文件") : (directory ? "选择目录" : "选择文件");
    return <label onClick={async e=>{
      if(!directory||!('showDirectoryPicker' in window)||!e.isTrusted||!project||(resume&&legacy))return;
      e.preventDefault();
      try{const handle=await (window as unknown as {showDirectoryPicker():Promise<DirectoryHandle>}).showDirectoryPicker();void run(()=>scanDirectory(handle,resume));}
      catch(error){if((error as Error).name!=='AbortError')setError('无法读取目录，请重新选择。');}
    }}>{name}<input disabled={!project || (resume && legacy)} aria-label={name} type="file" multiple
      ref={el => { if (directory) el?.setAttribute("webkitdirectory", ""); }} onChange={e => {
        const selected = Array.from(e.target.files ?? []); e.target.value = "";
        void run(() => select(selected.map(file=>({file,path:file.webkitRelativePath||file.name})), resume, directory));
      }} /></label>;
  }
  return <section className="panel upload-panel">
    <div className="upload-heading"><h2>{resuming ? "继续上传" : "导入文件"}</h2>{resuming && <button className="quiet" onClick={startNew}>新建上传</button>}</div>
    <p className="muted">支持 TXT、Markdown、CSV、DOCX、XLSX、PDF、PNG 和 JPEG。文本文件请使用 UTF-8 编码。PDF 导出需确认转换为不可选字的图片型副本；图片导出为 PNG。存在未处理内容时将阻止导出。</p>
    {!resuming && <div className="upload-choices">{picker(false, false)}{picker(true, false)}</div>}
    <p className="muted">部分浏览器选择目录时不会包含空文件夹；其他文件和跳过项仍会逐项记录。</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!!folderScan&&(!!folderScan.skippedEntries.length||!!folderScan.emptyDirectories.length)&&<p className="muted" role="status">目录扫描：跳过 {folderScan.skippedEntries.length} 项，空目录 {folderScan.emptyDirectories.length} 个；结果清单会逐项记录。</p>}
    {resuming && pending && <>
      <p className="muted">请重新选择尚未上传的原文件，目录上传需选择同一个目录。已保存文件会自动跳过。</p>
      {legacy ? <p role="alert" className="error">此批次未记录文件内容校验，不能安全续传。请点击“新建上传”重新选择未上传的文件；已保存文件仍在材料列表中。</p> : <div className="upload-choices">{picker(false, true)}{picker(true, true)}</div>}
    </>}
    {files.length > 0 && <ul className="upload-list" aria-label="本次上传文件">{files.map(f => <li key={f.requestId}><span title={f.path}>{f.path}</span><label>材料类型<select aria-label={`${f.path} 的导入材料类型`} value={f.documentType??'auto'} disabled={manifestLocked||resuming||f.status==='已保存'} onChange={e=>setFiles(current=>current.map(entry=>entry.requestId===f.requestId?{...entry,documentType:e.target.value as UploadEntry['documentType']}:entry))}><option value="auto">自动判断</option><option value="judgment">裁判文书</option><option value="pleading">诉讼文书</option><option value="contract">合同与协议</option><option value="disclosure">信披与公司文件</option><option value="official_letter">函件与证明</option><option value="screenshot">证据截图与凭证</option><option value="general">其他材料</option></select></label><span role="status">{f.status}</span></li>)}</ul>}
    <div className="actions"><span className="muted">单文件不超过 50 MB</span><button disabled={!project || legacy || !files.some(f => f.file && f.status !== "已保存")} onClick={() => void run(upload)}>上传文件</button></div>
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
