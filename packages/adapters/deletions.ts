import { readdir, unlink, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { globalDb, rows, sql } from "./db.ts";
import {removeOwnedArtifact} from "./storage.ts";
import { removeOwnedFolderStream } from "./folder-storage.ts";

async function missingIsOkay(action: () => Promise<unknown>) { try { return await action(); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; } }
/** Runs under the same heavy slot as material purging. The queue is committed
 * by a session invalidation, and only the ZIP's exact owner link is released. */
export async function purgeRequestedFolderOutputs() {
  const requests = await rows(globalDb, sql`SELECT * FROM due_folder_export_deletions()`);
  for (const request of requests) {
    await removeOwnedFolderStream(request.zip_id, request.owner_document_id);
    await rows(globalDb, sql`SELECT finish_folder_export_deletion(${request.zip_id})`);
  }
  return requests.length;
}
// Caller holds the same heavy-work lock as parsing/export, so terminated tasks cannot add late objects.
export async function purgeRequestedMaterials() {
  const requests = await rows(globalDb, sql`SELECT * FROM due_material_deletions()`), root = resolve(process.env.DATA_DIR ?? ".data/files");
  for (const request of requests) {
    const document = request.document_id as string;
    if (!/^[a-f0-9-]{36}$/.test(document)) throw new Error("INVALID_OBJECT");
    const registry = resolve(root, ".owners", document), registered = await missingIsOkay(() => readdir(registry)) as string[] | undefined;
    for (const id of new Set<string>([...request.object_ids, ...registered ?? []])) {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("INVALID_OBJECT");
      await missingIsOkay(() => unlink(resolve(root, id)));
      await missingIsOkay(() => unlink(resolve(registry, id)));
    }
    await missingIsOkay(() => rmdir(registry));
    await rows(globalDb, sql`SELECT finish_material_deletion(${document})`);
  }
  return requests.length;
}

// Receipt deletion (including project cascade) queues its exact immutable ID.
// This also reclaims a write interrupted before the sealed pointer committed.
export async function purgeRequestedWorkspaceSaves() {
 const requests=await rows(globalDb,sql`SELECT * FROM due_workspace_save_deletions()`);let completed=0;
 for(const request of requests){
  try{
   await removeOwnedArtifact(request.receipt_id,request.receipt_id);
   await rows(globalDb,sql`SELECT finish_workspace_save_deletion(${request.receipt_id})`);completed++;
  }catch{
   // Preserve the queue identity and the foreign object. A broken cleanup
   // entry must not starve later cleanup entries or ordinary processing.
   console.error('WORKSPACE_SAVE_CLEANUP_FAILED');
   try{await rows(globalDb,sql`SELECT retry_workspace_save_deletion(${request.receipt_id})`);}catch{console.error('WORKSPACE_SAVE_CLEANUP_RETRY_FAILED');}
  }
 }
 return completed;
}
