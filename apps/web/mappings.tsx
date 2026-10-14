import { useConfirmAction } from "./confirm-action.tsx";
import React, { useEffect, useRef, useState } from "react";
import type { DocumentView, Mark } from "../../packages/contracts/index.ts";
type Reference = Extract<NonNullable<Mark["replacement"]>, { mode: "alias" }>;
type Calls = { run: (action: () => Promise<void>) => Promise<void>; api: <T>(path: string, method?: string, body?: unknown) => Promise<T> };

export function MappingPicker({ doc, mark, assigned, run, api }: Calls & { doc: DocumentView; mark: Mark; assigned: (ref: Reference) => void }) {
  const confirmAction = useConfirmAction();
  const [proposals, setProposals] = useState<Reference[] | null>(null), requestId = useRef(crypto.randomUUID());
  const body = { revision: doc.revision, start: mark.start, end: mark.end, kind: mark.kind };
  return <div className="mapping-picker">
    {mark.replacement?.mode === "alias" && <p className="muted">项目假名：{mark.replacement.token}</p>}
    <button className="quiet" onClick={() => void run(async () => { const result = await api<{ proposals: Reference[] }>(`/documents/${doc.id}/mapping-proposals`, "POST", body); setProposals(result.proposals); })}>选择项目假名</button>
    {proposals && <div className="mapping-proposals">
      <p className="muted">{proposals.length ? "同名不一定是同一实体，请核对后选择。" : "未找到同名假名，可创建新的实体关系。"}</p>
      {proposals.map(ref => <button className="secondary" key={ref.mappingId} onClick={() => { assigned(ref); setProposals(null); }}>确认同一实体并使用 {ref.token}</button>)}
      <button className="secondary" onClick={async () => {
        if (!await confirmAction("为此处创建独立假名并加密保存还原关系？即使名称相同，也不会自动合并。")) return;
        void run(async () => { const ref = await api<Reference>(`/documents/${doc.id}/mappings`, "POST", { ...body, requestId: requestId.current }); assigned(ref); setProposals(null); requestId.current = crypto.randomUUID(); });
      }}>{proposals.length ? "创建不同实体假名" : "创建新假名"}</button>
      <button className="quiet" onClick={() => setProposals(null)}>取消选择</button>
    </div>}
  </div>;
}

export function MappingList({ project, run, api, active, activate }: Calls & { project: string; active: boolean; activate: () => void }) {
  const [list, setList] = useState<{ id: string; value: string; token: string; kind: string }[] | null>(null), [more, setMore] = useState(false);
  async function load(append = false) {
    const next = await api<NonNullable<typeof list>>(`/projects/${project}/mappings?limit=20&offset=${append ? list?.length ?? 0 : 0}`);
    setList(previous => append ? [...previous ?? [], ...next] : next); setMore(next.length === 20);
  }
  return <section className="mapping-list"><button className="secondary" aria-expanded={active && list !== null} onClick={() => active && list !== null ? setList(null) : list !== null ? activate() : void run(async () => { await load(); activate(); })}>{active && list !== null ? "收起假名映射" : "查看假名映射"}</button>
    {active && list !== null && <div className="panel"><h2>项目假名映射</h2><p className="muted">此处包含原始信息，请勿转发给无权接收的人。</p>{!list.length ? <p>尚未创建项目假名。</p> : <table className="data-table"><thead><tr><th>假名</th><th>原值</th><th>类型</th></tr></thead><tbody>{list.map(m => <tr key={m.id}><td>{m.token}</td><td>{m.value}</td><td>{m.kind}</td></tr>)}</tbody></table>}{more && <button className="secondary" onClick={() => void run(() => load(true))}>更多映射</button>}</div>}
  </section>;
}

export function RestoreDialog({ doc, disabled, run, api }: Calls & { doc: Pick<DocumentView, "id" | "revision">; disabled: boolean }) {
  const confirmAction = useConfirmAction();
  const dialog = useRef<HTMLDialogElement>(null), [text, setText] = useState(""), [restored, setRestored] = useState<string | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    if (text) window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [text]);
  async function close() { if (text && !await confirmAction("关闭后将清空此处文本和还原结果，确定关闭？")) return; dialog.current?.close(); setText(""); setRestored(null); setError(""); }
  async function restore(download = false) {
    setError("");
    try {
      // Recheck the current permission and revision for a new download, not just the earlier on-screen preview.
      const result = await api<{ text: string }>(`/documents/${doc.id}/restore`, "POST", { revision: doc.revision, text });
      setRestored(result.text);
      if (download) {
        const url = URL.createObjectURL(new Blob([result.text], { type: "text/plain;charset=utf-8" })), a = document.createElement("a");
        a.href = url; a.download = "restored.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (e) { setRestored(null); setError((e as Error).message); throw e; }
  }
  return <>
    <button className="secondary" disabled={disabled} onClick={() => dialog.current?.showModal()}>还原假名</button>
    <dialog className="restore-dialog" ref={dialog} onCancel={e => { e.preventDefault(); close(); }}>
      <h2>还原假名</h2><p className="muted">仅使用本材料复核版本 {doc.revision} 已确认的假名。未知或变形代号不会猜测还原。最多 100 KiB。</p>
      <label>待还原文本<textarea aria-label="待还原文本" rows={8} value={text} onChange={e => { setText(e.target.value); setRestored(null); setError(""); }} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {restored !== null && <label>还原结果<textarea aria-label="还原结果" readOnly rows={8} value={restored} /></label>}
      <div className="actions"><button className="quiet" onClick={close}>关闭还原</button><button disabled={!text || new TextEncoder().encode(text).length > 102400} onClick={async () => {
        if (!await confirmAction("还原结果将包含敏感原文，确认在当前工作台展示？")) return;
        void run(() => restore());
      }}>确认还原</button>{restored !== null && <button className="secondary" onClick={() => void run(() => restore(true))}>下载还原文本</button>}</div>
    </dialog>
  </>;
}
