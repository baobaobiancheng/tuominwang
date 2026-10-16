import yauzl from "yauzl";
import yazl from "yazl";
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";
import { FILE_MAX_BYTES } from "../contracts/index.ts";
import { crc32 } from "node:zlib";
import type { Readable } from "node:stream";

export const ZIP_LIMITS = { entries: 10000, expanded: 256 * 1024 * 1024, entry: 50 * 1024 * 1024, nodes: 500000, depth: 128 };
export function readZip(bytes: Buffer, limits = ZIP_LIMITS): Promise<Map<string, Buffer>> {
  if (bytes.length > FILE_MAX_BYTES) return Promise.reject(new Error("FILE_SIZE_LIMIT"));
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) { reject(new Error("INVALID_OFFICE")); return; }
      const parts = new Map<string, Buffer>(), names = new Set<string>();
      let count = 0, total = 0, settled = false;
      const fail = (code: string) => { if (!settled) { settled = true; zip.close(); reject(new Error(code)); } };
      zip.on("error", () => fail("INVALID_OFFICE"));
      zip.on("end", () => { if (!settled) { settled = true; resolve(parts); } });
      zip.on("entry", entry => {
        if (settled) return;
        const name: string = entry.fileName;
        if (++count > limits.entries || entry.uncompressedSize > limits.entry || total + entry.uncompressedSize > limits.expanded) { fail("ZIP_LIMIT"); return; }
        if (names.has(name.toLowerCase()) || /[\\\x00-\x1f]/.test(name) || name.startsWith("/") || name.split("/").some(p => p === "." || p === "..") || entry.isEncrypted() || ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) { fail("INVALID_OFFICE"); return; }
        names.add(name.toLowerCase());
        if (name.endsWith("/")) { if (entry.uncompressedSize) fail("INVALID_OFFICE"); else zip.readEntry(); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { fail("INVALID_OFFICE"); return; }
          const chunks: Buffer[] = []; let size = 0, checksum = 0;
          stream.on("error", () => fail("INVALID_OFFICE"));
          stream.on("data", (chunk: Buffer) => {
            size += chunk.length; total += chunk.length; checksum = crc32(chunk, checksum);
            if (size > limits.entry || total > limits.expanded) { stream.destroy(); fail("ZIP_LIMIT"); } else chunks.push(chunk);
          });
          stream.on("end", () => {
            if (settled) return;
            if (size !== entry.uncompressedSize || checksum !== entry.crc32) { fail("INVALID_OFFICE"); return; }
            parts.set(name, Buffer.concat(chunks)); zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
export function writeZip(parts: Map<string, Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile(), chunks: Buffer[] = []; let size = 0;
    zip.outputStream.on("error", reject);
    zip.outputStream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > FILE_MAX_BYTES) (zip.outputStream as Readable).destroy(new Error("FILE_SIZE_LIMIT")); else chunks.push(chunk);
    });
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    for (const [name, bytes] of [...parts].sort(([a], [b]) => a.localeCompare(b))) zip.addBuffer(bytes, name, { mtime: new Date("2000-01-01T00:00:00Z"), mode: 0o100600, compress: true });
    zip.end();
  });
}
function declaredEncoding(source: string): string | undefined {
  if (!source.startsWith("<?xml")) return undefined;
  const end = source.indexOf("?>", 5);
  if (end < 0) throw new Error("INVALID_OFFICE");
  const declaration = source.slice(0, end + 2);
  return declaration.match(/\bencoding\s*=\s*(["'])([A-Za-z][A-Za-z0-9._-]*)\1/)?.[2];
}
function matchingUnicodeDeclaration(actual: string, declared: string | undefined): boolean {
  if (!declared) return true;
  const label = declared.toLowerCase();
  if (actual === "utf-8") return label === "utf-8" || label === "utf8";
  if (actual === "utf-16le") return label === "utf-16" || label === "utf-16le";
  if (actual === "utf-16be") return label === "utf-16" || label === "utf-16be";
  if (actual === "utf-32le") return label === "utf-32" || label === "utf-32le";
  return label === "utf-32" || label === "utf-32be";
}
const latin1Label = (label: string) => /^(?:iso-?8859-?1|iso_8859-1|latin-?1|l1|ibm819|cp819)$/i.test(label);
/** Read XML declarations at their actual boundary, without a fixed prefix window. */
function asciiDeclaredEncoding(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 5).toString("ascii") !== "<?xml") return undefined;
  const end = bytes.indexOf(Buffer.from("?>"), 5);
  if (end < 0) throw new Error("INVALID_OFFICE");
  return declaredEncoding(bytes.subarray(0, end + 2).toString("latin1"));
}
/** Decode the XML part before applying XML safety checks. */
export function decodeOfficeXml(bytes: Buffer): string {
  try {
    const first = bytes.subarray(0, 4).toString("hex");
    const utf32LE = first === "fffe0000" || first === "3c000000";
    const utf32BE = first === "0000feff" || first === "0000003c";
    if (utf32LE || utf32BE) {
      const offset = first === "fffe0000" || first === "0000feff" ? 4 : 0;
      if ((bytes.length - offset) % 4) throw new Error("INVALID_OFFICE");
      const chunks: string[] = [], points: number[] = [];
      for (let i = offset; i < bytes.length; i += 4) {
        const point = utf32LE ? bytes.readUInt32LE(i) : bytes.readUInt32BE(i);
        if (point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) throw new Error("INVALID_OFFICE");
        points.push(point);
        if (points.length === 4096) { chunks.push(String.fromCodePoint(...points)); points.length = 0; }
      }
      if (points.length) chunks.push(String.fromCodePoint(...points));
      const source = chunks.join("");
      if (!matchingUnicodeDeclaration(utf32LE ? "utf-32le" : "utf-32be", declaredEncoding(source))) throw new Error("INVALID_OFFICE");
      return source;
    }
    let encoding = "utf-8";
    let signature: string | undefined;
    if (first.startsWith("fffe") || first === "3c003f00") signature = encoding = "utf-16le";
    else if (first.startsWith("feff") || first === "003c003f") signature = encoding = "utf-16be";
    else if (first.startsWith("efbbbf")) signature = "utf-8";
    else {
      const declaration = asciiDeclaredEncoding(bytes);
      if (declaration) encoding = declaration;
    }
    // TextDecoder's ISO-8859-1 label aliases Windows-1252; XML uses Latin-1.
    const source = latin1Label(encoding) ? bytes.toString("latin1") : new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (signature && !matchingUnicodeDeclaration(signature, declaredEncoding(source))) throw new Error("INVALID_OFFICE");
    return source;
  } catch { throw new Error("INVALID_OFFICE"); }
}
function assertNoDtd(source: string): void {
  // Only XML comments, CDATA, and processing instructions may contain these
  // literal strings without declaring a DTD. Unterminated regions fail closed.
  for (let i = 0; i < source.length;) {
    const start = source.indexOf("<", i);
    if (start < 0) return;
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      if (end < 0) throw new Error("INVALID_OFFICE");
      i = end + 3; continue;
    }
    if (source.startsWith("<![CDATA[", start)) {
      const end = source.indexOf("]]>", start + 9);
      if (end < 0) throw new Error("INVALID_OFFICE");
      i = end + 3; continue;
    }
    if (source.startsWith("<?", start)) {
      const end = source.indexOf("?>", start + 2);
      if (end < 0) throw new Error("INVALID_OFFICE");
      i = end + 2; continue;
    }
    if (/^<!(?:DOCTYPE|ENTITY)\b/i.test(source.slice(start, start + 10))) throw new Error("UNSAFE_XML");
    i = start + 1;
  }
}
export function xml(bytes: Buffer): Document {
  const source = decodeOfficeXml(bytes);
  assertNoDtd(source);
  let doc: Document;
  try { doc = new DOMParser({ onError() { throw new Error("INVALID_OFFICE"); } }).parseFromString(source, "application/xml"); }
  catch { throw new Error("INVALID_OFFICE"); }
  const pending: [Node, number][] = [[doc, 0]]; let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop()!;
    if (++count > ZIP_LIMITS.nodes || depth > ZIP_LIMITS.depth) throw new Error("XML_LIMIT");
    for (let child = node.lastChild; child; child = child.previousSibling) pending.push([child, depth + 1]);
  }
  return doc;
}
export const xmlBytes = (doc: Document) => {const source=new XMLSerializer().serializeToString(doc).replace(/^(<\?xml\s[^?]*?\bencoding\s*=\s*["'])[^"']+(["'])/i, "$1UTF-8$2");if(!source.isWellFormed()||/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/u.test(source))throw new Error("OFFICE_XML_VALUE_INVALID");return Buffer.from(source);};
export const elements = (node: Document | Element, ns: string, name: string): Element[] => Array.from(node.getElementsByTagNameNS(ns, name));
