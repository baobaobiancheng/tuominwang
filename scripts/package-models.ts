import { mkdir, readFile, copyFile, chmod, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const output = resolve(process.argv[2] ?? ".data/releases/models");
const manifest: Record<string, string> = {};
const configurations = {
  ner: {lock:"ner-runtime-lock.json",env:"NER_MODEL_DIR"}, ocr:{lock:"ocr-lock.json",env:"OCR_MODEL_DIR"},
  visual:{lock:"visual-lock.json",env:"VISUAL_MODEL_DIR"},signature:{lock:"signature-lock.json",env:"SIGNATURE_MODEL_DIR"},render:{lock:"render-font-lock.json",env:"RENDER_FONT_DIR"},
} as const;
const requested = process.argv.slice(3);
const groups = requested.length ? requested : Object.keys(configurations);
if(new Set(groups).size!==groups.length||groups.some(group=>!Object.hasOwn(configurations,group)))throw new Error("INVALID_MODEL_GROUP");
for (const name of groups) {
  const group=name as keyof typeof configurations,configuration=configurations[group];
  const lock = JSON.parse(await readFile(new URL("./"+configuration.lock, import.meta.url), "utf8"));
  await mkdir(resolve(output, group), { recursive: true, mode: 0o755 });
  for (const [name, expected] of Object.entries(lock.files)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("INVALID_MODEL_PATH");
    const source = resolve(process.env[configuration.env] ?? `.data/models/${group}`, name), digest = createHash("sha256");
    for await (const chunk of createReadStream(source)) digest.update(chunk);
    if (digest.digest("hex") !== expected) throw new Error("MODEL_HASH_MISMATCH");
    const destination = resolve(output, group, name); await copyFile(source, destination, 1); await chmod(destination, 0o644); manifest[`${group}/${name}`] = expected as string;
  }
}
await writeFile(resolve(output, "manifest.json"), JSON.stringify({ privateAI: "not_included", files: manifest }, null, 2), { flag: "wx", mode: 0o644 });
console.log("Verified model bundle created:", output);
