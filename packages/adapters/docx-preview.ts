import {verifiedDocumentSource} from "./document-source.ts";
import { prepareDocxPreview } from "../core/docx-preview.ts";
import type { DocxPreviewPackage } from "../contracts/docx-preview.ts";
import { hash, readOriginal, unseal } from "./storage.ts";
export async function documentDocxPreview(d: any): Promise<DocxPreviewPackage> {
  if (d.source_format !== "docx" || !d.source_id) throw new Error("UNSUPPORTED_FORMAT"); const source = await verifiedDocumentSource(d), text = unseal(d.content, `${d.tenant_id}:${d.project_id}:${d.id}`); if (hash(text) !== d.content_hash) throw new Error("SOURCE_MISMATCH");
  const previews = new Map<string, Buffer>(); for (const page of d.page_data ?? []) if (page.part) { const image = await readOriginal(page.previewId); if (hash(image) !== page.previewHash) throw new Error("SOURCE_MISMATCH"); previews.set(page.part, image); }
  const result = await prepareDocxPreview(source, text, d.anchors ?? [], previews); return { version: 1, documentId: d.id, revision: d.revision, sourceHash: d.source_hash, contentHash: d.content_hash, packageHash: result.packageHash, archiveBase64: result.bytes.toString("base64"), runs: result.runs, warnings: result.warnings, embeddedFonts: result.embeddedFonts, vml: result.vml, vmlImages: result.vmlImages };
}
