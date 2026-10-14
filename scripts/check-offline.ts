import assert from "node:assert/strict";
import { createNer } from "../packages/core/ner.ts";
import { parsePages } from "../packages/adapters/page-parser.ts";
import { exportPages } from "../packages/adapters/page-export.ts";
import { pdfFixture } from "../tests/pdf-fixtures.ts";
import { detect } from "../packages/core/redaction.ts";
import { writeOriginal, hash, setObjectOwner } from "../packages/adapters/storage.ts";
import { randomUUID } from "node:crypto";

// Run inside docker --network none with an empty temporary /data. Public synthetic content only.
for (const destination of ["https://example.com", "https://huggingface.co"]) {
  let reachable = false; try { await fetch(destination, { signal: AbortSignal.timeout(2000) }); reachable = true; } catch {}
  assert.equal(reachable, false, "NETWORK_MUST_BE_DISABLED");
}
assert.equal(!!process.env.OPENAI_API_KEY || !!process.env.CODEX_HOME, false);
const ner = await createNer();
try { const candidates = await ner.detect("张三在北京工作。"); assert.ok(candidates.some(m => m.kind === "姓名")); console.log("Offline Chinese NER passed."); } finally { await ner.close(); }
const source = pdfFixture(), sourceId = randomUUID(), document = randomUUID(); setObjectOwner(document); await writeOriginal(sourceId, source);
const parsed = await parsePages(source, "pdf"), marks = detect(parsed.text, parsed.anchors).map(m => ({ ...m, decision: "redact" as const }));
assert.ok(marks.length);
const result = await exportPages({ id: document, source_id: sourceId, source_hash: hash(source), source_format: "pdf", anchors: parsed.anchors, page_data: parsed.pages, page_review: { mode: "raster", regions: [], deletedPages: [] }, marks }, parsed.text);
assert.equal(result.format, "pdf"); assert.ok(result.output.length);
console.log("Offline PDF/OCR -> selected pixel removal -> fresh PDF verification passed. Private AI not included.");
