import type { Anchor, Mark } from "../contracts/index.ts";
import type { OcrCorrectionInput } from "../contracts/ocr.ts";
import type { Glyph } from "./ocr.ts";
const boundary = (s: string, i: number) => i >= 0 && i <= s.length && !(i > 0 && i < s.length && /[\uD800-\uDBFF]/.test(s[i - 1]) && /[\uDC00-\uDFFF]/.test(s[i]));

// Positions remain UTF-16. Changed text reuses the original pixels conservatively:
// we never invent narrow character boxes from a replacement's character count.
export function correctPageText(text: string, glyphs: Glyph[], input: OcrCorrectionInput, width: number, height: number) {
  if (!boundary(text, input.start) || !boundary(text, input.end) || input.end <= input.start || text.slice(input.start, input.end) !== input.expectedText || !input.text.isWellFormed()) throw new Error("OCR_TEXT_CONFLICT");
  if (text.length - (input.end - input.start) + input.text.length > 200000) throw new Error("PDF_TEXT_LIMIT");
  if (glyphs.length > 200000 || glyphs.some(g => g.length !== 6 || !g.every(Number.isFinite) || !Number.isInteger(g[0]) || !Number.isInteger(g[1]) || !boundary(text, g[0]) || !boundary(text, g[1]) || g[1] <= g[0] || g[4] < 0 || g[5] < 0)) throw new Error("PAGE_POSITION_MISSING");
  if (input.expectedText === input.text) return { text, glyphs, start: input.start, end: input.end, insertedLength: input.text.length, delta: 0, changed: false };
  // Strip equal prefix/suffix before remapping, so editing a line doesn't enlarge every box.
  let prefix = 0;
  while (prefix < input.expectedText.length && prefix < input.text.length && input.expectedText[prefix] === input.text[prefix]) prefix++;
  while (!boundary(input.expectedText, prefix) || !boundary(input.text, prefix)) prefix--;
  let suffix = 0;
  while (suffix < input.expectedText.length - prefix && suffix < input.text.length - prefix && input.expectedText.at(-suffix - 1) === input.text.at(-suffix - 1)) suffix++;
  while (!boundary(input.expectedText, input.expectedText.length - suffix) || !boundary(input.text, input.text.length - suffix)) suffix--;
  const start = input.start + prefix, end = input.end - suffix, replacement = input.text.slice(prefix, input.text.length - suffix), delta = replacement.length - (end - start);
  const visible = (g: Glyph) => g[4] > 0 && g[5] > 0 && g[2] + g[4] > 0 && g[3] + g[5] > 0 && g[2] < width && g[3] < height;
  let selected = glyphs.filter(g => g[0] < end && g[1] > start && visible(g));
  if (start === end) {
    // A missing character uses an adjacent original box within the explicitly selected text.
    const candidates = glyphs.filter(g => g[0] < input.end && g[1] > input.start && visible(g));
    const distance = (g: Glyph) => Math.min(Math.abs(g[0] - start), Math.abs(g[1] - start));
    const nearest = Math.min(...candidates.map(distance)); selected = candidates.filter(g => distance(g) === nearest);
  }
  if (/\S/u.test(replacement) && !selected.length) throw new Error("OCR_POSITION_REQUIRED");
  const mapped: Glyph[] = [];
  for (const g of glyphs) {
    if (g[1] <= start) mapped.push([...g]);
    else if (g[0] >= end) mapped.push([g[0] + delta, g[1] + delta, ...g.slice(2)] as Glyph);
    else {
      const a = Math.min(g[0], start), b = Math.max(start + replacement.length, g[1] + delta);
      if (b > a) mapped.push([a, b, ...g.slice(2)] as Glyph);
    }
  }
  if (start === end && replacement.length) for (const g of selected) mapped.push([start, start + replacement.length, ...g.slice(2)] as Glyph);
  const next = text.slice(0, start) + replacement + text.slice(end);
  if (!/\S/u.test(replacement) && selected.length) {
    // Deleted OCR characters still exist in the immutable image. Bind their pixels
    // to a nearby retained character instead of silently dropping the source boxes.
    let recipient: Glyph | undefined, nearest = Infinity;
    for (const g of mapped) {
      const distance = Math.min(Math.abs(g[0] - start), Math.abs(g[1] - start));
      if (visible(g) && distance < nearest && /\S/u.test(next.slice(g[0], g[1]))) { recipient = g; nearest = distance; }
    }
    if (!recipient) throw new Error("OCR_POSITION_REQUIRED");
    for (const g of selected) mapped.push([recipient[0], recipient[1], ...g.slice(2)] as Glyph);
  }
  const unique = [...new Map(mapped.map(g => [g.join(":"), g])).values()];
  if (unique.length > 200000) throw new Error("PDF_TEXT_LIMIT");
  return { text: next, glyphs: unique, start, end, insertedLength: replacement.length, delta, changed: true };
}
export function shiftOcrAnchors(anchors: Anchor[], target: Anchor, delta: number): Anchor[] {
  return anchors.map(a => a === target ? { ...a, end: a.end + delta } : a.start >= target.end ? { ...a, start: a.start + delta, end: a.end + delta } : { ...a });
}
export function resetOcrMarks(marks: Mark[], start: number, end: number, delta: number): Mark[] {
  return marks.flatMap(m => {
    if (m.start < end && m.end > start || start === end && m.start < start && m.end > start) return [];
    return [{ ...m, start: m.start >= end ? m.start + delta : m.start, end: m.start >= end ? m.end + delta : m.end, decision: "pending" as const }];
  });
}
