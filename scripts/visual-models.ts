import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const lock = JSON.parse(await readFile(new URL("./visual-lock.json", import.meta.url), "utf8"));
const directory = resolve(process.env.VISUAL_MODEL_DIR ?? ".data/models/visual");
await mkdir(directory, { recursive: true, mode: 0o700 });
for (const [name, expected] of Object.entries(lock.files)) {
  let data: Buffer;
  try { data = await readFile(resolve(directory, name)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const base = name === "face.onnx" ? "https://media.githubusercontent.com/media" : "https://raw.githubusercontent.com";
    const remote = name === "face.onnx" ? "face_detection_yunet_2023mar.onnx" : name;
    const response = await fetch(`${base}/opencv/opencv_zoo/${lock.revision}/models/face_detection_yunet/${remote}`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error("VISUAL_DOWNLOAD_FAILED");
    let size = 0; const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) { size += chunk.length; if (size > 2 * 1024 * 1024) throw new Error("VISUAL_DOWNLOAD_LIMIT"); chunks.push(chunk); }
    data = Buffer.concat(chunks);
    if (createHash("sha256").update(data).digest("hex") !== expected) throw new Error("VISUAL_MODEL_MISMATCH");
    await writeFile(resolve(directory, name), data, { flag: "wx", mode: 0o600 });
  }
  if (createHash("sha256").update(data).digest("hex") !== expected) throw new Error("VISUAL_MODEL_MISMATCH");
  console.log(`${name}: verified ${data.length} bytes`);
}
