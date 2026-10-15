import {businessError} from './business-errors.ts';
import {TmmCompatibility} from "./tmm-compatibility.tsx";
import React, { useEffect, useRef, useState } from "react";
import { appUrl } from "./urls.ts";
export async function fileBase64(file: File) { const bytes = new Uint8Array(await file.arrayBuffer()); let text = ""; for (let at = 0; at < bytes.length; at += 32768) text += String.fromCharCode(...bytes.subarray(at, at + 32768)); return btoa(text); }
async function responseError(response: Response) { if (response.status === 401) window.dispatchEvent(new Event("session-expired")); const body = await response.json().catch(() => ({})); throw new Error(businessError(body.error ?? `HTTP ${response.status}`)); }
export async function downloadResponse(response: Response, name: string, shouldContinue:()=>boolean=()=>true) { if (!response.ok) await responseError(response); const blob=await response.blob();if(!shouldContinue())return;const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
export function WorkspacePortable({ projectId, canExport,canApply=false,onApplied, onImported }: { projectId: string | null; canExport: boolean;canApply?:boolean;onApplied?:()=>Promise<void>; onImported: (projectId: string) => Promise<void> }) {
  const [password, setPassword] = useState(""), [importPassword, setImportPassword] = useState(""), [name, setName] = useState(""), [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), generation = useRef(0), saveRequest=useRef<{project:string;password:string;requestId:string}|null>(null), allowed=useRef({projectId,canExport});
  allowed.current={projectId,canExport};
  useEffect(() => { generation.current++; setPassword(""); setImportPassword(""); setMessage(""); setBusy(false); saveRequest.current=null; return () => { generation.current++; }; }, [projectId,canExport]);
  async function exportProject() {
    if(!projectId||!canExport)return;
    const current = generation.current,project=projectId; setBusy(true); setMessage("");
    const active=()=>current===generation.current&&allowed.current.projectId===project&&allowed.current.canExport;
    const send=async(path:string,body:unknown)=>{const response=await fetch(appUrl(path),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!response.ok)await responseError(response);return response.json();};
    if(saveRequest.current?.project!==project||saveRequest.current.password!==password)saveRequest.current={project,password,requestId:crypto.randomUUID()};
    const request=saveRequest.current;
    try {
      let result=await send(`/api/projects/${project}/portable/save`,{requestId:request.requestId,password:request.password});
      while(active()&&result.state==='running'){await new Promise(resolve=>setTimeout(resolve,400));if(!active())return;result=await send(`/api/projects/${project}/portable/save-result`,{requestId:request.requestId});}
      if(!active())return;
      if(result.state!=='completed'){saveRequest.current=null;throw new Error(businessError(result.error??'工程保存回执已失效，请重新保存。'));}
      const response=await fetch(appUrl(`/api/projects/${project}/portable/saves/${result.receiptId}/download`));if(!active())return;
      if(!response.ok&&[401,403,404,409,410].includes(response.status))saveRequest.current=null;
      await downloadResponse(response,"脱敏汪工程备份.tmw",active);if(!active())return;saveRequest.current=null;setPassword("");setMessage("工程备份已下载，请妥善保存密码。");
    } catch (e) { if (active()) setMessage((e as Error).message); } finally { if (current === generation.current) setBusy(false); }
  }
  async function importProject() {
    if (!file) return; const current = generation.current; setBusy(true); setMessage("");
    try { const bytesBase64 = await fileBase64(file); if (current !== generation.current) return; const response = await fetch(appUrl("/api/portable/import"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, bytesBase64, ...(importPassword ? { password: importPassword } : {}) }) }); if (!response.ok) await responseError(response); const result = await response.json(); if (current !== generation.current) return; setImportPassword(""); setMessage(`已创建新项目并导入 ${result.documentCount} 份材料，请重新识别并复核后导出。${result.unlockRequired?.length ? `其中 ${result.unlockRequired.length} 份受密码保护的原件需重新输入合法密码解锁。` : ""}`); await onImported(result.id); } catch (e) { if (current === generation.current) setMessage((e as Error).message); } finally { if (current === generation.current) setBusy(false); }
  }
  return <details><summary>工程备份与导入</summary><TmmCompatibility projectId={projectId} canExport={canExport} canApply={canApply} onApplied={onApplied}/><fieldset disabled={busy}><legend>备份当前项目</legend><p className="muted">备份包含原件、已解锁副本、识别文字、规则、方案、映射和复核记录。文件使用密码保护。</p><label>工程备份密码<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></label><button className="secondary" disabled={!projectId || !canExport || password.length < 4} onClick={() => void exportProject()}>下载工程备份</button></fieldset><fieldset disabled={busy}><legend>导入为新项目</legend><label>导入工程文件<input type="file" accept=".tmw,.tmm" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><label>新项目名称<input value={name} onChange={e => setName(e.target.value)} maxLength={200} /></label><label>工程文件密码<input type="password" value={importPassword} onChange={e => setImportPassword(e.target.value)} autoComplete="off" /></label><p className="muted">支持本工具备份与兼容的 TMM 工程、传输副本。本机密钥保护的文件需要在原应用导出为传输副本。导入后重新识别、复核；原复核记录会保留用于核对。</p><button className="secondary" disabled={!file || !name.trim()} onClick={() => void importProject()}>导入工程并新建项目</button></fieldset>{busy && <p role="status">正在处理工程文件…</p>}{message && <p role="status">{message}</p>}</details>;
}
