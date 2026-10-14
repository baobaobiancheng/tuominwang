import {entityLabel} from "../../packages/core/entity-identity.ts";
import { renderDocxVml } from "./docx-vml-preview.ts";
import React, { useEffect, useRef, useState } from "react";
import type { Mark } from "../../packages/contracts/index.ts";
import type { DocxPreviewPackage, DocxPreviewRun } from "../../packages/contracts/docx-preview.ts";
import { DocxReview, docxHighlights, type DocxSelection } from "./docx-review.tsx";
import { typeColor } from "./text-highlights.tsx";
import "./docx-review.css";
import { processingRead } from "./processing-read-retry.ts";
export const DOCX_PREVIEW_CSP = "default-src 'none'; script-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; media-src 'none'";
const frameHtml = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${DOCX_PREVIEW_CSP}"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;background:#e8ecf0;color:#17202b}.docx-wrapper{padding:20px!important}.tmw-word-text mark{background:color-mix(in srgb,var(--tmw-color) 20%,transparent);border-bottom:2px solid var(--tmw-color);cursor:pointer;padding:0;border-radius:2px}.tmw-word-text mark[data-decision=ignore]{background:transparent;border-bottom-style:dotted}.tmw-word-text mark:focus-visible{outline:2px solid #2563eb}section.docx{margin-bottom:20px!important}a{color:inherit;pointer-events:none}</style></head><body><div id="word"></div></body></html>`;
type Atom = { element: HTMLElement; start: number; end: number; text: string; paragraph: string };
export function bindPreviewRuns(root: HTMLElement, runs: DocxPreviewRun[]) {
  const atoms: Atom[] = [], missing = new Set<string>();
  for (const run of runs) {
    const starts = Array.from(root.querySelectorAll<HTMLElement>(`[id="${run.id}"]`)); if (!starts.length) { missing.add(run.id); continue; }
    for (const start of starts) {
      const siblings: Node[] = []; let next = start.nextSibling;
      while (next && !(next.nodeType === 1 && (next as Element).id === run.id + "_END")) { siblings.push(next); next = next.nextSibling; }
      if (!next) { missing.add(run.id); continue; }
      const nodes: Text[] = [], doc = root.ownerDocument;
      for (const sibling of siblings) {
        if (sibling.nodeType === 3) nodes.push(sibling as Text);
        else { const walker = doc.createTreeWalker(sibling, 4); let node: Node | null; while ((node = walker.nextNode())) if (!(node.parentElement?.closest(".docx-tab-stop"))) nodes.push(node as Text); }
      }
      if (nodes.map(n => n.data).join("") !== run.text) { missing.add(run.id); continue; }
      let offset = run.start;
      for (const node of nodes) { if (!node.data.length) continue; const el = doc.createElement("span"); el.className = "tmw-word-text"; el.dataset.docxParagraph = run.paragraph; el.dataset.docxStart = String(offset); el.dataset.docxEnd = String(offset + node.data.length); node.parentNode!.insertBefore(el, node); el.appendChild(node); atoms.push({ element: el, start: offset, end: offset + node.data.length, text: node.data, paragraph: run.paragraph }); offset += node.data.length; }
    }
  }
  return { atoms, missing: missing.size };
}
export function previewSelection(root: HTMLElement, selection: Selection | null): DocxSelection | null {
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return null;
  const endpoint = (node: Node, offset: number) => { const el = node.nodeType === 1 ? node as Element : node.parentElement, span = el?.closest<HTMLElement>("[data-docx-start]"); if (!span || !root.contains(span)) return null; const range = root.ownerDocument.createRange(); range.selectNodeContents(span); try { range.setEnd(node, offset); } catch { return null; } const from = Number(span.dataset.docxStart), end = Number(span.dataset.docxEnd), position = from + range.toString().length; if (!Number.isSafeInteger(position) || position < from || position > end) return null; return { paragraph: span.closest<HTMLElement>("[data-docx-paragraph]")?.dataset.docxParagraph, position }; };
  const a = endpoint(selection.anchorNode, selection.anchorOffset), b = endpoint(selection.focusNode, selection.focusOffset); if (!a?.paragraph || a.paragraph !== b?.paragraph || a.position === b.position) return null; return { start: Math.min(a.position, b.position), end: Math.max(a.position, b.position) };
}
function paint(atoms: Atom[], marks: readonly Mark[], onMark: (mark: Mark) => void) {
  const highlights = docxHighlights(marks);
  for (const atom of atoms) {
    const doc = atom.element.ownerDocument, fragment = doc.createDocumentFragment(); let from = atom.start, low = 0, high = highlights.length;
    while (low < high) { const mid = (low + high) >>> 1; if (highlights[mid].end <= from) low = mid + 1; else high = mid; }
    function add(start: number, end: number, mark?: Mark) { if (start >= end) return; const span = doc.createElement(mark ? "mark" : "span"); span.dataset.docxStart = String(start); span.dataset.docxEnd = String(end); span.textContent = atom.text.slice(start - atom.start, end - atom.start); if (mark) { span.style.setProperty("--tmw-color", typeColor(mark.kind)); span.dataset.decision = mark.decision; span.title = entityLabel(mark); span.tabIndex = 0; span.setAttribute("role", "button"); span.addEventListener("click", () => { if (doc.defaultView?.getSelection()?.isCollapsed !== false) onMark(mark); }); span.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onMark(mark); } }); } fragment.appendChild(span); }
    for (let i = low; i < highlights.length && highlights[i].start < atom.end; i++) { const h = highlights[i], start = Math.max(from, h.start), end = Math.min(atom.end, h.end); add(from, start); add(start, end, h.mark); from = end; } add(from, atom.end); atom.element.replaceChildren(fragment);
  }
}
type Props = { documentId: string; revision: number; marks: readonly Mark[]; api: <T>(path: string, method?: string, body?: unknown) => Promise<T>; disabled?: boolean; onSelect: (range: DocxSelection | null) => void; onMark?: (mark: Mark) => void; focusRange?: DocxSelection | null };
export function PaginatedDocxReview(props: Props) {
  const { documentId, revision, marks, api, disabled = false, onSelect, onMark, focusRange } = props, frame = useRef<HTMLIFrameElement>(null), atoms = useRef<Atom[]>([]), generation = useRef(0), latest = useRef(props); latest.current = props;
  const [loaded, setLoaded] = useState(0), [ready, setReady] = useState(false), [error, setError] = useState(""), [warnings, setWarnings] = useState<string[]>([]), [pages, setPages] = useState(0), [missing, setMissing] = useState(0), [zoom, setZoom] = useState(1), [retry, setRetry] = useState(0), [fallbackOpen, setFallbackOpen] = useState(false), [selectionNote, setSelectionNote] = useState("");
  useEffect(() => {
    const current = ++generation.current, controller = new AbortController(); atoms.current = []; setReady(false); setError(""); setWarnings([]); setPages(0); setSelectionNote(""); onSelect(null); const iframe = frame.current, doc = iframe?.contentDocument, container = doc?.getElementById("word"); if (!doc || !container || !loaded) return;
    container.replaceChildren();
    const selected = () => { if (latest.current.disabled || current !== generation.current) return; const selected = previewSelection(container, doc.defaultView?.getSelection() ?? null); latest.current.onSelect(selected); setSelectionNote(selected ? "已选中原文，可加入人工标记。" : doc.defaultView?.getSelection()?.isCollapsed === false ? "此区域尚未关联规范原文或跨段落，请在结构化原文中标记。" : ""); };
    doc.addEventListener("mouseup", selected); doc.addEventListener("keyup", selected); const prevent = (event: Event) => { if ((event.target as Element)?.closest?.("a,form")) event.preventDefault(); }; doc.addEventListener("click", prevent, true); doc.addEventListener("submit", prevent, true);
    void (async () => {
      try {
        const payload = await processingRead(() => api<DocxPreviewPackage>(`/documents/${documentId}/docx-preview?revision=${revision}`), controller.signal); if (current !== generation.current) return; if (payload.documentId !== documentId || payload.revision !== revision || payload.version !== 1) throw new Error("预览版本与当前材料不一致，请刷新。");
        const decoded = atob(payload.archiveBase64), bytes = Uint8Array.from(decoded, c => c.charCodeAt(0)), digest = await crypto.subtle.digest("SHA-256", bytes), hex = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join(""); if (hex !== payload.packageHash) throw new Error("预览文件校验失败。"); const renderer = await import("docx-preview"); if (current !== generation.current) return; const staged = doc.createElement("div");
        await renderer.renderAsync(bytes, staged, staged, { className: "docx", inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, renderComments: true, renderChanges: true, renderAltChunks: false, experimental: true, trimXmlDeclaration: true, useBase64URL: true, debug: false });
        await renderDocxVml(staged,payload.vml??[],payload.vmlImages??{});
        if (current !== generation.current) return; container.replaceChildren(staged);
        for (const link of Array.from(container.querySelectorAll("a"))) { link.removeAttribute("href"); link.removeAttribute("target"); }
        const result = bindPreviewRuns(container, payload.runs); atoms.current = result.atoms; paint(result.atoms, latest.current.marks, mark => { if (!latest.current.disabled) latest.current.onMark?.(mark); }); setMissing(result.missing); setWarnings(payload.warnings); setPages(container.querySelectorAll("section.docx").length); setReady(true);
      } catch (e) { if (current === generation.current) { container.replaceChildren(); setError((e as Error).message); } }
    })();
    return () => { generation.current++; controller.abort(); doc.removeEventListener("mouseup", selected); doc.removeEventListener("keyup", selected); doc.removeEventListener("click", prevent, true); doc.removeEventListener("submit", prevent, true); container.replaceChildren(); };
  }, [documentId, revision, loaded, retry]);
  useEffect(() => { paint(atoms.current, marks, mark => { if (!latest.current.disabled) latest.current.onMark?.(mark); }); }, [marks]);
  useEffect(() => { if (!ready || !focusRange) return; const atom = atoms.current.find(a => a.start <= focusRange.start && a.end > focusRange.start); atom?.element.scrollIntoView({ block: "center", behavior: "smooth" }); setSelectionNote(atom ? "已定位对应原文。" : "此标记未关联分页预览，请在结构化原文或图片审查区查看。"); }, [focusRange?.start, focusRange?.end, ready]);
  useEffect(() => { const root = frame.current?.contentDocument?.getElementById("word"); if (root) root.style.zoom = String(zoom); }, [zoom, ready]);
  return <section className="docx-review" aria-label="Word 分页版式审查"><div className="docx-controls"><strong>Word 分页版式</strong><label>缩放 <select aria-label="Word 分页预览缩放" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[.6,.8,1,1.2,1.5].map(n => <option key={n} value={n}>{Math.round(n*100)}%</option>)}</select></label><span>{ready ? `${pages} 个预览页 · 只读原件` : "只读原件"}</span></div><p className="muted">按原件中的分页符、节、页眉页脚和样式展示；自动分页与缺少的字体需在 Word 原件核对。导出使用原始文件。</p>{error && <p role="alert">{error} <button className="secondary" type="button" onClick={() => setRetry(v => v + 1)}>重试分页预览</button></p>}{!ready && !error && <p role="status">正在准备 Word 分页预览…</p>}<iframe ref={frame} srcDoc={frameHtml} sandbox="allow-same-origin" referrerPolicy="no-referrer" title="Word 离线分页预览" className="docx-preview-frame" onLoad={() => setLoaded(v => v + 1)} />{selectionNote && <p role="status">{selectionNote}</p>}{ready && <details className="docx-warnings"><summary>版式及其他对象说明</summary>{missing > 0 && <p>有 {missing} 个文本片段未关联规范原文，请在结构化原文中逐项复核。</p>}{warnings.map(w => <p key={w}>{w}</p>)}</details>}<details onToggle={e => setFallbackOpen(e.currentTarget.open)}><summary>结构化原文与其他对象</summary>{fallbackOpen && (ready || error) ? <DocxReview {...props} /> : fallbackOpen ? <p role="status">分页预览准备完成后，将加载结构化原文…</p> : null}</details></section>;
}
