import yauzl from "yauzl";
import yazl from "yazl";
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";
import { FILE_MAX_BYTES } from "../contracts/index.ts";
import { crc32 } from "node:zlib";
import type { Readable } from "node:stream";

export const ZIP_LIMITS = { entries: 10000, expanded: 256 * 1024 * 1024, entry: 50 * 1024 * 1024, nodes: 500000, depth: 128 };
export function readZip(bytes: Buffer): Promise<Map<string, Buffer>> {
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
        if (++count > ZIP_LIMITS.entries || entry.uncompressedSize > ZIP_LIMITS.entry || total + entry.uncompressedSize > ZIP_LIMITS.expanded) { fail("ZIP_LIMIT"); return; }
        if (names.has(name.toLowerCase()) || /[\\\x00-\x1f]/.test(name) || name.startsWith("/") || name.split("/").some(p => p === "." || p === "..") || entry.isEncrypted() || ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) { fail("INVALID_OFFICE"); return; }
        names.add(name.toLowerCase());
        if (name.endsWith("/")) { if (entry.uncompressedSize) fail("INVALID_OFFICE"); else zip.readEntry(); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { fail("INVALID_OFFICE"); return; }
          const chunks: Buffer[] = []; let size = 0, checksum = 0;
          stream.on("error", () => fail("INVALID_OFFICE"));
          stream.on("data", (chunk: Buffer) => {
            size += chunk.length; total += chunk.length; checksum = crc32(chunk, checksum);
            if (size > ZIP_LIMITS.entry || total > ZIP_LIMITS.expanded) { stream.destroy(); fail("ZIP_LIMIT"); } else chunks.push(chunk);
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
export function xml(bytes: Buffer): Document {
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("INVALID_OFFICE"); }
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("UNSAFE_XML");
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
export const xmlBytes = (doc: Document) => Buffer.from(new XMLSerializer().serializeToString(doc));
export const elements = (node: Document | Element, ns: string, name: string): Element[] => Array.from(node.getElementsByTagNameNS(ns, name));
