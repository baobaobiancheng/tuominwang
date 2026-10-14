import type { Element, Node, Document } from "@xmldom/xmldom";
import { posix } from "node:path";
import { readZip, xml, elements } from "./office-zip.ts";
import type { Anchor, ParsedPage } from "../contracts/index.ts";
import type { DocxLayout, DocxBlock, DocxParagraph, DocxTextStyle, DocxParagraphStyle, DocxRun } from "../contracts/docx-layout.ts";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const children = (node: Node): Element[] => Array.from(node.childNodes).filter((n): n is Element => n.nodeType === 1);
const child = (node: Node | undefined, name: string) => node && children(node).find(n => n.namespaceURI === W && n.localName === name);
const attr = (node: Element | undefined, key = "val") => node?.getAttributeNS(W, key) ?? undefined;
const number = (value: string | undefined, scale = 1, min = 0, max = 2000) => { if (value === undefined || value === "" || !Number.isFinite(Number(value))) return undefined; return Math.max(min, Math.min(max, Number(value) / scale)); };
const flag = (node: Element | undefined) => node ? !["0", "false", "off", "none"].includes(attr(node) ?? "") : undefined;
function runStyle(node?: Element): DocxTextStyle {
  if (!node) return {};
  const style: DocxTextStyle = {}, set = (key: keyof DocxTextStyle, value: unknown) => { if (value !== undefined) (style as any)[key] = value; };
  set("bold", flag(child(node, "b"))); set("italic", flag(child(node, "i"))); set("underline", flag(child(node, "u"))); set("strike", flag(child(node, "strike")));
  set("size", number(attr(child(node, "sz")), 2, 1, 300));
  const font = attr(child(node, "rFonts"), "eastAsia") || attr(child(node, "rFonts"), "ascii");
  if (font && font.length <= 100 && /^[\p{L}\p{N} _-]+$/u.test(font)) style.font = font;
  const color = attr(child(node, "color")), fill = attr(child(node, "shd"), "fill");
  if (color && /^[a-f\d]{6}$/i.test(color)) style.color = "#" + color;
  if (fill && /^[a-f\d]{6}$/i.test(fill)) style.background = "#" + fill;
  const vertical = attr(child(node, "vertAlign")); if (vertical === "superscript" || vertical === "subscript") style.vertical = vertical === "superscript" ? "super" : "sub";
  return style;
}
function paragraphStyle(node?: Element): DocxParagraphStyle {
  if (!node) return {};
  const style: DocxParagraphStyle = {}, jc = attr(child(node, "jc"));
  if (["left", "right", "center", "both", "justify"].includes(jc ?? "")) style.align = jc === "both" ? "justify" : jc as DocxParagraphStyle["align"];
  const spacing = child(node, "spacing"), ind = child(node, "ind");
  for (const [key, v] of Object.entries({ before: number(attr(spacing, "before"), 20), after: number(attr(spacing, "after"), 20), left: number(attr(ind, "left"), 20), right: number(attr(ind, "right"), 20), indent: attr(ind, "hanging") ? -(number(attr(ind, "hanging"), 20, 0, 2000) ?? 0) : number(attr(ind, "firstLine"), 20), line: attr(spacing, "lineRule") === "auto" || !attr(spacing, "lineRule") ? number(attr(spacing, "line"), 240, .5, 10) : undefined, breakBefore: flag(child(node, "pageBreakBefore")) })) if (v !== undefined && (typeof v !== "number" || Number.isFinite(v))) (style as any)[key] = v;
  return style;
}
/** Read-only layout projection; never renders relationship URLs or modifies the source ZIP. */
export async function buildDocxLayout(bytes: Buffer, text: string, anchors: Anchor[], pages: Pick<ParsedPage, "index" | "part">[] = []): Promise<DocxLayout> {
  if (text.length > 2_000_000 || anchors.length > 20000) throw new Error("DOCX_LAYOUT_LIMIT");
  const parts = await readZip(bytes), mainBytes = parts.get("word/document.xml"); if (!mainBytes) throw new Error("INVALID_OFFICE");
  const documents = new Map<string, Document>(), styles = new Map<string, Element>(), warnings = new Set<string>();
  const parse = (part: string) => { if (!documents.has(part)) documents.set(part, xml(parts.get(part)!)); return documents.get(part)!; };
  const main = parse("word/document.xml"); if (main.documentElement?.namespaceURI !== W) throw new Error("INVALID_OFFICE");
  let defaultRun: DocxTextStyle = {}, defaultParagraph: DocxParagraphStyle = {};
  if (parts.has("word/styles.xml")) {
    const doc = parse("word/styles.xml"); for (const s of elements(doc, W, "style")) { const id = attr(s, "styleId"); if (id) styles.set(id, s); }
    const defs = elements(doc, W, "docDefaults")[0]; defaultRun = runStyle(child(child(defs, "rPrDefault"), "rPr")); defaultParagraph = paragraphStyle(child(child(defs, "pPrDefault"), "pPr"));
  }
  function inherited(id: string | undefined, type: "run" | "paragraph", seen = new Set<string>()): any {
    if (!id) return {}; if (seen.has(id) || seen.size >= 32) { warnings.add("样式继承过深或存在循环，已使用可读取的样式。"); return {}; }
    seen.add(id); const s = styles.get(id); if (!s) return {};
    return { ...inherited(attr(child(s, "basedOn")), type, seen), ...(type === "run" ? runStyle(child(s, "rPr")) : paragraphStyle(child(s, "pPr"))) };
  }
  const anchorMap = new Map(anchors.filter(a => a.part && a.object?.startsWith("paragraph:")).map(a => [a.part + "\0" + a.object, a]));
  const paragraphMap = new Map<Element, DocxParagraph>(), rendered = new Set<Element>(); let nodeBudget = 0;
  function budget() { if (++nodeBudget > 50000) throw new Error("DOCX_LAYOUT_LIMIT"); }
  function imageRun(node: Element, part: string): DocxRun | undefined {
    const ref = node.getAttributeNS(R, "embed"); if (!ref || node.getAttributeNS(R, "link")) { warnings.add("外链图片未加载；请在对象原文中复核。"); return; }
    const relPart = posix.join(posix.dirname(part), "_rels", posix.basename(part) + ".rels"); if (!parts.has(relPart)) return;
    const rel = elements(parse(relPart), "http://schemas.openxmlformats.org/package/2006/relationships", "Relationship").find(r => r.getAttribute("Id") === ref);
    if (!rel || rel.getAttribute("TargetMode") === "External" || !(rel.getAttribute("Type") ?? "").endsWith("/image")) return;
    let imagePart: string; try { imagePart = posix.normalize(posix.join(posix.dirname(part), decodeURIComponent(rel.getAttribute("Target") ?? ""))); } catch { return; }
    const page = pages.find(p => p.part === imagePart); if (!page || !/^word\/media\/[^/]+\.(png|jpe?g|gif|bmp|tiff?)$/i.test(imagePart)) { warnings.add("有图片尚未生成可审查预览，请查看图片审查区。"); return; }
    let parent: Node | null = node; while (parent && !(parent.nodeType === 1 && (parent as Element).localName === "drawing")) parent = parent.parentNode;
    const extent = parent && elements(parent as Element, "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "extent")[0];
    return { kind: "image", page: page.index, width: number(extent?.getAttribute("cx") ?? undefined, 12700), height: number(extent?.getAttribute("cy") ?? undefined, 12700) };
  }
  function indexPart(part: string) {
    const doc = parse(part); let index = 0;
    for (const p of elements(doc, W, "p")) {
      budget(); const nodes: Element[] = [], visit = (n: Element) => { for (const c of children(n)) { if (c.namespaceURI === W && c.localName === "p") continue; nodes.push(c); visit(c); } }; visit(p);
      const leaves = nodes.filter(n => n.namespaceURI === W && ["t", "delText"].includes(n.localName ?? ""));
      const object = leaves.length ? `paragraph:${++index}` : undefined, anchor = object ? anchorMap.get(part + "\0" + object) : undefined;
      const value = leaves.map(l => l.textContent ?? "").join("");
      if (object && (!anchor || anchor.end - anchor.start !== value.length || text.slice(anchor.start, anchor.end) !== value)) throw new Error("SOURCE_MISMATCH");
      const pp = child(p, "pPr"), styleId = attr(child(pp, "pStyle")), baseRun = { ...defaultRun, ...inherited(styleId, "run"), ...runStyle(child(pp, "rPr")) };
      let offset = anchor?.start ?? 0; const runs: DocxRun[] = [];
      for (const n of nodes) {
        budget();
        if (n.namespaceURI === W && ["t", "delText"].includes(n.localName ?? "")) {
          let r: Node | null = n.parentNode; while (r && r !== p && !(r.nodeType === 1 && (r as Element).namespaceURI === W && (r as Element).localName === "r")) r = r.parentNode;
          const rp = r && r !== p ? child(r, "rPr") : undefined, content = n.textContent ?? "";
          runs.push({ kind: "text", text: content, start: offset, end: offset + content.length, style: { ...baseRun, ...inherited(attr(child(rp, "rStyle")), "run"), ...runStyle(rp), ...(n.localName === "delText" ? { deleted: true } : {}) } }); offset += content.length;
        } else if (n.namespaceURI === W && ["br", "cr", "tab"].includes(n.localName ?? "")) {
          if (n.localName === "tab") runs.push({ kind: "tab" });
          else { const page = attr(n, "type") === "page"; runs.push({ kind: "break", ...(page ? { page: true } : {}) }); if (page) warnings.add("显式分页符已标出；屏幕预览为连续文档，不等同 Word 实际页码。"); }
        }
        else if (n.namespaceURI === A && n.localName === "blip") { const image = imageRun(n, part); if (image) runs.push(image); }
      }
      if (child(pp, "numPr")) warnings.add("列表编号采用段落布局展示，自动编号和复杂列表可能与 Word 不同。");
      if (nodes.some(n => ["anchor", "txbxContent", "imagedata", "object", "sym"].includes(n.localName ?? ""))) warnings.add("浮动对象、文本框或特殊符号采用简化布局；请同时检查对象原文与图片。");
      paragraphMap.set(p, { kind: "paragraph", id: `${part}:${object ?? "empty:" + nodeBudget}`, part, start: anchor?.start, end: anchor?.end, style: { ...defaultParagraph, ...inherited(styleId, "paragraph"), ...paragraphStyle(pp) }, runs });
    }
  }
  const bodyParts = [...parts.keys()].filter(p => /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/.test(p));
  for (const part of bodyParts) indexPart(part);
  function blocks(container: Node, depth = 0): DocxBlock[] {
    if (depth > 64) throw new Error("DOCX_LAYOUT_LIMIT"); const result: DocxBlock[] = [];
    for (const n of children(container)) {
      if (n.namespaceURI === W && n.localName === "p") { const p = paragraphMap.get(n); if (p) { result.push(p); rendered.add(n); } }
      else if (n.namespaceURI === W && n.localName === "tbl") {
        const rows = children(n).filter(r => r.namespaceURI === W && r.localName === "tr").map(row => ({ cells: children(row).filter(c => c.namespaceURI === W && c.localName === "tc").map(c => {
          const props = child(c, "tcPr"), merge = child(props, "vMerge");
          return { span: Math.floor(number(attr(child(props, "gridSpan")), 1, 1, 100) ?? 1), ...(merge ? { merge: attr(merge) === "restart" ? "restart" as const : "continue" as const } : {}), blocks: blocks(c, depth + 1) };
        }) }));
        result.push({ kind: "table", widths: children(child(n, "tblGrid") ?? n).filter(c => c.localName === "gridCol").map(c => number(attr(c, "w"), 20) ?? 0), rows });
        if (rows.some(r => r.cells.some(c => c.merge))) warnings.add("表格纵向合并在预览中标出，行高可能与 Word 不同。");
      } else if (!(n.namespaceURI === W && ["pPr", "rPr", "sectPr", "tblPr", "tcPr"].includes(n.localName ?? ""))) result.push(...blocks(n, depth + 1));
    }
    return result;
  }
  const body = elements(main, W, "body")[0]; if (!body) throw new Error("INVALID_OFFICE");
  const mainBlocks = blocks(body), supplements: DocxLayout["supplements"] = [];
  for (const part of bodyParts.filter(p => p !== "word/document.xml")) { const doc = parse(part); const list = blocks(doc.documentElement!); if (list.length) supplements.push({ part, label: /header/.test(part) ? "页眉" : /footer/.test(part) ? "页脚" : /footnotes/.test(part) ? "脚注" : /endnotes/.test(part) ? "尾注" : "批注", blocks: list }); }
  const unplaced = [...paragraphMap].filter(([p]) => !rendered.has(p)).map(([,p]) => p); if (unplaced.length) supplements.push({ part: "other-paragraphs", label: "文本框及其他段落", blocks: unplaced });
  const sects = elements(main, W, "sectPr"), sect = sects.at(-1), size = child(sect, "pgSz"), margins = child(sect, "pgMar");
  if (sects.length > 1) warnings.add("多节文档采用最后一节纸张设置，分节分页需与 Word 原件对照。");
  const page = { width: number(attr(size, "w"), 20, 72, 2000) ?? 595.3, height: number(attr(size, "h"), 20, 72, 2000) ?? 841.9, top: number(attr(margins, "top"), 20, 0, 300) ?? 72, right: number(attr(margins, "right"), 20, 0, 300) ?? 72, bottom: number(attr(margins, "bottom"), 20, 0, 300) ?? 72, left: number(attr(margins, "left"), 20, 0, 300) ?? 72 };
  if (page.left + page.right >= page.width || page.top + page.bottom >= page.height) throw new Error("INVALID_OFFICE");
  return { version: 1, page, blocks: mainBlocks, supplements, warnings: [...warnings], mappedParagraphs: [...paragraphMap.values()].filter(p => p.start !== undefined).length, otherObjectCount: anchors.filter(a => !a.object?.startsWith("paragraph:")).length };
}
