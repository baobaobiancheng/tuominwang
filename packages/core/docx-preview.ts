import { extractVmlPreview } from "./docx-vml-preview.ts";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { Element, Node } from "@xmldom/xmldom";
import { normalizeOfficeMedia } from "./office-media.ts";
import { readZip, writeZip, xml, xmlBytes, elements } from "./office-zip.ts";
import { buildDocxLayout } from "./docx-layout.ts";
import { FILE_MAX_BYTES } from "../contracts/index.ts";
import type { Anchor } from "../contracts/index.ts";
import type { DocxPreviewRun, DocxVmlPreview } from "../contracts/docx-preview.ts";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", REL = "http://schemas.openxmlformats.org/package/2006/relationships", CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const childElements = (n: Node) => Array.from(n.childNodes).filter((c): c is Element => c.nodeType === 1);
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const stories = (name: string) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/u.test(name);
const family = /^[\p{L}\p{N} _-]{1,100}$/u;
const XML_REL_TYPES = new Set(["officeDocument", "styles", "numbering", "settings", "theme", "fontTable", "header", "footer", "footnotes", "endnotes", "comments"]);
function targetPart(owner: string, target: string) {
  let decoded: string; try { decoded = decodeURIComponent(target); } catch { throw new Error("DOCX_PREVIEW_RELATIONSHIP_INVALID"); }
  if (!decoded || /^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(decoded) || decoded.startsWith("//") || /[\\\x00-\x1f]/u.test(decoded) || decoded.includes("?") || decoded.includes("#")) throw new Error("DOCX_PREVIEW_RELATIONSHIP_INVALID");
  const result = posix.normalize(decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(owner), decoded));
  if (!result.startsWith("word/") || result.split("/").some(p => !p || p === ".." || p === ".")) throw new Error("DOCX_PREVIEW_RELATIONSHIP_INVALID"); return result;
}
function safeFont(source: Buffer, key?: string): Buffer | null {
  const bytes = Buffer.from(source);
  if (key) { if (!/^\{?[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\}?$/iu.test(key) || bytes.length < 32) return null; const hex = key.replace(/[{}-]/g, ""), mask = Buffer.from(hex, "hex").reverse(); for (let i = 0; i < 32; i++) bytes[i] ^= mask[i % 16]; }
  if (bytes.length < 12 || !(bytes.readUInt32BE(0) === 0x00010000 || bytes.subarray(0, 4).toString() === "OTTO")) return null;
  const count = bytes.readUInt16BE(4); if (!count || count > 256 || 12 + count * 16 > bytes.length) return null;
  for (let i = 0; i < count; i++) { const at = 12 + i * 16, offset = bytes.readUInt32BE(at + 8), length = bytes.readUInt32BE(at + 12); if (offset < 12 + count * 16 || offset + length > bytes.length) return null; } return bytes;
}
/** A separate offline view package. Original bytes are never rewritten or served as HTML. */
export async function prepareDocxPreview(source: Buffer, text: string, anchors: Anchor[], imagePreviews = new Map<string, Buffer>()) {
  // Reuse the exact canonical paragraph/object validation before adding run bookmarks.
  await buildDocxLayout(source, text, anchors);
  const original = await readZip(source), output = new Map<string, Buffer>(), warnings = new Set<string>(), documents = new Map<string, ReturnType<typeof xml>>(), runs: DocxPreviewRun[] = [], relationships = new Map<string, Map<string, { type: string; target: string }>>();
  const allowedXml = new Set([...original.keys()].filter(name => stories(name) || /^word\/(styles|numbering|settings|fontTable)\.xml$/u.test(name) || /^word\/theme\/theme\d+\.xml$/u.test(name)));
  for (const name of allowedXml) documents.set(name, xml(original.get(name)!));
  if (!documents.has("word/document.xml")) throw new Error("INVALID_OFFICE");
  const imageTargets = new Map<string, string>(), fontTargets = new Map<string, string>(), originalFontTargets = new Map<string, string>(); let embeddedFonts = 0;
  async function image(name: string) {
    if (imageTargets.has(name)) return imageTargets.get(name)!;
    const bytes = imagePreviews.get(name) ?? original.get(name); if (!bytes) return null;
    try { const media = await normalizeOfficeMedia(bytes); if (media.frames.length > 1 || imagePreviews.has(name) && (await normalizeOfficeMedia(original.get(name)!)).frames.length > 1) warnings.add("多帧图片全部展开为连续复核图；其高度可能与 Word 首帧显示版式不同。"); const target = `word/media/tmw-preview-${imageTargets.size}.png`; output.set(target, media.png); imageTargets.set(name, target); return target; } catch { warnings.add("无法离线安全解码的图片（含 SVG／矢量图）未载入；请查看对象原文与原件。"); return null; }
  }
  // Build fresh relationships: no External, URI targets, HTML chunks, embedded OLE or macros.
  for (const [name, bytes] of original) if (name === "_rels/.rels" || /^word\/(?:[^/]+\/)*_rels\/[^/]+\.rels$/u.test(name)) {
    const owner = name === "_rels/.rels" ? "" : posix.join(posix.dirname(posix.dirname(name)), posix.basename(name).slice(0, -5)); if (owner && !allowedXml.has(owner)) continue;
    const doc = xml(bytes), valid = new Map<string, { type: string; target: string }>();
    for (const rel of elements(doc, REL, "Relationship")) {
      const id = rel.getAttribute("Id"), type = rel.getAttribute("Type")?.split("/").at(-1) ?? "", raw = rel.getAttribute("Target") ?? ""; let target: string | null = null;
      try { if (!id || valid.has(id) || rel.getAttribute("TargetMode") === "External") throw new Error(); target = targetPart(owner, raw); }
      catch { warnings.add("外链／无效关系未载入，预览不会访问外部网络。"); rel.parentNode?.removeChild(rel); continue; }
      if (type === "image") target = await image(target);
      else if (type === "font") { /* Rewritten after verified font references below. */ }
      else if (!XML_REL_TYPES.has(type) || !allowedXml.has(target)) target = null;
      if (!target) { if (["aFChunk", "oleObject", "package"].includes(type)) warnings.add("嵌入 HTML／Office 对象不执行；请在对象原文与原件中复核。"); rel.parentNode?.removeChild(rel); continue; }
      valid.set(id!, { type, target }); rel.setAttribute("Target", owner ? posix.relative(posix.dirname(owner), target) : target); rel.removeAttribute("TargetMode");
    }
    relationships.set(owner, valid); documents.set(name, doc);
  }
  // Internal document fonts may be read only from this validated package; no font URL/OS installation.
  const fontTable = documents.get("word/fontTable.xml"), fontRels = relationships.get("word/fontTable.xml");
  if (fontTable) for (const font of elements(fontTable, W, "font")) {
    const name = font.getAttributeNS(W, "name") ?? ""; if (!family.test(name)) { warnings.add("无效字体名已移除；该字体采用本地回退。"); font.parentNode?.removeChild(font); continue; }
    for (const embed of childElements(font).filter(e => /^embed(?:Regular|Bold|Italic|BoldItalic)$/u.test(e.localName ?? ""))) {
      const id = embed.getAttributeNS(R, "id") ?? "", rel = fontRels?.get(id), originalTarget = rel ? originalFontTargets.get(rel.target) ?? rel.target : "", data = rel?.type === "font" ? original.get(originalTarget) : undefined, safe = data ? safeFont(data, embed.getAttributeNS(W, "fontKey") ?? undefined) : null;
      if (!safe || !rel) { embed.parentNode?.removeChild(embed); fontRels?.delete(id); warnings.add("内嵌字体格式无效或缺失；预览使用本地字体，分页需在 Word 核对。"); continue; }
      const target = fontTargets.get(originalTarget) ?? `word/fonts/tmw-preview-${fontTargets.size}.odttf`; if (!fontTargets.has(originalTarget)) { fontTargets.set(originalTarget, target); originalFontTargets.set(target, originalTarget); output.set(target, safe); embeddedFonts++; } rel.target = target; embed.setAttributeNS(W, "w:fontKey", "{00000000-0000-0000-0000-000000000000}");
    }
  }
  for (const [owner, rels] of relationships) {
    const name = owner ? posix.join(posix.dirname(owner), "_rels", posix.basename(owner) + ".rels") : "_rels/.rels", doc = documents.get(name)!;
    for (const rel of elements(doc, REL, "Relationship")) { const info = rels.get(rel.getAttribute("Id") ?? ""); if (!info || info.type === "font" && !output.has(info.target)) rel.parentNode?.removeChild(rel); else rel.setAttribute("Target", owner ? posix.relative(posix.dirname(owner), info.target) : info.target); }
  }
  const anchorMap = new Map(anchors.filter(a => a.part && a.object?.startsWith("paragraph:")).map(a => [a.part + "\0" + a.object, a]));
  for (const [part, doc] of documents) if (allowedXml.has(part)) {
    const rels = relationships.get(part);
    for (const node of elements(doc, "*", "*")) {
      for (const attr of Array.from(node.attributes)) if (/^(src|href)$/iu.test(attr.localName ?? "")) node.removeAttributeNode(attr);
      if (node.namespaceURI === W && ["bookmarkStart", "bookmarkEnd", "altChunk", "object"].includes(node.localName ?? "")) { node.parentNode?.removeChild(node); continue; }
      if (node.namespaceURI === W && node.localName === "hyperlink" && node.parentNode) { const parent = node.parentNode; for (const child of Array.from(node.childNodes)) parent.insertBefore(child, node); parent.removeChild(node); continue; }
      for (const attr of Array.from(node.attributes)) if (attr.namespaceURI === R && !rels?.has(attr.value)) node.removeAttributeNode(attr);
      if (node.namespaceURI === W && node.localName === "rFonts") for (const attr of Array.from(node.attributes)) if (["ascii", "hAnsi", "eastAsia", "cs"].includes(attr.localName ?? "") && !family.test(attr.value)) node.removeAttributeNode(attr);
    }
    if (!stories(part)) continue;
    let paragraph = 0;
    for (const p of elements(doc, W, "p")) {
      const descendants: Element[] = [], visit = (n: Element) => { for (const c of childElements(n)) { if (c.namespaceURI === W && c.localName === "p") continue; descendants.push(c); visit(c); } }; visit(p);
      const textNodes = descendants.filter(n => n.namespaceURI === W && ["t", "delText"].includes(n.localName ?? "")); if (!textNodes.length) continue; const key = `paragraph:${++paragraph}`, anchor = anchorMap.get(part + "\0" + key); if (!anchor) throw new Error("SOURCE_MISMATCH"); let offset = anchor.start;
      for (const run of descendants.filter(n => n.namespaceURI === W && n.localName === "r")) {
        const value = descendants.filter(n => n.namespaceURI === W && ["t", "delText"].includes(n.localName ?? "") && n.parentNode === run).map(n => n.textContent ?? "").join(""); if (!value) continue;
        if (text.slice(offset, offset + value.length) !== value) throw new Error("SOURCE_MISMATCH"); const id = `TMWRUN_${runs.length}`, start = doc.createElementNS(W, "w:bookmarkStart"), end = doc.createElementNS(W, "w:bookmarkStart"); start.setAttributeNS(W, "w:id", String(runs.length * 2)); start.setAttributeNS(W, "w:name", id); end.setAttributeNS(W, "w:id", String(runs.length * 2 + 1)); end.setAttributeNS(W, "w:name", id + "_END"); run.parentNode!.insertBefore(start, run); run.parentNode!.insertBefore(end, run.nextSibling); runs.push({ id, part, paragraph: `${part}:${key}`, start: offset, end: offset + value.length, text: value }); offset += value.length;
      }
      if (offset !== anchor.end) warnings.add("有特殊文本对象无法关联分页预览位置；请在结构化原文中复核。");
    }
  }
  const vml:DocxVmlPreview[]=[],vmlImages:Record<string,string>=Object.create(null),imageCache=new Map<Buffer,string>();let vmlId=0,vmlImageSize=0;const saveVmlImage=(png:Buffer)=>{const previous=imageCache.get(png);if(previous)return previous;if((vmlImageSize+=png.length)>FILE_MAX_BYTES)throw new Error('FILE_SIZE_LIMIT');const key=`TMWVMLIMG_${imageCache.size}`;imageCache.set(png,key);vmlImages[key]=png.toString('base64');return key;};
  for(const [part,doc] of documents)if(stories(part))vml.push(...await extractVmlPreview(doc,part,async id=>{const rel=relationships.get(part)?.get(id);return rel?.type==='image'?output.get(rel.target)??null:null;},warnings,()=>vmlId++,saveVmlImage));
  for (const [part, doc] of documents) output.set(part, xmlBytes(doc));
  const contentTypes = xml(Buffer.from(`<Types xmlns="${CT}"/>`));
  for (const [name] of output) { const entry = contentTypes.createElementNS(CT, "Override"); entry.setAttribute("PartName", "/" + name); const type = name.endsWith(".rels") ? "application/vnd.openxmlformats-package.relationships+xml" : name.endsWith(".png") ? "image/png" : name.endsWith(".odttf") ? "application/vnd.openxmlformats-officedocument.obfuscatedFont" : /^word\/theme\//u.test(name) ? "application/vnd.openxmlformats-officedocument.theme+xml" : `application/vnd.openxmlformats-officedocument.wordprocessingml.${/header/.test(name) ? "header" : /footer/.test(name) ? "footer" : /styles/.test(name) ? "styles" : /numbering/.test(name) ? "numbering" : /fontTable/.test(name) ? "fontTable" : /footnotes/.test(name) ? "footnotes" : /endnotes/.test(name) ? "endnotes" : /comments/.test(name) ? "comments" : /settings/.test(name) ? "settings" : /theme/.test(name) ? "theme" : "document.main"}+xml`; entry.setAttribute("ContentType", type); contentTypes.documentElement!.appendChild(entry); } output.set("[Content_Types].xml", xmlBytes(contentTypes));
  warnings.add("浏览器只按文件内的分页符和节设置分页；自动分页及缺少的字体需在 Word 原件核对。");
  const bytes = await writeZip(output); return { bytes, runs, warnings: [...warnings], embeddedFonts, vml, vmlImages, packageHash: hash(bytes) };
}
