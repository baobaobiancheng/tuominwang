import React, { useState } from "react";
type Revision = { revision: number; created_at: string; review_mode: 'automatic' | 'human_review' | 'legacy' };
export function RevisionHistory({ load, disabled }: { load: () => Promise<Revision[]>; disabled: boolean }) {
  const [items, setItems] = useState<Revision[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function show() { setBusy(true); setError(""); try { setItems(await load()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <section aria-label="已保存复核记录"><button className="quiet" disabled={disabled || busy} onClick={() => items ? setItems(null) : void show()}> {items ? "收起复核记录" : "查看复核记录"}</button>{error && <p role="alert">{error}</p>}{items && <><p className="muted">以下为已保存的复核版本记录。</p>{items.length ? <table><thead><tr><th>复核版本</th><th>审定来源</th><th>保存时间</th></tr></thead><tbody>{items.map(item => <tr key={item.revision}><td>{item.revision}</td><td>{item.review_mode === 'automatic' ? '系统自动决定，未人工复核' : item.review_mode === 'human_review' ? '人工复核已保存' : '审定来源未记录'}</td><td>{new Date(item.created_at).toLocaleString("zh-CN")}</td></tr>)}</tbody></table> : <p>尚无已保存复核记录。</p>}</>}</section>;
}
