import { mkdir, readFile, copyFile, chmod, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const output = resolve(process.argv[2] ?? ".data/releases/models");
const manifest: Record<string, string> = {};
for (const group of ["ner", "ocr", "visual"] as const) {
  const lock = JSON.parse(await readFile(new URL(group === "ner" ? "./ner-runtime-lock.json" : group === "visual" ? "./visual-lock.json" : "./ocr-lock.json", import.meta.url), "utf8"));
  await mkdir(resolve(output, group), { recursive: true, mode: 0o755 });
  for (const [name, expected] of Object.entries(lock.files)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("INVALID_MODEL_PATH");
    const source = resolve(process.env[group === "ner" ? "NER_MODEL_DIR" : group === "visual" ? "VISUAL_MODEL_DIR" : "OCR_MODEL_DIR"] ?? `.data/models/${group}`, name), digest = createHash("sha256");
    for await (const chunk of createReadStream(source)) digest.update(chunk);
    if (digest.digest("hex") !== expected) throw new Error("MODEL_HASH_MISMATCH");
    const destination = resolve(output, group, name); await copyFile(source, destination, 1); await chmod(destination, 0o644); manifest[`${group}/${name}`] = expected as string;
  }
}
await writeFile(resolve(output, "manifest.json"), JSON.stringify({ privateAI: "not_included", files: manifest }, null, 2), { flag: "wx", mode: 0o644 });
console.log("Verified NER/OCR/visual bundle created:", output);
