import { useConfirmAction } from "./confirm-action.tsx";
import { appUrl } from "./urls.ts";
import React, { useState, useEffect } from "react";
import type { DictionaryEntry } from "../../packages/contracts/index.ts";
import { markSchema } from "../../packages/contracts/index.ts";

export function Dictionary({ project, signal, run, changed, onPending, active, activate }: { project: string; signal: AbortSignal; run: (fn: () => Promise<void>) => Promise<void>; changed: () => Promise<void>; onPending: (dirty: boolean) => void; active: boolean; activate: () => void }) {
  const confirmAction = useConfirmAction();
  const [open, setOpen] = useState(false), [revision, setRevision] = useState(0), [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [value, setValue] = useState(""), [kind, setKind] = useState<DictionaryEntry["kind"]>("机构"), [dirty, setDirty] = useState(false);
  const [action, setAction] = useState<"include" | "exclude">("include");
  useEffect(() => { onPending(open && (dirty || !!value.trim())); return () => onPending(false); }, [open, dirty, value, onPending]);
  async function request(method = "GET", body?: unknown) {
    const response = await fetch(appUrl(`/api/projects/${project}/dictionary`), { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal });
    signal.throwIfAborted();
    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
    const data = await response.json();
    signal.throwIfAborted();
    if (!response.ok) throw new Error(data.error === "VERSION_CONFLICT" ? "词表已被更新，请重新打开后修改" : data.error === "DUPLICATE_DICTIONARY_ENTRY" ? "词表中存在重复项目" : "词表操作未完成，请重试");
    return data;
  }
  async function fileResponse(path: string, options?: RequestInit) {
    const response = await fetch(appUrl(`/api/projects/${project}/${path}`), { ...options, signal });
    signal.throwIfAborted();
    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
    if (!response.ok) { const data = await response.json(); throw new Error(data.error === "VERSION_CONFLICT" ? "词表已被更新，请重新打开后修改" : data.error === "DUPLICATE_DICTIONARY_ENTRY" ? "表格中存在重复的名称和类型" : "名单文件无法安全读取，请使用导出的表头格式、检查未处理对象，且不超过 5 MB / 1,000 条"); }
    return response;
  }
  return <section className="dictionary">
    <button className="secondary" aria-expanded={active && open} onClick={async () => {
      if (active && open) { if ((!dirty && !value.trim()) || await confirmAction("放弃未保存的词表修改？")) { setOpen(false); setDirty(false); setValue(""); } }
      else if (open) activate();
      else void run(async () => { const data = await request(); setRevision(data.revision); setEntries(data.entries); setDirty(false); setOpen(true); activate(); });
    }}>{active && open ? "收起项目词表" : "项目词表"}</button>
    {active && open && <div className="panel">
      <h2>项目词表</h2><p className="muted">黑名单补充敏感候选；白名单提供保留建议，均按原样匹配并需复核。白名单不能跳过文件核验。</p>
      <div className="dictionary-files">
        <label>导入名单 XLSX<input aria-label="导入名单 XLSX" type="file" accept=".xlsx" onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
          if ((dirty || value.trim()) && !await confirmAction("导入会替换当前未保存的词表内容，确定继续？")) return;
          void run(async () => { if (file.size > 5 * 1024 * 1024) throw new Error("名单文件不能超过 5 MB"); const result = await (await fileResponse(`dictionary/import?revision=${revision}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file })).json(); setEntries(result.entries); setValue(""); setDirty(true); });
        }} /></label>
        <button className="secondary" disabled={dirty} onClick={() => void run(async () => { const response = await fileResponse(`dictionary.xlsx?revision=${revision}`), url = URL.createObjectURL(await response.blob()), a = document.createElement("a"); a.href = url; a.download = "dictionary.xlsx"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); })}>导出名单 XLSX</button>
      </div>
      <div className="dictionary-add">
        <label>名称或代号<input value={value} maxLength={200} onChange={e => setValue(e.target.value)} /></label>
        <label>信息类型<select value={kind} onChange={e => setKind(e.target.value as DictionaryEntry["kind"])}>{markSchema.shape.kind.options.map(k => <option key={k}>{k}</option>)}</select></label>
        <label>名单<select value={action} onChange={e => setAction(e.target.value as typeof action)}><option value="include">黑名单</option><option value="exclude">白名单</option></select></label>
        <button className="secondary" disabled={!value.trim() || entries.length >= 1000} onClick={() => { const item = { value: value.trim(), kind, ...(action === "exclude" ? { action } : {}) }; if (!entries.some(e => e.value === item.value && e.kind === item.kind)) { setEntries([...entries, item]); setDirty(true); } setValue(""); }}>添加词条</button>
      </div>
      <ul className="dictionary-list">{entries.map((e, i) => <li key={`${e.kind}:${e.value}`}><span>{e.value}</span><small>{e.kind} · {e.action === "exclude" ? "白名单" : "黑名单"}</small><button className="quiet" aria-label={`移除词条 ${e.value}`} onClick={() => { setEntries(entries.filter((_, n) => n !== i)); setDirty(true); }}>移除</button></li>)}</ul>
      {!entries.length && <p className="muted">尚无词条。</p>}
      <div className="actions"><button disabled={!dirty} onClick={async () => {
        if (await confirmAction("保存词表后，项目内已有材料需重新识别并复核，旧处理副本不能获取新下载链接。已经签发的链接到期前仍有效。确定保存？")) void run(async () => { const data = await request("PUT", { revision, entries }); setRevision(data.revision); setDirty(false); await changed(); });
      }}>保存词表</button><span className="muted">{entries.length} / 1000 条{dirty ? " · 未保存" : ""}</span></div>
    </div>}
  </section>;
}
