import type { VisualCandidate } from "./visual-detection.ts";
function validate(rgb: Uint8Array, width: number, height: number) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0) || width * height > 1600000 || rgb.length !== width * height * 3) throw new Error("VISUAL_INPUT_INVALID");
}
// The extracted macOS engine's HSV prefilter and bottom-page fallback, rewritten from its observed conditions.
export function possibleSealInk(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
  if (max < 70 || 255 * delta < 60 * max || delta <= 0) return false;
  let hue = max === r ? ((g - b) / delta % 6) * 60 : max === g ? ((b - r) / delta + 2) * 60 : ((r - g) / delta + 4) * 60;
  if (hue < 0) hue += 360;
  return hue / 2 <= 20 || hue / 2 >= 170 || hue / 2 >= 95 && hue / 2 <= 135;
}
export function hasPossibleSealInk(rgb: Uint8Array, channels = 3) {
  if (![3, 4].includes(channels) || !rgb.length || rgb.length % channels) return true;
  let count = 0;
  for (let i = 0; i < rgb.length; i += channels) if (possibleSealInk(rgb[i], rgb[i + 1], rgb[i + 2]) && ++count >= 8) return true;
  return false;
}
export function bottomSealCandidates(rgb: Uint8Array, width: number, height: number): VisualCandidate[] {
  validate(rgb, width, height);
  if (!hasPossibleSealInk(rgb)) return [];
  const ink = (x: number, y: number) => { const i = (y * width + x) * 3, r = rgb[i], g = rgb[i + 1], b = rgb[i + 2]; return r > 150 && r - Math.max(g, b) > 35 || b > 120 && b - Math.max(r, g) > 30; };
  let left = width, top = height, right = -1, bottom = -1, count = 0;
  for (let y = Math.floor(height * .65); y < height; y += Math.max(1, Math.floor(height / 2000))) for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 2000))) if (ink(x, y)) { count++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  const w = right - left + 1, h = bottom - top + 1;
  if (right <= left || bottom <= top || count < 180 || w * h < Math.max(Math.floor(width * height * .0015), 4000) || w * h > width * height * .12 || top < height * .5 || h > height * .22) return [];
  const stepX = Math.max(1, Math.floor(w / 600)), stepY = Math.max(1, Math.floor(h / 600)), rows: number[] = [], columns: number[] = [];
  for (let y = top; y <= bottom; y += stepY) { let on = 0, total = 0; for (let x = left; x <= right; x += stepX) { total++; if (ink(x, y)) on++; } if (on >= Math.max(2, Math.floor(total * .06))) rows.push(y); }
  for (let x = left; x <= right; x += stepX) { let on = 0, total = 0; for (let y = top; y <= bottom; y += stepY) { total++; if (ink(x, y)) on++; } if (on >= Math.max(2, Math.floor(total * .06))) columns.push(x); }
  left = columns[0] ?? left; right = columns.at(-1) ?? right; top = rows[0] ?? top; bottom = rows.at(-1) ?? bottom;
  const pad = Math.max(12, Math.round(.007 * Math.max(width, height))), x = Math.max(0, left - pad), y = Math.max(0, top - pad), bw = Math.min(width - x, right - left + 1 + pad * 2), bh = Math.min(height - y, bottom - top + 1 + pad * 2);
  if (y < height * .45 || bh > height * .22 || bw / bh < .55 || bw / bh > 1.7) return [];
  return [{ x, y, width: bw, height: bh, reason: "印章", score: .65, detector: "bottom-pixel-fallback-v1" }];
}
type Component = { left: number; right: number; top: number; bottom: number; count: number; pixels: number[] };
function darkComponents(rgb: Uint8Array, width: number, height: number) {
  validate(rgb, width, height);
  const ink = new Uint8Array(width * height), visited = new Uint8Array(ink.length), queue = new Int32Array(ink.length), result: Component[] = [];
  for (let i = 0; i < ink.length; i++) { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; ink[i] = Math.max(r, g, b) - Math.min(r, g, b) < 45 && (r * .299 + g * .587 + b * .114) < 175 ? 1 : 0; }
  const radius = Math.max(1, Math.min(3, Math.round(Math.min(width, height) / 400)));
  for (let seed = 0; seed < ink.length; seed++) {
    if (!ink[seed] || visited[seed]) continue;
    let head = 0, tail = 1; queue[0] = seed; visited[seed] = 1;
    const c: Component = { left: width, right: 0, top: height, bottom: 0, count: 0, pixels: [] };
    while (head < tail) {
      const i = queue[head++], x = i % width, y = Math.floor(i / width); c.count++; c.pixels.push(i); c.left = Math.min(c.left, x); c.right = Math.max(c.right, x); c.top = Math.min(c.top, y); c.bottom = Math.max(c.bottom, y);
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue; const n = yy * width + xx; if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; } }
    }
    if (c.count >= 20) result.push(c);
  }
  return result;
}
function joinBrokenContours(parts: Component[], distance: number) {
  const grouped: Component[] = [];
  for (const part of parts) {
    let c = { ...part, pixels: [...part.pixels] };
    for (let i = 0; i < grouped.length;) {
      const other = grouped[i], dx = Math.max(0, c.left - other.right - 1, other.left - c.right - 1), dy = Math.max(0, c.top - other.bottom - 1, other.top - c.bottom - 1);
      if (Math.hypot(dx, dy) > distance) { i++; continue; }
      c = { left: Math.min(c.left, other.left), right: Math.max(c.right, other.right), top: Math.min(c.top, other.top), bottom: Math.max(c.bottom, other.bottom), count: c.count + other.count, pixels: [...c.pixels, ...other.pixels] };
      grouped.splice(i, 1); i = 0;
    }
    grouped.push(c);
  }
  return grouped;
}
function padded(c: Component, width: number, height: number, reason: VisualCandidate["reason"], detector: string, score: number): VisualCandidate {
  const pad = Math.max(3, Math.ceil(Math.max(c.right - c.left + 1, c.bottom - c.top + 1) * .08)), x = Math.max(0, c.left - pad), y = Math.max(0, c.top - pad);
  return { x, y, width: Math.min(width, c.right + pad + 1) - x, height: Math.min(height, c.bottom + pad + 1) - y, reason, detector, score };
}
// Independent morphology proposals, not the missing Windows Python detector and not a seal authenticity classifier.
export function monochromeSealCandidates(rgb: Uint8Array, width: number, height: number): VisualCandidate[] {
  const boxes: VisualCandidate[] = [];
  for (const c of joinBrokenContours(darkComponents(rgb, width, height), Math.max(3, Math.round(Math.min(width, height) * .025)))) {
    const w = c.right - c.left + 1, h = c.bottom - c.top + 1, density = c.count / (w * h);
    if (w < 28 || h < 28 || w / h < .55 || w / h > 1.8 || w * h > width * height * .3 || density < .018 || density > .65) continue;
    const sectors = new Uint8Array(36), rectangleSides = new Uint8Array(4); let ring = 0;
    for (const i of c.pixels) {
      const nx = ((i % width) - (c.left + c.right) / 2) / (w / 2), ny = (Math.floor(i / width) - (c.top + c.bottom) / 2) / (h / 2), radius = Math.hypot(nx, ny);
      if (radius >= .8 && radius <= 1.08) { ring++; sectors[Math.min(35, Math.floor((Math.atan2(ny, nx) + Math.PI) / (2 * Math.PI) * 36))] = 1; }
      if (Math.abs(nx) > .9 && Math.abs(ny) < .75) rectangleSides[nx < 0 ? 0 : 1] = 1;
      if (Math.abs(ny) > .9 && Math.abs(nx) < .75) rectangleSides[ny < 0 ? 2 : 3] = 1;
    }
    const sectorCoverage = sectors.reduce((a, b) => a + b, 0) / sectors.length;
    let interior = 0;
    if (rectangleSides.every(Boolean) && sectorCoverage < .8) for (let yy = c.top + Math.ceil(h * .12); yy <= c.bottom - Math.ceil(h * .12); yy++) for (let xx = c.left + Math.ceil(w * .12); xx <= c.right - Math.ceil(w * .12); xx++) { const at = (yy * width + xx) * 3; if (Math.max(rgb[at], rgb[at + 1], rgb[at + 2]) - Math.min(rgb[at], rgb[at + 1], rgb[at + 2]) < 45 && rgb[at] * .299 + rgb[at + 1] * .587 + rgb[at + 2] * .114 < 175) interior++; }
    // Require a mostly closed ellipse; rectangle outlines remain proposals only when internal ink exists.
    if (sectorCoverage >= .8 && ring / c.count >= .3 || rectangleSides.every(Boolean) && density <= .45 && sectorCoverage < .8 && interior >= Math.max(30, w * h * .025)) boxes.push(padded(c, width, height, "印章", "monochrome-outline-v1", .55));
  }
  return boxes;
}
// Dark connected curved writing can be either a signature, handwriting or printed lettering; every result is a low-confidence proposal.
export function signatureCandidates(rgb: Uint8Array, width: number, height: number): VisualCandidate[] {
  const boxes: VisualCandidate[] = [];
  for (const c of darkComponents(rgb, width, height)) {
    const w = c.right - c.left + 1, h = c.bottom - c.top + 1, density = c.count / (w * h);
    if (w < 45 || h < 12 || w / h < 1.5 || w / h > 12 || density < .01 || density > .65 || w * h > width * height * .15) continue;
    const columns = new Int32Array(w), rows = new Int32Array(h);
    for (const i of c.pixels) { columns[i % width - c.left]++; rows[Math.floor(i / width) - c.top]++; }
    if (Math.max(...rows) > w * .8) continue; // table rulings and underlines
    let change = 0;
    for (let i = 1; i < columns.length; i++) change += Math.abs(columns[i] - columns[i - 1]);
    if (change / c.count < .025 || columns.filter(n => n > 0).length < w * .6) continue;
    boxes.push(padded(c, width, height, "签名", "handwriting-shape-v1", .45));
  }
  return boxes;
}
export type ExcludedVisualCandidate = VisualCandidate & { exclusion: "身份证章图案排除" | "证照页眉图案排除" | "证照大图案排除" | "证照印章位置排除" };
export function filterCertificateSealCandidates(candidates: VisualCandidate[], context: { text: string; filename: string }, page: { width: number; height: number }) {
  const text = context.text.replace(/\s+/g, ""), filename = context.filename.toLowerCase(), identity = /公民身份号码|居民身份证|身份证号码/.test(text) || /姓名/.test(text) && /性别/.test(text) && /民族/.test(text) && /出生/.test(text) && /住址/.test(text), business = /营业执照|统一社会信用代码|社会信用代码|法定代表人|登记机关|市场监督管理局/.test(text) || /business.*license|营业执照/.test(filename);
  const kept: VisualCandidate[] = [], excludedCandidates: ExcludedVisualCandidate[] = [];
  for (const c of candidates) {
    if (c.reason !== "印章" || !identity && !business) { kept.push(c); continue; }
    let exclusion: ExcludedVisualCandidate["exclusion"] | undefined;
    if (identity) exclusion = "身份证章图案排除";
    else {
      const cx = c.x + c.width / 2, cy = c.y + c.height / 2, area = c.width * c.height / (page.width * page.height), edge = c.x <= page.width * .04 || c.y <= page.height * .04 || c.x + c.width >= page.width * .96 || c.y + c.height >= page.height * .96;
      if (cx >= page.width * .32 && cx <= page.width * .68 && cy <= page.height * .45) exclusion = "证照页眉图案排除";
      else if (area >= .04 || area >= .025 && edge || c.width >= page.width * .22 || c.height >= page.height * .25) exclusion = "证照大图案排除";
      else if (!(cx >= page.width * .55 && cy >= page.height * .48)) exclusion = "证照印章位置排除";
    }
    if (exclusion) excludedCandidates.push({ ...c, exclusion }); else kept.push(c);
  }
  return { candidates: kept, excludedCandidates, certificateType: identity ? "identity" : business ? "business-license" : undefined };
}
