// A textarea normalizes CRLF and lone CR to LF. Document offsets remain UTF-16
// indices into the original canonical text, so a selection needs this bridge.
export function textareaCoordinateBridge(canonicalText: string, textareaValue: string) {
  const expected = canonicalText.replace(/\r\n?/g, "\n");
  if (textareaValue !== expected) throw new Error("TEXTAREA_VALUE_MISMATCH");

  const canonicalToDom = new Int32Array(canonicalText.length + 1).fill(-1);
  const domToCanonical = new Int32Array(textareaValue.length + 1).fill(-1);
  canonicalToDom[0] = 0;
  domToCanonical[0] = 0;
  for (let canonical = 0, dom = 0; canonical < canonicalText.length;) {
    if (canonicalText[canonical] === "\r" && canonicalText[canonical + 1] === "\n") {
      canonical += 2;
      dom += 1;
    } else {
      canonical += 1;
      dom += 1;
    }
    canonicalToDom[canonical] = dom;
    domToCanonical[dom] = canonical;
  }
  function toTextarea(canonicalLocalOffset: number): number {
    if (!Number.isSafeInteger(canonicalLocalOffset) || canonicalLocalOffset < 0 || canonicalLocalOffset > canonicalText.length)
      throw new RangeError("TEXTAREA_OFFSET_INVALID");
    const result = canonicalToDom[canonicalLocalOffset];
    if (result < 0) throw new RangeError("TEXTAREA_CRLF_INTERIOR_UNREPRESENTABLE");
    return result;
  }
  function toCanonical(domOffset: number): number {
    if (!Number.isSafeInteger(domOffset) || domOffset < 0 || domOffset > textareaValue.length)
      throw new RangeError("TEXTAREA_OFFSET_INVALID");
    const result = domToCanonical[domOffset];
    if (result < 0) throw new RangeError("TEXTAREA_OFFSET_INVALID");
    return result;
  }
  return { toTextarea, toCanonical };
}
