import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { PAGE_MAX_PIXELS } from "./pdf-reader.ts";
export type VisualCandidate = { x: number; y: number; width: number; height: number; reason: "人脸" | "印章"; score: number; detector: string };
export function iou(a: VisualCandidate, b: VisualCandidate) {
  const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return overlap / (a.width * a.height + b.width * b.height - overlap || 1);
}
export function suppressOverlaps(boxes: VisualCandidate[]) {
  const kept: VisualCandidate[] = [];
  for (const box of [...boxes].sort((a, b) => b.score - a.score)) if (!kept.some(old => old.reason === box.reason && iou(old, box) >= .3)) kept.push(box);
  return kept.slice(0, 200);
}
export async function verifyVisualBundle() {
  const lock = JSON.parse(await readFile(new URL("../../scripts/visual-lock.json", import.meta.url), "utf8"));
  const directory = resolve(process.env.VISUAL_MODEL_DIR ?? ".data/models/visual");
  for (const [name, expected] of Object.entries(lock.files)) {
    let bytes: Buffer;
    try { bytes = await readFile(resolve(directory, name)); } catch { throw new Error("VISUAL_MODEL_REQUIRED"); }
    if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("VISUAL_MODEL_MISMATCH");
  }
  return { directory, version: `${lock.model}@${lock.revision}` };
}
// Color/connected-component proposals; never presented as verified seals. Black/gray seals are outside this detector.
export function coloredSealCandidates(rgb: Uint8Array, width: number, height: number): VisualCandidate[] {
  if (rgb.length !== width * height * 3 || width * height > 1600000) throw new Error("VISUAL_INPUT_INVALID");
  const colors = new Uint8Array(width * height), visited = new Uint8Array(colors.length), queue = new Int32Array(colors.length);
  for (let i = 0; i < colors.length; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    colors[i] = r > 140 && r - g > 35 && r - b > 35 ? 1 : b > 110 && b - r > 30 && b - g > 20 ? 2 : 0;
  }
  // A small neighborhood connects broken stamp outlines while keeping distant stamps separate.
  const radius = Math.max(1, Math.min(4, Math.round(Math.min(width, height) / 250))), boxes: VisualCandidate[] = [];
  for (let seed = 0; seed < colors.length; seed++) {
    if (!colors[seed] || visited[seed]) continue;
    let head = 0, tail = 1, count = 0, minX = width, minY = height, maxX = 0, maxY = 0;
    queue[0] = seed; visited[seed] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width); count++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
        const n = yy * width + xx;
        if (!visited[n] && colors[n] === colors[seed]) { visited[n] = 1; queue[tail++] = n; }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1, area = w * h, ratio = w / h;
    if (count < 40 || w < 16 || h < 16 || area < width * height * .0008 || area > width * height * .3 || ratio < .45 || ratio > 2.2 || count / area > .8) continue;
    const pad = Math.max(3, Math.ceil(Math.max(w, h) * .08)), x = Math.max(0, minX - pad), y = Math.max(0, minY - pad);
    boxes.push({ x, y, width: Math.min(width, maxX + pad + 1) - x, height: Math.min(height, maxY + pad + 1) - y, reason: "印章", score: .65, detector: "colored-components-v1" });
  }
  return suppressOverlaps(boxes);
}
export async function detectVisual(bytes: Buffer, requested: ("face" | "seal")[]) {
  const image = sharp(bytes, { limitInputPixels: PAGE_MAX_PIXELS }).flatten({ background: "white" }).toColourspace("srgb").removeAlpha();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("VISUAL_INPUT_INVALID");
  const width = metadata.width, height = metadata.height, candidates: VisualCandidate[] = [];
  let faceVersion: string | undefined;
  if (requested.includes("seal")) {
    const normalized = await image.clone().resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    const sx = width / normalized.info.width, sy = height / normalized.info.height;
    candidates.push(...coloredSealCandidates(normalized.data, normalized.info.width, normalized.info.height).map(b => ({ ...b, x: b.x * sx, y: b.y * sy, width: b.width * sx, height: b.height * sy })));
  }
  if (requested.includes("face")) {
    const bundle = await verifyVisualBundle(); faceVersion = bundle.version;
    process.env.ORT_DISABLE_TELEMETRY = "1";
    const { InferenceSession, Tensor } = await import("onnxruntime-node");
    const session = await InferenceSession.create(resolve(bundle.directory, "face.onnx"), { executionProviders: ["cpu"], intraOpNumThreads: 2, interOpNumThreads: 1 });
    try {
      const size = 640, scale = Math.min(size / width, size / height), rw = Math.max(1, Math.round(width * scale)), rh = Math.max(1, Math.round(height * scale));
      const raw = await image.clone().resize(rw, rh).extend({ right: size - rw, bottom: size - rh, top: 0, left: 0, background: "black" }).raw().toBuffer();
      const pixels = size * size, data = new Float32Array(pixels * 3);
      for (let i = 0; i < pixels; i++) { data[i] = raw[i * 3 + 2]; data[pixels + i] = raw[i * 3 + 1]; data[pixels * 2 + i] = raw[i * 3]; }
      const out = await session.run({ [session.inputNames[0]]: new Tensor("float32", data, [1, 3, size, size]) });
      for (const stride of [8, 16, 32]) {
        const cls = out[`cls_${stride}`]?.data as Float32Array, obj = out[`obj_${stride}`]?.data as Float32Array, bbox = out[`bbox_${stride}`]?.data as Float32Array, cols = size / stride;
        if (!cls || !obj || !bbox || cls.length !== cols * cols || obj.length !== cls.length || bbox.length !== cls.length * 4) throw new Error("VISUAL_OUTPUT_INVALID");
        for (let i = 0; i < cls.length; i++) {
          if (![cls[i], obj[i], ...bbox.subarray(i * 4, i * 4 + 4)].every(Number.isFinite)) throw new Error("VISUAL_OUTPUT_INVALID");
          const score = Math.sqrt(Math.max(0, Math.min(1, cls[i])) * Math.max(0, Math.min(1, obj[i]))); if (score < .6) continue;
          const cx = ((i % cols) + bbox[i * 4]) * stride, cy = (Math.floor(i / cols) + bbox[i * 4 + 1]) * stride, w = Math.exp(bbox[i * 4 + 2]) * stride, h = Math.exp(bbox[i * 4 + 3]) * stride;
          if (![cx, cy, w, h].every(Number.isFinite)) throw new Error("VISUAL_OUTPUT_INVALID");
          const sx = width / rw, sy = height / rh, x = Math.max(0, (cx - w * .55) * sx), y = Math.max(0, (cy - h * .55) * sy), right = Math.min(width, (cx + w * .55) * sx), bottom = Math.min(height, (cy + h * .55) * sy);
          if (right > x && bottom > y) candidates.push({ x, y, width: right - x, height: bottom - y, reason: "人脸", score, detector: "yunet-2023mar" });
        }
      }
    } finally { await session.release(); }
  }
  return { width, height, candidates: suppressOverlaps(candidates), faceVersion, sealVersion: requested.includes("seal") ? "colored-components-v1" : undefined };
}

export function canonicalVisualResult(result: Awaited<ReturnType<typeof detectVisual>>, page: { width: number; height: number }) {
  if (![result.width, result.height, page.width, page.height].every(n => Number.isFinite(n) && n > 0)) throw new Error("VISUAL_INPUT_INVALID");
  const sx = page.width / result.width, sy = page.height / result.height;
  return { ...result, width: page.width, height: page.height, candidates: result.candidates.map(c => ({ ...c, x: c.x * sx, y: c.y * sy, width: Math.min(c.width * sx, page.width - c.x * sx), height: Math.min(c.height * sy, page.height - c.y * sy) })) };
}
