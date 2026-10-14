import { mkdir, readFile, open, rename, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

const lock = JSON.parse(await readFile(new URL("./ner-source-lock.json", import.meta.url), "utf8"));
const directory = resolve(".data/models/ner-source");
await mkdir(directory, { recursive: true, mode: 0o700 });
async function digest(path: string) { const hash = createHash("sha256"); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest("hex"); }
for (const [name, expected] of Object.entries(lock.files)) {
  const path = resolve(directory, name);
  try { if (await digest(path) !== expected) throw new Error("NER_MODEL_MISMATCH"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const url = name === "LICENSE" ? `https://raw.githubusercontent.com/shibing624/nerpy/${lock.referenceRevision}/LICENSE` : `https://huggingface.co/${lock.model}/resolve/${lock.revision}/${name}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(1200000) });
    if (!response.ok || !response.body) throw new Error(`NER_DOWNLOAD_FAILED ${name}`);
    const temporary = path + "." + randomUUID() + ".part", file = await open(temporary, "wx", 0o600), hash = createHash("sha256");
    let bytes = 0;
    try {
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 450000000) throw new Error("NER_DOWNLOAD_LIMIT"); hash.update(chunk); await file.writeFile(chunk); }
      if (hash.digest("hex") !== expected) throw new Error("NER_MODEL_MISMATCH");
      await file.sync(); await file.close(); await rename(temporary, path);
    } catch (error) { await file.close(); await unlink(temporary).catch(() => {}); throw error; }
  }
  console.log(JSON.stringify({ name, sha256: expected, sourceCommit: lock.revision }));
}
