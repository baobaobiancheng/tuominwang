import React, { useEffect, useRef, useState } from "react";
import type { OcrCorrectionInput, OcrTextView } from "../../packages/contracts/ocr.ts";
import { textareaCoordinateBridge } from "./textarea-coordinates.ts";

type Props = { documentId: string; revision: number; page: number; disabled: boolean;
  load: (page: number, revision: number) => Promise<OcrTextView>;
  save: (page: number, input: OcrCorrectionInput) => Promise<{ revision: number; changed: boolean }>;
  onSaved: (revision: number) => Promise<void>; run?: (action: () => Promise<void>) => Promise<void> };
export function OcrTextEditor({ documentId, revision, page, disabled, load, save, onSaved, run }: Props) {
  const [opened, setOpened] = useState(false), [data, setData] = useState<OcrTextView | null>(null), [text, setText] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 }), [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const generation = useRef(0), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; generation.current++; }; }, []);
  useEffect(() => { generation.current++; setData(null); setText(""); setSelection({ start: 0, end: 0 }); setReplacement(""); setOpened(false); setError(""); setMessage(""); setBusy(false); }, [documentId, revision, page]);
  async function open() {
    const current = ++generation.current; setOpened(true); setBusy(true); setError("");
    try { const next = await load(page, revision); if (active.current && current === generation.current) { setData(next); setText(next.text); } }
    catch (e) { if (active.current && current === generation.current) setError((e as Error).message); }
    finally { if (active.current && current === generation.current) setBusy(false); }
  }
  async function submit() {
    if (!data || selection.end <= selection.start || disabled || busy) return;
    const current = ++generation.current; setBusy(true); setError(""); setMessage("");
    try {
      const result = await save(page, { revision: data.revision, start: selection.start, end: selection.end, expectedText: text.slice(selection.start, selection.end), text: replacement });
      if (!active.current || current !== generation.current) return;
      if (result.changed) { setData(null); await onSaved(result.revision); }
      else setMessage("文字未改变，无需保存。");
    } catch (e) { if (active.current && current === generation.current) setError((e as Error).message); }
    finally { if (active.current && current === generation.current) setBusy(false); }
  }
  return <section aria-label="识别文字纠错" className="ocr-text-editor">
    <button className="secondary" disabled={disabled || busy} onClick={() => opened ? setOpened(false) : void open()}>{opened ? "收起识别文字" : "纠正识别文字"}</button>
    {opened && <>
      <p className="muted">选中识别错误的文字，再输入正确内容。保存后需重新复核；原件图片不变。增删文字使用原文字区域定位，请检查处理预览。</p>
      {busy && <p role="status">正在处理识别文字…</p>}
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {data && <>
        <label>本页识别文字<textarea aria-label="本页识别文字" value={text} readOnly rows={8} onSelect={e => {
          try {
            const field=e.currentTarget, bridge=textareaCoordinateBridge(text,field.value);
            const start=bridge.toCanonical(field.selectionStart),end=bridge.toCanonical(field.selectionEnd);
            setSelection({start,end});setReplacement(text.slice(start,end));setError("");
          } catch {
            setSelection({start:0,end:0});setReplacement("");setError("识别文字选区与原文坐标不一致，请重新打开本页后选择。");
          }
        }} /></label>
        {!text && <p>本页没有可纠正的识别文字，可在原件上手动框选敏感区域。</p>}
        <label>纠正为<textarea aria-label="纠正后的文字" value={replacement} rows={3} disabled={disabled || busy || selection.end <= selection.start} onChange={e => setReplacement(e.target.value)} /></label>
        <button className="secondary" disabled={disabled || busy || selection.end <= selection.start || replacement === text.slice(selection.start, selection.end)} onClick={() => void (run ? run(submit) : submit())}>保存文字并重新复核</button>
      </>}
    </>}
  </section>;
}
