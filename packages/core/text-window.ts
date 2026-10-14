import { TEXT_PAGE_CHARS, TEXT_MAX_BYTES } from "../contracts/index.ts";
export function textWindow(text: string, requested: number, size = TEXT_PAGE_CHARS) {
  if (requested === 0 && text.length <= TEXT_MAX_BYTES) size = TEXT_MAX_BYTES;
  let start = Math.min(requested, text.length), end = Math.min(start + size, text.length);
  const insidePair = (n: number) => n > 0 && n < text.length && /[\uD800-\uDBFF]/.test(text[n - 1]) && /[\uDC00-\uDFFF]/.test(text[n]);
  if (insidePair(start)) start--;
  if (insidePair(end)) end++;
  return { text: text.slice(start, end), textOffset: start, textLength: text.length, nextTextOffset: end < text.length ? end : null };
}
