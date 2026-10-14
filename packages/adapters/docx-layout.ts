import {verifiedDocumentSource} from "./document-source.ts";
import { buildDocxLayout } from "../core/docx-layout.ts";
import { hash, readOriginal, unseal } from "./storage.ts";
/** Worker-only bridge: preserves original bytes and canonical source/revision bindings. */
export async function documentDocxLayout(d: any) {
  if (d.source_format !== "docx" || !d.source_id) throw new Error("UNSUPPORTED_FORMAT");
  const source = await verifiedDocumentSource(d);
  const text = unseal(d.content, `${d.tenant_id}:${d.project_id}:${d.id}`);
  if (hash(text) !== d.content_hash) throw new Error("SOURCE_MISMATCH");
  return buildDocxLayout(source, text, d.anchors ?? [], d.page_data ?? []);
}
