import {entityLabel} from "../../packages/core/entity-identity.ts";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Mark } from "../../packages/contracts/index.ts";
import type { DocxBlock, DocxLayout, DocxRun, DocxTextStyle } from "../../packages/contracts/docx-layout.ts";
import { appUrl } from "./urls.ts";
import { typeColor } from "./text-highlights.tsx";
import "./docx-review.css";
import { processingRead } from "./processing-read-retry.ts";
export type DocxSelection = { start: number; end: number };
type TextRun = Extract<DocxRun, { kind: "text" }>;
type Highlight = { start: number; end: number; mark: Mark };
/** One sweep per marks change: large documents do not scan all marks for every Word run. */
export function docxHighlights(marks: readonly Mark[]): Highlight[] {
  const events = marks.flatMap((mark, i) => [{ at: mark.start, i, add: true }, { at: mark.end, i, add: false }]).sort((a, b) => a.at - b.at);
  const active = new Set<number>(), heap: number[] = [], output: Highlight[] = [];
  const better = (a: number, b: number) => Number(marks[a].decision === "ignore") - Number(marks[b].decision === "ignore") || a - b;
  function push(value: number) { heap.push(value); let n = heap.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (better(heap[p], value) <= 0) break; heap[n] = heap[p]; n = p; } heap[n] = value; }
  function pop() { const value = heap.pop()!; if (!heap.length) return; let n = 0; while (n * 2 + 1 < heap.length) { let c = n * 2 + 1; if (c + 1 < heap.length && better(heap[c + 1], heap[c]) < 0) c++; if (better(value, heap[c]) <= 0) break; heap[n] = heap[c]; n = c; } heap[n] = value; }
  for (let i = 0; i < events.length;) {
    const at = events[i].at;
    while (i < events.length && events[i].at === at) { const e = events[i++]; if (e.add) { active.add(e.i); push(e.i); } else active.delete(e.i); }
    while (heap.length && !active.has(heap[0])) pop();
    const end = events[i]?.at;
    if (heap.length && end !== undefined && end > at) { const mark = marks[heap[0]], previous = output.at(-1); if (previous?.mark === mark && previous.end === at) previous.end = end; else output.push({ start: at, end, mark }); }
  }
  return output;
}
function runSegments(run: TextRun, highlights: Highlight[]) {
  const result: { start: number; end: number; text: string; mark?: Mark }[] = []; let from = run.start, low = 0, high = highlights.length;
  while (low < high) { const mid = (low + high) >>> 1; if (highlights[mid].end <= from) low = mid + 1; else high = mid; }
  const add = (start: number, end: number, mark?: Mark) => { if (start < end) result.push({ start, end, text: run.text.slice(start - run.start, end - run.start), mark }); };
  for (let i = low; i < highlights.length && highlights[i].start < run.end; i++) { const h = highlights[i], start = Math.max(from, h.start), end = Math.min(run.end, h.end); add(from, start); add(start, end, h.mark); from = end; }
  add(from, run.end); return result;
}
/** Keep original UTF-16 ranges when Word has split an entity across styled runs. */
export function docxRunSegments(run: TextRun, marks: readonly Mark[]) { return runSegments(run, docxHighlights(marks)); }
/** Reject selections outside mapped original text or crossing paragraph/object boundaries. */
export function docxSelection(root: HTMLElement, selection: Selection | null): DocxSelection | null {
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return null;
  function endpoint(node: Node, offset: number) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    const span = el?.closest<HTMLElement>("[data-docx-start]"); if (!span || !root.contains(span)) return null;
    const paragraph = span.closest<HTMLElement>("[data-docx-paragraph]"); if (!paragraph) return null;
    const range = document.createRange(); range.selectNodeContents(span); try { range.setEnd(node, offset); } catch { return null; }
    const start = Number(span.dataset.docxStart), end = Number(span.dataset.docxEnd), position = start + range.toString().length;
    if (!Number.isSafeInteger(position) || position < start || position > end) return null;
    return { paragraph, position };
  }
  const a = endpoint(selection.anchorNode, selection.anchorOffset), b = endpoint(selection.focusNode, selection.focusOffset);
  if (!a || !b || a.paragraph !== b.paragraph || a.position === b.position) return null;
  return { start: Math.min(a.position, b.position), end: Math.max(a.position, b.position) };
}
function css(style: DocxTextStyle): React.CSSProperties {
  return { fontFamily: style.font ? `"${style.font}", serif` : undefined, fontSize: style.size ? `${style.size}pt` : undefined, fontWeight: style.bold ? 700 : style.bold === false ? 400 : undefined, fontStyle: style.italic ? "italic" : undefined, textDecoration: [style.underline && "underline", (style.strike || style.deleted) && "line-through"].filter(Boolean).join(" ") || undefined, color: style.color, backgroundColor: style.background, verticalAlign: style.vertical === "super" ? "super" : style.vertical === "sub" ? "sub" : undefined };
}
type Props = { documentId: string; revision: number; marks: readonly Mark[]; api: <T>(path: string, method?: string, body?: unknown) => Promise<T>; disabled?: boolean; onSelect: (range: DocxSelection | null) => void; onMark?: (mark: Mark) => void; focusRange?: DocxSelection | null };
export function DocxReview({ documentId, revision, marks, api, disabled = false, onSelect, onMark, focusRange }: Props) {
  const [layout, setLayout] = useState<DocxLayout | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0), [zoom, setZoom] = useState(1), [selectionNote, setSelectionNote] = useState("");
  const highlights = useMemo(() => docxHighlights(marks), [marks]);
  const root = useRef<HTMLDivElement>(null), apiRef = useRef(api); apiRef.current = api;
  useEffect(() => {
    let live = true; const controller = new AbortController(); setLayout(null); setError(""); onSelect(null);
    void processingRead(() => apiRef.current<DocxLayout>(`/documents/${documentId}/docx-layout?revision=${revision}`), controller.signal).then(value => { if (live) setLayout(value); }).catch(e => { if (live && e?.name !== "AbortError") setError(e?.message ?? "版式预览加载失败"); });
    return () => { live = false; controller.abort(); };
  }, [documentId, revision, retry]);
  useEffect(() => {
    if (!layout || !focusRange || !root.current) return;
    const match = Array.from(root.current.querySelectorAll<HTMLElement>("[data-docx-start]")).find(el => Number(el.dataset.docxStart) <= focusRange.start && Number(el.dataset.docxEnd) > focusRange.start);
    match?.scrollIntoView({ block: "center", behavior: "smooth" });
    setSelectionNote(match ? "已定位对应原文。" : "此标记位于属性、图片文字或未展示对象，请在对象原文或图片审查区查看。");
  }, [focusRange?.start, focusRange?.end, layout]);
  function selected() {
    if (disabled || !root.current) return;
    const selection = window.getSelection(), range = docxSelection(root.current, selection); onSelect(range);
    setSelectionNote(range ? "已选中原文，可加入人工标记。" : selection && !selection.isCollapsed ? "请在同一个段落内选择原文；跨段落或图片请分别标注。" : "");
  }
  function renderBlocks(blocks: DocxBlock[], prefix: string): React.ReactNode {
    return blocks.map((block, index) => {
      if (block.kind === "table") return <table key={`${prefix}:${index}`} className="docx-paper-table"><colgroup>{block.widths.map((w, i) => <col key={i} style={w ? { width: `${w}pt` } : undefined} />)}</colgroup><tbody>{block.rows.map((r, i) => <tr key={i}>{r.cells.map((c, j) => <td key={j} colSpan={c.span}>{c.merge === "continue" && <small className="docx-merge-note">纵向合并续格</small>}{renderBlocks(c.blocks, `${prefix}:${index}:${i}:${j}`)}</td>)}</tr>)}</tbody></table>;
      const s = block.style;
      return <p key={block.id} data-docx-paragraph={block.id} className={s.breakBefore ? "docx-paragraph docx-break-before" : "docx-paragraph"} style={{ textAlign: s.align, marginTop: `${s.before ?? 0}pt`, marginBottom: `${s.after ?? 8}pt`, marginLeft: `${s.left ?? 0}pt`, marginRight: `${s.right ?? 0}pt`, textIndent: `${s.indent ?? 0}pt`, lineHeight: s.line ?? 1.5 }}>{block.runs.length ? block.runs.map((run, i) => {
        if (run.kind === "break") return run.page ? <span key={i} className="docx-page-break" role="separator" aria-label="分页符" /> : <br key={i} />;
        if (run.kind === "tab") return <span key={i} className="docx-tab" aria-label="制表符">{"\t"}</span>;
        if (run.kind === "image") return <img key={i} className="docx-inline-image" draggable={false} alt={`文档图片 ${run.page + 1}，区域标注请使用图片审查区`} src={appUrl(`/api/documents/${documentId}/pages/${run.page}?revision=${revision}`)} style={{ width: run.width ? `${run.width}pt` : undefined, maxHeight: run.height ? `${run.height}pt` : undefined }} />;
        return <span key={i} style={css(run.style)}>{runSegments(run, highlights).map(segment => <span key={segment.start} data-docx-start={segment.start} data-docx-end={segment.end} className={segment.mark ? `docx-mark docx-mark--${segment.mark.decision}` : undefined} style={segment.mark ? { "--docx-mark-color": typeColor(segment.mark.kind) } as React.CSSProperties : undefined} title={segment.mark ? `${entityLabel(segment.mark)} · ${segment.mark.decision === "redact" ? "脱敏" : segment.mark.decision === "ignore" ? "保留" : "待确认"}` : undefined} role={segment.mark ? "button" : undefined} tabIndex={segment.mark ? 0 : undefined} onClick={() => { if (segment.mark && window.getSelection()?.isCollapsed !== false) onMark?.(segment.mark); }} onKeyDown={e => { if (segment.mark && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onMark?.(segment.mark); } }}>{segment.text}</span>)}</span>;
      }) : <br />}</p>;
    });
  }
  return <section className="docx-review" aria-label="Word 版式审查"><div className="docx-controls"><strong>Word 版式</strong><label>缩放 <select aria-label="Word 预览缩放" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[.6, .8, 1, 1.2, 1.5].map(n => <option key={n} value={n}>{Math.round(n * 100)}%</option>)}</select></label><span>只读原件</span></div>
    <p className="muted">按文档段落、字体和表格展示；浏览器字体、分页和浮动对象可能与 Word 不同。导出仍使用原始文件。</p>
    {error && <p role="alert">{error} <button type="button" className="secondary" onClick={() => setRetry(n => n + 1)}>重试版式预览</button></p>}
    {!layout && !error && <p role="status">正在加载 Word 版式…</p>}
    {layout && <><details className="docx-warnings"><summary>其他对象与版式说明</summary><p>已关联 {layout.mappedParagraphs} 个段落；另有 {layout.otherObjectCount} 个属性、图片或其他对象，请在对象原文与图片审查区完整复核。</p>{layout.warnings.map(w => <p key={w}>{w}</p>)}</details><div className="docx-scroll" ref={root} onMouseUp={selected} onKeyUp={e => { if (e.key.startsWith("Arrow") || e.key === "Shift") selected(); }}><article className="docx-paper" style={{ width: `${layout.page.width}pt`, minHeight: `${layout.page.height}pt`, padding: `${layout.page.top}pt ${layout.page.right}pt ${layout.page.bottom}pt ${layout.page.left}pt`, zoom }}>{renderBlocks(layout.blocks, "body")}</article>{layout.supplements.map((part, i) => <article className="docx-paper docx-supplement" key={part.part} style={{ width: `${layout.page.width}pt`, padding: "36pt", zoom }}><h3 className="docx-part-title">{part.label}</h3>{renderBlocks(part.blocks, `part:${i}`)}</article>)}</div></>}
    {selectionNote && <p role="status" className="docx-selection-note">{selectionNote}</p>}
  </section>;
}
