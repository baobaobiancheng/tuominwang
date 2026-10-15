import {decodeXlsxString,encodeXlsxText} from "./ooxml-string.ts";
import type { Document, Element, Node } from "@xmldom/xmldom";
import { posix } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Anchor, Coverage, Mark } from "../contracts/index.ts";
import {FILE_MAX_BYTES} from "../contracts/index.ts";
import { readZip, writeZip, xml, xmlBytes, elements } from "./office-zip.ts";
import { redact, validateMarks, replacementFor } from "./redaction.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R = "http://schemas.openxmlformats.org/package/2006/relationships";
const C = "http://schemas.openxmlformats.org/package/2006/content-types";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const OFFICE_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const officeImagePart = (name: string) => /^word\/media\/[^/]+\.(png|jpe?g|gif|bmp|tiff?)$/i.test(name);
export type OfficeImages = Record<string, { text: string; output: Buffer; outputText: string }>;
type Format = "docx" | "xlsx";
type Binding = { anchor: Anchor; value: string; set: (value: string, marks: Mark[]) => void };
type Loaded = { text: string; anchors: Anchor[]; coverage: Coverage[]; parts: Map<string, Buffer>; docs: Map<string, Document>; bindings: Binding[] };
const isPackage = (name: string) => name === "[Content_Types].xml" || name.endsWith(".rels");
const knownPart = (name: string, format: Format) => isPackage(name) || /^docProps\/(core|app|custom)\.xml$/.test(name) || (format === "docx"
  ? /^word\/(document|styles|stylesWithEffects|numbering|settings|webSettings|fontTable|footnotes|endnotes|comments|commentsExtended|people|header\d+|footer\d+)\.xml$/.test(name) || /^word\/theme\/theme\d+\.xml$/.test(name)
  : /^xl\/(workbook|styles|sharedStrings|calcChain)\.xml$/.test(name) || /^xl\/(worksheets\/sheet\d+|comments\d+|theme\/theme\d+)\.xml$/.test(name));
function childElements(element: Element, ns: string, local: string) {
  return Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1 && (node as Element).namespaceURI === ns && (node as Element).localName === local);
}
function remove(node: Node) { node.parentNode?.removeChild(node); }
function textOf(node: Element) { return elements(node, node.namespaceURI ?? "", "t").map(t => node.namespaceURI === S ? decodeXlsxString(t.textContent ?? "") : t.textContent ?? "").join(""); }

async function load(bytes: Buffer, format: Format, imageTexts?: Record<string, string>): Promise<Loaded> {
  const parts = await readZip(bytes), docs = new Map<string, Document>();
  const relationshipDocs = new Map<string, Document>();
  const coverage: Coverage[] = [{ id: "package", status: "complete", objects: [...parts.keys()].sort() }];
  const bindings: Binding[] = [], values: string[] = []; let offset = 0, canonicalBytes = 0;
  const add = (part: string, object: string, value: string, set: Binding["set"], cell?: { row: number; column: number }) => {
    const nextBytes=canonicalBytes+Buffer.byteLength(value,'utf8')+(bindings.length?1:0);
    if(nextBytes>FILE_MAX_BYTES)throw new Error("OFFICE_TEXT_LIMIT");
    canonicalBytes=nextBytes;
    const anchor: Anchor = { kind: "object", part, object, start: offset, end: offset + value.length, ...cell };
    bindings.push({ anchor, value, set }); values.push(value); offset += value.length + 1;
  };
  const block = (name: string, reason: string) => {
    const item = coverage.find(c => c.id === name);
    if (item) { item.status = "blocked"; item.reason = reason; }
  };
  for (const [name, content] of [...parts].sort(([a], [b]) => a.localeCompare(b))) {
    if (format === "docx" && officeImagePart(name) && imageTexts && Object.hasOwn(imageTexts, name)) {
      coverage.push({ id: name, status: "complete" }); continue;
    }
    coverage.push({ id: name, status: knownPart(name, format) ? "complete" : "blocked", reason: knownPart(name, format) ? undefined : "UNSUPPORTED_OFFICE_OBJECT" });
    if (!knownPart(name, format)) continue;
    const doc = xml(content); docs.set(name, doc);
    const pending: Node[] = [doc];
    while (pending.length) {
      const node = pending.pop()!;
      if (node.nodeType === 1) {
        const element = node as Element;
        if (["binData", "altChunk", "OLEObject", "object", "control", "subDoc", "extLst"].includes(element.localName ?? "")) block(name, "UNSUPPORTED_OFFICE_OBJECT");
        if (element.localName === "blip" || element.localName === "imagedata") {
          const vml=element.localName === "imagedata", officeId=element.getAttributeNS("urn:schemas-microsoft-com:office:office", "relid"), relationshipId=element.getAttributeNS(OFFICE_R,"id");
          const reference = vml ? relationshipId || officeId : element.getAttributeNS(OFFICE_R, "embed"), relName = posix.join(posix.dirname(name), "_rels", posix.basename(name) + ".rels");
          const rels = parts.get(relName);
          if (rels && !relationshipDocs.has(relName)) relationshipDocs.set(relName, xml(rels));
          const relation = rels && elements(relationshipDocs.get(relName)!, R, "Relationship").find(r => r.getAttribute("Id") === reference);
          const target = relation?.getAttribute("Target") ?? "";
          let resolved = ""; try { resolved = posix.normalize(posix.join(posix.dirname(name), decodeURIComponent(target))); } catch { /* rejected below */ }
          if (format !== "docx" || element.namespaceURI !== (vml ? "urn:schemas-microsoft-com:vml" : A) || !imageTexts || !reference || vml && (relationshipId && officeId && relationshipId!==officeId || element.getAttribute("src")) || element.getAttributeNS(OFFICE_R, "link") || Array.from(element.childNodes).some(n => n.nodeType === 1) || !relation || relation.getAttribute("TargetMode") === "External" || !(relation.getAttribute("Type") ?? "").endsWith("/image") || !officeImagePart(resolved) || !Object.hasOwn(imageTexts, resolved)) block(name, "UNSUPPORTED_OFFICE_OBJECT");
        }
        if (element.namespaceURI && !/^(http:\/\/(schemas\.(openxmlformats|microsoft)\.org|purl\.org)|urn:schemas-microsoft-com:)/.test(element.namespaceURI)) block(name, "UNSUPPORTED_OFFICE_OBJECT");
      }
      // XML comments and processing instructions never reach an output package.
      if (node.nodeType === 8 || node.nodeType === 7) { remove(node); continue; }
      for (const child of Array.from(node.childNodes)) pending.push(child);
    }
    if (format === "docx" && ["altChunk", "object", "control", "binData", "subDoc"].some(tag => elements(doc, W, tag).length)) block(name, "UNSUPPORTED_OFFICE_OBJECT");
  }
  const main = format === "docx" ? "word/document.xml" : "xl/workbook.xml";
  if (!docs.has("[Content_Types].xml") || !docs.has("_rels/.rels") || !docs.has(main)) throw new Error("INVALID_OFFICE");
  if (docs.get(main)!.documentElement?.namespaceURI !== (format === "docx" ? W : S) || docs.get(main)!.documentElement?.localName !== (format === "docx" ? "document" : "workbook")) throw new Error("INVALID_OFFICE");
  for (const item of elements(docs.get("[Content_Types].xml")!, C, "*")) if (/macroEnabled|vbaProject|activeX/i.test(item.getAttribute("ContentType") ?? "")) block("[Content_Types].xml", "UNSUPPORTED_OFFICE_OBJECT");
  // Resolve internal relationships without opening any URL or filesystem path.
  for (const [name, doc] of docs) if (name.endsWith(".rels")) {
    const base = name === "_rels/.rels" ? "" : posix.dirname(posix.dirname(name));
    for (const relation of elements(doc, R, "Relationship")) {
      const target = relation.getAttribute("Target") ?? "";
      if (relation.getAttribute("TargetMode") === "External") {
        if (!(relation.getAttribute("Type") ?? "").endsWith("/hyperlink")) block(name, "EXTERNAL_OFFICE_OBJECT");
      } else {
        let decoded: string; try { decoded = decodeURIComponent(target); } catch { throw new Error("INVALID_OFFICE"); }
        const resolved = posix.normalize(posix.join(base, decoded));
        if (!target || /[\\\x00-\x1f]/.test(decoded) || decoded.startsWith("/") || resolved.startsWith("../") || !parts.has(resolved)) throw new Error("INVALID_OFFICE");
      }
    }
  }

  const consumed = new Set<Node>();
  // Word runs can split a phone number at arbitrary formatting boundaries. Bind whole paragraphs.
  if (format === "docx") for (const [part, doc] of docs) {
    let index = 0;
    for (const p of elements(doc, W, "p")) {
      const leaves = [...elements(p, W, "t"), ...elements(p, W, "delText")].filter(t => {
        let parent = t.parentNode;
        while (parent && !(parent.nodeType === 1 && (parent as Element).namespaceURI === W && (parent as Element).localName === "p")) parent = parent.parentNode;
        return parent === p;
      });
      // DOM order, not tag-name order, matters for tracked insertions and deletions.
      const ordered: Element[] = [], walk: Node[] = [p], wanted = new Set(leaves);
      while (walk.length) { const node = walk.pop()!; if (wanted.has(node as Element)) ordered.push(node as Element); for (let c = node.lastChild; c; c = c.previousSibling) walk.push(c); }
      if (!ordered.length) continue;
      let position = 0;
      const segments = ordered.map(node => { const text = node.textContent ?? "", start = position; position += text.length; consumed.add(node); for (const child of Array.from(node.childNodes)) consumed.add(child); return { node, start, end: position, text }; });
      const paragraph = segments.map(s => s.text).join("");
      add(part, `paragraph:${++index}`, paragraph, (_value, marks) => {
        for (const segment of segments) {
          let result = "", at = segment.start;
          for (const mark of marks) {
            if (mark.end <= segment.start || mark.start >= segment.end) continue;
            const begin = Math.max(mark.start, segment.start), end = Math.min(mark.end, segment.end);
            result += segment.text.slice(at - segment.start, begin - segment.start);
            if (mark.start >= segment.start) result += replacementFor(paragraph, mark);
            at = end;
          }
          result += segment.text.slice(at - segment.start);
          segment.node.textContent = result;
          segment.node.setAttribute("xml:space", "preserve");
        }
      });
    }
  }
  // Materialize every worksheet cell, including hidden sheets, to independent literal values.
  if (format === "xlsx") {
    const strings = docs.get("xl/sharedStrings.xml");
    const shared = strings ? elements(strings, S, "si").map(textOf) : [];
    for (const [part, doc] of docs) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(part)) {
      let count = 0; const coordinates = new Set<string>();
      for (const cell of elements(doc, S, "c")) {
        if (++count > 20000) throw new Error("CELL_LIMIT");
        const reference = cell.getAttribute("r") ?? "", match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(reference);
        if (!match || coordinates.has(reference)) throw new Error("INVALID_OFFICE");
        coordinates.add(reference);
        const row = Number(match[2]), column = [...match[1]].reduce((v, c) => v * 26 + c.charCodeAt(0) - 64, 0);
        if (row > 1048576 || column > 16384) throw new Error("CELL_LIMIT");
        const type = cell.getAttribute("t"), cache = childElements(cell, S, "v")[0];
        if (childElements(cell, S, "f").length && !cache) block(part, "MISSING_FORMULA_CACHE");
        let value = type === "inlineStr" ? textOf(cell) : cache?.textContent ?? "";
        if (type === "str") value=decodeXlsxString(value);
        if (type === "s") {
          if (!/^\d+$/.test(value) || shared[Number(value)] === undefined) throw new Error("INVALID_OFFICE");
          value = shared[Number(value)];
        }
        const set = (output: string) => {
          for (const child of Array.from(cell.childNodes)) remove(child);
          if (output === value && ((!type || type === "n") && /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(value) || type === "b" && /^[01]$/.test(value))) {
            cell.setAttribute("t", type === "b" ? "b" : "n");
            const v = doc.createElementNS(S, "v"); v.textContent = output; cell.appendChild(v); return;
          }
          // A literal inline string never executes, even when it begins with =, +, - or @.
          cell.setAttribute("t", "inlineStr");
          const is = doc.createElementNS(S, "is"), t = doc.createElementNS(S, "t");
          t.setAttribute("xml:space", "preserve"); t.textContent = encodeXlsxText(output); is.appendChild(t); cell.appendChild(is);
        };
        add(part, `cell:${reference}`, value, set, { row, column });
        // Formula text is removed on export, never evaluated. Cache is the value being reviewed.
        const pending: Node[] = [cell]; while (pending.length) { const node = pending.pop()!; consumed.add(node); for (const child of Array.from(node.childNodes)) pending.push(child); }
      }
    }
  }
  // Inventory remaining visible/hidden text and attributes: authors, titles, sheet names,
  // comments, style strings, hyperlinks, revision metadata and header/footer control strings.
  for (const [part, doc] of docs) {
    if (isPackage(part) || (format === "xlsx" && ["xl/sharedStrings.xml", "xl/calcChain.xml"].includes(part))) continue;
    const pending: Node[] = [doc]; let index = 0;
    while (pending.length) {
      const node = pending.pop()!, ordinal = ++index;
      if (node.nodeType === 1) {
        const element = node as Element;
        for (const attr of Array.from(element.attributes)) {
          if (attr.name === "xmlns" || attr.prefix === "xmlns") continue;
          if (consumed.has(node) && ["r", "s", "t"].includes(attr.name)) continue;
          const value = attr.value;
          add(part, `attribute:${ordinal}:${attr.name}`, value, output => { attr.value = output; attr.nodeValue = output; });
        }
      }
      if ((node.nodeType === 3 || node.nodeType === 4) && !consumed.has(node) && (node.nodeValue ?? "").trim()) add(part, `text:${ordinal}`, node.nodeValue ?? "", output => { node.nodeValue = output; });
      for (let child = node.lastChild; child; child = child.previousSibling) pending.push(child);
    }
  }
  if (format === "docx" && imageTexts) for (const name of Object.keys(imageTexts).sort()) {
    if (!officeImagePart(name) || !parts.has(name)) throw new Error("SOURCE_MISMATCH");
    // Pixel replacements are performed by the caller against the authenticated OCR/preview map.
    add(name, "image-text", imageTexts[name], () => {});
  }
  if (!bindings.length) throw new Error("EMPTY_DOCUMENT");
  return { text: values.join("\n"), anchors: bindings.map(b => b.anchor), coverage, parts, docs, bindings };
}

export async function parseOffice(bytes: Buffer, format: Format, imageTexts?: Record<string, string>) {
  const { text, anchors, coverage } = await load(bytes, format, imageTexts);
  return { text, anchors, coverage };
}
export function validateOfficeMarks(text: string, marks: Mark[], anchors: Anchor[], final = false) {
  validateMarks(text, marks, final);
  for (const mark of marks) {
    let lo = 0, hi = anchors.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (anchors[mid].start <= mark.start) lo = mid + 1; else hi = mid; }
    if (!anchors[lo - 1] || anchors[lo - 1].end < mark.end) throw new Error("CROSS_OBJECT_MARK");
  }
}
export async function exportOffice(bytes: Buffer, format: Format, text: string, anchors: Anchor[], coverage: Coverage[], marks: Mark[], images?: OfficeImages) {
  const loaded = await load(bytes, format, images && Object.fromEntries(Object.entries(images).map(([part, image]) => [part, image.text])));
  // PostgreSQL JSONB canonicalizes object-key order and drops undefined optional properties.
  const equal = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  if (loaded.text !== text || !equal(loaded.anchors, anchors) || !equal(loaded.coverage, coverage)) throw new Error("SOURCE_MISMATCH");
  if (coverage.some(c => c.status !== "complete")) throw new Error("COVERAGE_INCOMPLETE");
  validateOfficeMarks(text, marks, anchors, true);
  const selected = marks.filter(m => m.decision === "redact").sort((a, b) => a.start - b.start);
  let next = 0;
  for (const binding of loaded.bindings) {
    const local: Mark[] = [];
    while (next < selected.length && selected[next].start < binding.anchor.end) { const m = selected[next++]; local.push({ ...m, start: m.start - binding.anchor.start, end: m.end - binding.anchor.start }); }
    binding.set(redact(binding.value, local), local);
  }
  const removed = new Set<string>();
  const renamed = new Map<string, string>(), outputImageTexts: Record<string, string> = {};
  if (images) {
    if (format !== "docx") throw new Error("INVALID_OFFICE");
    Object.keys(images).sort().forEach((part, i) => { renamed.set(part, `word/media/redacted-${i + 1}.png`); loaded.parts.delete(part); });
    for (const [part, target] of renamed) { loaded.parts.set(target, images[part].output); outputImageTexts[target] = images[part].outputText; }
  }
  if (format === "xlsx") { removed.add("xl/sharedStrings.xml"); removed.add("xl/calcChain.xml"); }
  for (const [name, doc] of loaded.docs) {
    if (removed.has(name)) { loaded.parts.delete(name); continue; }
    if (name.endsWith(".rels")) for (const relation of elements(doc, R, "Relationship")) {
      const type = relation.getAttribute("Type") ?? "";
      if (relation.getAttribute("TargetMode") === "External" || (format === "xlsx" && /\/(sharedStrings|calcChain)$/.test(type))) remove(relation);
      else if (renamed.size) {
        const base = name === "_rels/.rels" ? "" : posix.dirname(posix.dirname(name)), resolved = posix.normalize(posix.join(base, decodeURIComponent(relation.getAttribute("Target") ?? ""))), target = renamed.get(resolved);
        if (target) relation.setAttribute("Target", posix.relative(base, target));
      }
    }
    if (name === "[Content_Types].xml") for (const override of elements(doc, C, "Override")) if (removed.has((override.getAttribute("PartName") ?? "").replace(/^\//, ""))) remove(override);
    if (name === "[Content_Types].xml" && renamed.size) {
      for (const override of elements(doc, C, "Override")) if (renamed.has((override.getAttribute("PartName") ?? "").replace(/^\//, ""))) remove(override);
      for (const target of renamed.values()) { const override = doc.createElementNS(C, "Override"); override.setAttribute("PartName", "/" + target); override.setAttribute("ContentType", "image/png"); doc.documentElement!.appendChild(override); }
    }
    if (format === "docx") {
      // Field instructions can execute external links or revive old results when Word updates fields.
      for (const tag of ["instrText", "fldChar"]) for (const node of elements(doc, W, tag)) remove(node);
      for (const node of [...elements(doc, W, "hyperlink"), ...elements(doc, W, "fldSimple")]) {
        while (node.firstChild) node.parentNode?.insertBefore(node.firstChild, node);
        remove(node);
      }
    } else {
      for (const tag of ["definedNames", "hyperlinks", "calcPr", "dataValidations", "conditionalFormatting"]) for (const node of elements(doc, S, tag)) remove(node);
    }
    loaded.parts.set(name, xmlBytes(doc));
  }
  const output = await writeZip(loaded.parts);
  await verifyOffice(bytes, format, output, text, marks, images ? outputImageTexts : undefined);
  return output;
}
export async function verifyOffice(_source: Buffer, format: Format, output: Buffer, text: string, marks: Mark[], imageTexts?: Record<string, string>) {
  const checked = await load(output, format, imageTexts);
  if (checked.coverage.some(c => c.status !== "complete")) throw new Error("COVERAGE_INCOMPLETE");
  const hidden = new Set(marks.filter(m => m.decision === "redact").map(m => text.slice(m.start, m.end)));
  for (const value of hidden) {
    if (checked.text.includes(value)) throw new Error("RESIDUE_FOUND");
    for (const [name, doc] of checked.docs) {
      if (name.includes(value) || (doc.textContent ?? "").includes(value)) throw new Error("RESIDUE_FOUND");
      for (const node of elements(doc, "*", "*")) if (Array.from(node.attributes).some(a => a.value.includes(value))) throw new Error("RESIDUE_FOUND");
    }
  }
}
