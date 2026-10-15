import{hasEntityGeometry}from'../contracts/entity-geometry.ts';
import sharp from "sharp";
import { deflateSync } from "node:zlib";
import { pageReviewSchema, type PageReview, type ParsedPage, type Anchor, type Mark } from "../contracts/index.ts";
import type { Glyph } from "./ocr.ts";
import { checkPixels, PAGE_MAX_PIXELS } from "./pdf-reader.ts";
import { validateMarks } from "./redaction.ts";

export const PAGED_FORMATS = ["pdf", "png", "jpg", "jpeg"];
export const OUTPUT_MAX_BYTES = 50 * 1024 * 1024;
type Page = Pick<ParsedPage, "index" | "width" | "height">;
export type Box = { x: number; y: number; width: number; height: number; shape?:"rect"|"circle" };
export function validatePageReview(value: unknown, pages: Page[], final = false): PageReview {
  const parsed = pageReviewSchema.safeParse(value);
  if (!parsed.success || !pages.length || pages.length > 300 || pages.some((p, i) => p.index !== i || !Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width <= 0 || p.height <= 0)) throw new Error("INVALID_PAGE_REVIEW");
  const policy = parsed.data, deleted = new Set(policy.deletedPages);
  if (deleted.size !== policy.deletedPages.length || deleted.size >= pages.length || [...deleted].some(i => !pages[i]) || new Set(policy.regions.map(r => r.id)).size !== policy.regions.length) throw new Error("INVALID_PAGE_REVIEW");
  for (const r of policy.regions) {
    const p = pages[r.page];
    if (!p || r.x + r.width > p.width || r.y + r.height > p.height) throw new Error("INVALID_PAGE_REVIEW");
  }
  if (final && policy.mode !== "raster") throw new Error("PAGE_CONVERSION_REQUIRED");
  return policy;
}
export function pageBoxes(text: string, marks: Mark[], anchors: Anchor[], page: Page, glyphs: Glyph[], policy: PageReview, overrides:ReadonlyMap<number,Box[]>=new Map()): Box[] {
  validateMarks(text, marks, true);
  const anchor = anchors.find(a => a.kind === "page" && a.page === page.index);
  if (!anchor) throw new Error("PAGE_POSITION_MISSING");
  const boxes: Box[] = policy.regions.filter(r => r.page === page.index&&!hasEntityGeometry(r)).map(({ x, y, width, height,shape }) => ({ x, y, width, height,...shape?{shape}:{} }));
  const localText = text.slice(anchor.start, anchor.end);
  if (glyphs.length > 200000 || glyphs.some(g => g.length !== 6 || !g.every(Number.isFinite) || !Number.isInteger(g[0]) || !Number.isInteger(g[1]) || g[0] < 0 || g[1] <= g[0] || g[1] > localText.length || g[4] < 0 || g[5] < 0)) throw new Error("PAGE_POSITION_MISSING");
  for (const [markIndex,mark] of marks.entries()) {
    if(!(mark.decision === "redact" && mark.start < anchor.end && mark.end > anchor.start))continue;
    const originalBoxStart=boxes.length;
    const start = Math.max(mark.start, anchor.start) - anchor.start, end = Math.min(mark.end, anchor.end) - anchor.start;
    const covered = new Uint8Array(end - start);
    for (const g of glyphs) if (g[0] < end && g[1] > start) {
      if (g[4] <= 0 || g[5] <= 0 || g[2] + g[4] <= 0 || g[3] + g[5] <= 0 || g[2] >= page.width || g[3] >= page.height) continue;
      for (let i = Math.max(start, g[0]); i < Math.min(end, g[1]); i++) covered[i - start] = 1;
      // Two canonical units guard antialiasing at glyph edges; clamp to the actual page.
      const x = Math.max(0, g[2] - 2), y = Math.max(0, g[3] - 2);
      boxes.push({ x, y, width: Math.min(page.width, g[2] + g[4] + 2) - x, height: Math.min(page.height, g[3] + g[5] + 2) - y });
    }
    for (let i = start; i < end; i++) if (!covered[i - start] && !/\s/u.test(localText[i])) throw new Error("PAGE_POSITION_MISSING");
    const replacement=overrides.get(markIndex);if(replacement){if(!replacement.length||replacement.some(b=>![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>page.width+1e-7||b.y+b.height>page.height+1e-7))throw Error('ENTITY_GEOMETRY_INVALID');boxes.splice(originalBoxStart);boxes.push(...replacement.map(b=>({...b})));}
  }
  return boxes;
}
export const MASK_COLORS = { black: [0, 0, 0], white: [255, 255, 255], purple: [52, 10, 94], lightGray: [203, 208, 216] } as const;
export async function clearPixels(png: Buffer, page: Page, boxes: Box[], style: NonNullable<PageReview["maskStyle"]> = "black") {
  const fill = MASK_COLORS[style];
  if (!fill) throw new Error("INVALID_PAGE_REVIEW");
  const { data, info } = await sharp(png, { limitInputPixels: PAGE_MAX_PIXELS, failOn: "warning" }).flatten({ background: "white" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  checkPixels(info.width, info.height);
  if (info.channels !== 3 || Math.abs(info.width / page.width - info.height / page.height) > 0.02) throw new Error("PAGE_POSITION_MISSING");
  const whiteMask = style === "white" ? new Uint8Array(info.width * info.height) : undefined;
  for (const box of boxes) {
    if (box.shape!==undefined&&box.shape!=="rect"&&box.shape!=="circle"||![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 || box.x + box.width > page.width || box.y + box.height > page.height) throw new Error("INVALID_PAGE_REVIEW");
    const left = Math.floor(box.x * info.width / page.width), top = Math.floor(box.y * info.height / page.height);
    const right = Math.ceil((box.x + box.width) * info.width / page.width), bottom = Math.ceil((box.y + box.height) * info.height / page.height);
    const cx=(box.x+box.width/2)*info.width/page.width,cy=(box.y+box.height/2)*info.height/page.height,rx=box.width/2*info.width/page.width,ry=box.height/2*info.height/page.height;
    for (let y = top; y < bottom; y++) {
      let from=left,to=right;
      if(box.shape==='circle'){
        // The source's circle is an ellipse inscribed in the supplied rectangle.
        // Clear each pixel cell that intersects its interior, with no antialiased
        // source-colour edge; corner pixels outside the ellipse remain original.
        const nearestY=Math.max(y,Math.min(y+1,cy)),dy=(nearestY-cy)/ry,dx=rx*Math.sqrt(Math.max(0,1-dy*dy));
        from=Math.max(left,Math.floor(cx-dx));to=Math.min(right,Math.ceil(cx+dx));
      }
      if (style === "black") data.fill(0, (y * info.width + from) * 3, (y * info.width + to) * 3);
      else for (let x = from; x < to; x++) {
        const at = y * info.width + x;
        data[at * 3] = fill[0]; data[at * 3 + 1] = fill[1]; data[at * 3 + 2] = fill[2];
        if (whiteMask) whiteMask[at] = 1;
      }
    }
  }
  // Draw white-mask edges inside the already cleared union, never on uncleared pixels.
  if (whiteMask) for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const at = y * info.width + x;
    if (whiteMask[at] && (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1 || !whiteMask[at - 1] || !whiteMask[at + 1] || !whiteMask[at - info.width] || !whiteMask[at + info.width])) data.fill(51, at * 3, at * 3 + 3);
  }
  const output = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  const reread = await sharp(output).removeAlpha().raw().toBuffer();
  if (!reread.equals(data)) throw new Error("PIXEL_VERIFICATION_FAILED");
  const metadata = await sharp(output).metadata();
  if (metadata.exif || metadata.xmp || metadata.icc || metadata.iptc || (metadata.pages ?? 1) !== 1) throw new Error("PIXEL_VERIFICATION_FAILED");
  return { png: output, rgb: data, width: info.width, height: info.height };
}

// A fresh image-only PDF: no original PDF objects, fonts, metadata, scripts or hidden streams are copied.
// ponytail: bounded in-memory output (50 MiB); use a private streaming spool if larger exports become necessary.
export class RasterPdf {
  private objects: Buffer[] = [Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"), Buffer.alloc(0)];
  private kids: number[] = [];
  private size = 0;
  add(page: Page, rgb: Buffer, width: number, height: number) {
    checkPixels(width, height);
    if (rgb.length !== width * height * 3 || this.kids.length >= 300) throw new Error("PIXEL_VERIFICATION_FAILED");
    const number = this.objects.length + 1, content = Buffer.from(`q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`), compressed = deflateSync(rgb);
    this.kids.push(number);
    const stream = (dict: string, data: Buffer) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, Buffer.from("\nendstream")]);
    const objects = [Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${number + 2} 0 R >> >> /Contents ${number + 1} 0 R >>`), stream("", content), stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, compressed)];
    this.size += objects.reduce((n, b) => n + b.length + 100, 0);
    if (this.size > OUTPUT_MAX_BYTES) throw new Error("OUTPUT_SIZE_LIMIT");
    this.objects.push(...objects);
  }
  finish() {
    if (!this.kids.length) throw new Error("INVALID_PAGE_REVIEW");
    this.objects[1] = Buffer.from(`<< /Type /Pages /Count ${this.kids.length} /Kids [${this.kids.map(n => `${n} 0 R`).join(" ")}] >>`);
    const chunks = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")], offsets = [0]; let size = chunks[0].length;
    this.objects.forEach((object, i) => { offsets.push(size); const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]); chunks.push(chunk); size += chunk.length; });
    chunks.push(Buffer.from(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${size}\n%%EOF\n`));
    const output = Buffer.concat(chunks); if (output.length > OUTPUT_MAX_BYTES) throw new Error("OUTPUT_SIZE_LIMIT"); return output;
  }
}
