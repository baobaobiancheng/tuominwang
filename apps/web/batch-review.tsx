import { useConfirmAction } from "./confirm-action.tsx";
import React, { useEffect, useState } from "react";
import { markSchema } from "../../packages/contracts/index.ts";
type Version = { id: string; revision: number };
type Plan = { documents: Version[]; decision: "redact" | "ignore"; kind?: string; rawEntityType?:string; whitelist: boolean };
export function BatchReview({ project, docs, run, api, changed, active, activate }: {
  project: string; docs: { id: string; name?: string; state: string; revision?: number }[];
  run: (action: () => Promise<void>) => Promise<void>; api: <T>(path: string, method?: string, body?: unknown) => Promise<T>; changed: () => Promise<void>;
  active: boolean; activate: () => void;
}) {
  const confirmAction = useConfirmAction();
  const [rawType,setRawType]=useState("");
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<string[]>([]), [kind, setKind] = useState(""), [whitelist, setWhitelist] = useState(false), [decision, setDecision] = useState<Plan["decision"]>("redact");
  const [preview, setPreview] = useState<{ input: Plan; documents: (Version & { affected: number })[] } | null>(null), [receipt, setReceipt] = useState<Version[] | null>(null), [done, setDone] = useState("");
  useEffect(() => { setSelected(current => current.filter(id => docs.some(d => d.id === id))); }, [docs]);
  function invalidate() { setPreview(null); setDone(""); }
  return <section className="batch-review">
    <button className="secondary" aria-expanded={active && open} onClick={() => { if (active && open) setOpen(false); else { setOpen(true); activate(); } }}>{active && open ? "收起批量复核" : "项目批量复核"}</button>
    {active && open && <div className="panel"><h2>项目批量复核</h2><p className="muted">只处理勾选材料中的待确认候选，最多 20 份。未加载和未勾选的材料不会被修改。请先核对原文。</p>
      <div className="batch-documents">{docs.map((d, i) => <label key={d.id}><input type="checkbox" aria-label={`批量选择 ${d.name ?? `文本 ${docs.length - i}`}`} checked={selected.includes(d.id)} disabled={d.state !== "review" || d.revision === undefined || selected.length >= 20 && !selected.includes(d.id)} onChange={e => { setSelected(e.target.checked ? [...selected, d.id] : selected.filter(v => v !== d.id)); invalidate(); }} />{d.name ?? `文本 ${docs.length - i}`}</label>)}</div>
      <div className="bulk-review"><label>候选类型<select aria-label="批量候选类型" value={kind} onChange={e => { setKind(e.target.value); invalidate(); }}><option value="">全部类型</option>{markSchema.shape.kind.options.map(k => <option key={k}>{k}</option>)}</select></label>{kind==="自定义"&&<label>自定义类型名称<input value={rawType} onChange={e=>{setRawType(e.target.value);invalidate();}}/></label>}
        <label>处理决定<select aria-label="批量处理决定" value={decision} onChange={e => { setDecision(e.target.value as Plan["decision"]); invalidate(); }}><option value="redact">脱敏处理</option><option value="ignore">保留原值</option></select></label>
        <label className="check-label"><input type="checkbox" checked={whitelist} onChange={e => { setWhitelist(e.target.checked); invalidate(); }} />仅白名单建议</label>
        <button className="secondary" disabled={!selected.length || selected.some(id => !docs.some(d => d.id === id))} onClick={() => void run(async () => {
          const input: Plan = { documents: selected.map(id => ({ id, revision: docs.find(d => d.id === id)!.revision! })), ...(kind ? { kind,...kind==="自定义"&&rawType?{rawEntityType:rawType}:{} } : {}), decision, whitelist };
          const result = await api<{ documents: (Version & { affected: number })[] }>(`/projects/${project}/review-batch/preview`, "POST", input); setPreview({ input, documents: result.documents }); setDone("");
        })}>核对批量范围</button>
      </div>
      {preview && <div className="batch-confirm"><ul>{preview.documents.map(d => <li key={d.id}>{docs.find(item => item.id === d.id)?.name ?? `文本 ${docs.length - docs.findIndex(item => item.id === d.id)}`} · 版本 {d.revision} · {d.affected} 项</li>)}</ul><button disabled={!preview.documents.some(d => d.affected)} onClick={async () => {
        if (!await confirmAction(`确认保存 ${preview.documents.length} 份材料的批量复核？这些材料正在生成的旧副本任务会被取消。任一版本冲突时整批不保存。`)) return;
        void run(async () => { const result = await api<{ documents: Version[] }>(`/projects/${project}/review-batch/apply`, "POST", preview.input); setReceipt(result.documents); setPreview(null); setDone("批量复核已保存"); await changed(); });
      }}>确认批量保存</button></div>}
      {done && <p role="status">{done}</p>}
      {receipt && <button className="quiet" onClick={async () => { if (await confirmAction("将本次批量复核恢复为操作前的决定，并创建新版本。材料已被再次修改时会拒绝撤销。确定继续？")) void run(async () => { await api(`/projects/${project}/review-batch/undo`, "POST", { documents: receipt }); setReceipt(null); setPreview(null); setDone("已撤销本次批量复核"); await changed(); }); }}>撤销本次批量复核</button>}
    </div>}
  </section>;
}
