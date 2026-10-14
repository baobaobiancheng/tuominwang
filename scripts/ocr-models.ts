import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const commit = "87416418657359cb625c412a48b6e1d6d41c29bd";
const lock = JSON.parse(await readFile(new URL("./ocr-lock.json", import.meta.url), "utf8"));
const directory = resolve(".data/models/ocr");
await mkdir(directory, { recursive: true, mode: 0o700 });
for (const name of ["eng.traineddata", "chi_sim.traineddata", "LICENSE"]) {
  let data: Buffer;
  try { data = await readFile(resolve(directory, name)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const response = await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${commit}/${name}`, { signal: AbortSignal.timeout(600000) });
    if (!response.ok || !response.body) throw new Error(`OCR_DOWNLOAD_FAILED ${name}`);
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 10 * 1024 * 1024) throw new Error("OCR_DOWNLOAD_LIMIT"); chunks.push(chunk); }
    data = Buffer.concat(chunks);
    if (createHash("sha256").update(data).digest("hex") !== lock.files[name]) throw new Error("OCR_MODEL_MISMATCH");
    await writeFile(resolve(directory, name), data, { flag: "wx", mode: 0o600 });
  }
  if (createHash("sha256").update(data).digest("hex") !== lock.files[name]) throw new Error("OCR_MODEL_MISMATCH");
  console.log(JSON.stringify({ name, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex"), sourceCommit: commit }));
}
