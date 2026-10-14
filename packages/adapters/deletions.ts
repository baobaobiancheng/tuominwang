import { readdir, unlink, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { globalDb, rows, sql } from "./db.ts";

async function missingIsOkay(action: () => Promise<unknown>) { try { return await action(); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; } }
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
