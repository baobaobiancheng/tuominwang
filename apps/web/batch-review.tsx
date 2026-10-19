import { useConfirmAction } from "./confirm-action.tsx";
import React, { useEffect, useState } from "react";
import { markSchema } from "../../packages/contracts/index.ts";
type Version = { id: string; revision: number };
type Plan = { documents: Version[]; decision: "redact" | "ignore"; kind?: string; rawEntityType?:string; whitelist: boolean };
type Mode = "default_star" | "full_star" | "default_pseudonym" | "custom_pseudonym" | "selective_pseudonym";
type ModeScope = "docx" | "markdown" | "visual";
type ModePlan = { documents: Version[]; scope: ModeScope; mode: Mode; confirmOverride: boolean };
type ModeResult = Version & { previousMode: Mode; mode: Mode; status: "apply" | "unchanged" | "scope-skipped" | "selective-skipped" };
const modeLabel:Record<Mode,string>={default_star:"半 * 号脱敏",full_star:"全 * 号脱敏",default_pseudonym:"假名脱敏",custom_pseudonym:"假名脱敏",selective_pseudonym:"混合脱敏"};
export function BatchReview({ project, docs, run, api, changed, active, activate }: {
  project: string; docs: { id: string; name?: string; state: string; revision?: number }[];
  run: (action: () => Promise<void>) => Promise<void>; api: <T>(path: string, method?: string, body?: unknown) => Promise<T>; changed: () => Promise<void>;
  active: boolean; activate: () => void;
}) {
  const confirmAction = useConfirmAction();
  const [rawType,setRawType]=useState("");
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<string[]>([]), [kind, setKind] = useState(""), [whitelist, setWhitelist] = useState(false), [decision, setDecision] = useState<Plan["decision"]>("redact");
  const [preview, setPreview] = useState<{ input: Plan; documents: (Version & { affected: number })[] } | null>(null), [receipt, setReceipt] = useState<Version[] | null>(null), [done, setDone] = useState("");
  const [modeScope,setModeScope]=useState<ModeScope>("docx"),[mode,setMode]=useState<Mode>("default_star"),[modePreview,setModePreview]=useState<{input:ModePlan;documents:ModeResult[]}|null>(null);
  useEffect(() => { setSelected(current => current.filter(id => docs.some(d => d.id === id))); }, [docs]);
  function invalidate() { setPreview(null); setModePreview(null); setDone(""); }
  return <section className="batch-review">
    <button className="secondary" aria-expanded={active && open} onClick={() => { if (active && open) setOpen(false); else { setOpen(true); activate(); } }}>{active && open ? "收起批量复核" : "项目批量复核"}</button>
    {active && open && <div className="panel"><h2>项目批量复核</h2><p className="muted">批量决定每次最多处理 20 份待确认候选。未加载和未勾选的材料不会被修改。请先核对原文。</p>
      <div className="batch-documents">{docs.map((d, i) => <label key={d.id}><input type="checkbox" aria-label={`批量选择 ${d.name ?? `文本 ${docs.length - i}`}`} checked={selected.includes(d.id)} disabled={d.state !== "review" || d.revision === undefined} onChange={e => { setSelected(e.target.checked ? [...selected, d.id] : selected.filter(v => v !== d.id)); invalidate(); }} />{d.name ?? `文本 ${docs.length - i}`}</label>)}</div>
      <div className="bulk-review"><label>候选类型<select aria-label="批量候选类型" value={kind} onChange={e => { setKind(e.target.value); invalidate(); }}><option value="">全部类型</option>{markSchema.shape.kind.options.map(k => <option key={k}>{k}</option>)}</select></label>{kind==="自定义"&&<label>自定义类型名称<input value={rawType} onChange={e=>{setRawType(e.target.value);invalidate();}}/></label>}
        <label>处理决定<select aria-label="批量处理决定" value={decision} onChange={e => { setDecision(e.target.value as Plan["decision"]); invalidate(); }}><option value="redact">脱敏处理</option><option value="ignore">保留原值</option></select></label>
        <label className="check-label"><input type="checkbox" checked={whitelist} onChange={e => { setWhitelist(e.target.checked); invalidate(); }} />仅白名单建议</label>
        <button className="secondary" disabled={!selected.length || selected.length>20 || selected.some(id => !docs.some(d => d.id === id))} onClick={() => void run(async () => {
          const input: Plan = { documents: selected.map(id => ({ id, revision: docs.find(d => d.id === id)!.revision! })), ...(kind ? { kind,...kind==="自定义"&&rawType?{rawEntityType:rawType}:{} } : {}), decision, whitelist };
          const result = await api<{ documents: (Version & { affected: number })[] }>(`/projects/${project}/review-batch/preview`, "POST", input); setPreview({ input, documents: result.documents }); setDone("");
        })}>核对批量范围</button>
      </div>
      <div className="bulk-review"><label>材料类型<select aria-label="批量导出材料类型" value={modeScope} onChange={e=>{setModeScope(e.target.value as ModeScope);if(e.target.value==="visual"&&mode==="full_star")setMode("default_star");invalidate();}}><option value="docx">Word</option><option value="markdown">Markdown</option><option value="visual">PDF、图片</option></select></label>
        <label>脱敏方式<select aria-label="批量脱敏方式" value={mode} onChange={e=>{setMode(e.target.value as Mode);invalidate();}}><option value="default_star">{modeScope==="visual"?"仅遮盖脱敏":"半 * 号脱敏"}</option>{modeScope!=="visual"&&<option value="full_star">全 * 号脱敏</option>}<option value="custom_pseudonym">假名脱敏</option><option value="selective_pseudonym">混合脱敏</option></select></label>
        <button className="secondary" disabled={!selected.length} onClick={()=>void run(async()=>{const input:ModePlan={documents:selected.map(id=>({id,revision:docs.find(d=>d.id===id)!.revision!})),scope:modeScope,mode,confirmOverride:false};const result=await api<{documents:ModeResult[]}>(`/projects/${project}/review-mode-batch/preview`,"POST",input);setModePreview({input,documents:result.documents});setDone("");})}>核对批量脱敏方式</button>
      </div>
      {modePreview&&<div className="batch-confirm"><ul>{modePreview.documents.map(d=><li key={d.id}>{docs.find(item=>item.id===d.id)?.name??d.id} · 版本 {d.revision} · {d.status==="apply"?`${modeScope==="visual"&&d.previousMode==="default_star"?"仅遮盖脱敏":modeLabel[d.previousMode]} → ${modeScope==="visual"&&d.mode==="default_star"?"仅遮盖脱敏":modeLabel[d.mode]}`:d.status==="selective-skipped"?"未设置混合脱敏，跳过":d.status==="scope-skipped"?"不属于所选材料类型，跳过":"保持当前方式并同步设置"}</li>)}</ul><button disabled={!modePreview.documents.some(d=>d.status==="apply"||d.status==="unchanged")} onClick={async()=>{if(modePreview.documents.some(d=>d.status==="apply")&&!await confirmAction("确认批量修改脱敏方式？已单独设置的材料会被覆盖；任一版本冲突时整批不保存。"))return;void run(async()=>{await api(`/projects/${project}/review-mode-batch/apply`,"POST",{...modePreview.input,confirmOverride:true});setModePreview(null);setDone("批量脱敏方式已保存");await changed();});}}>确认批量修改</button></div>}
      {preview && <div className="batch-confirm"><ul>{preview.documents.map(d => <li key={d.id}>{docs.find(item => item.id === d.id)?.name ?? `文本 ${docs.length - docs.findIndex(item => item.id === d.id)}`} · 版本 {d.revision} · {d.affected} 项</li>)}</ul><button disabled={!preview.documents.some(d => d.affected)} onClick={async () => {
        if (!await confirmAction(`确认保存 ${preview.documents.length} 份材料的批量复核？这些材料正在生成的旧副本任务会被取消。任一版本冲突时整批不保存。`)) return;
        void run(async () => { const result = await api<{ documents: Version[] }>(`/projects/${project}/review-batch/apply`, "POST", preview.input); setReceipt(result.documents); setPreview(null); setDone("批量复核已保存"); await changed(); });
      }}>确认批量保存</button></div>}
      {done && <p role="status">{done}</p>}
      {receipt && <button className="quiet" onClick={async () => { if (await confirmAction("将本次批量复核恢复为操作前的决定，并创建新版本。材料已被再次修改时会拒绝撤销。确定继续？")) void run(async () => { await api(`/projects/${project}/review-batch/undo`, "POST", { documents: receipt }); setReceipt(null); setPreview(null); setDone("已撤销本次批量复核"); await changed(); }); }}>撤销本次批量复核</button>}
    </div>}
  </section>;
}
