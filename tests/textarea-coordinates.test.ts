import { describe, expect, it } from "vitest";
import { textareaCoordinateBridge } from "../apps/web/textarea-coordinates.ts";

describe("textarea canonical UTF-16 coordinates", () => {
  it("maps the browser-observed phone positions after CRLF and emoji", () => {
    const phone = "13800138000";
    const first = textareaCoordinateBridge(`A\r\n${phone}`, `A\n${phone}`);
    expect(first.toTextarea(3)).toBe(2);
    expect(first.toCanonical(2)).toBe(3);
    const emoji = textareaCoordinateBridge(`😀\r\n${phone}`, `😀\n${phone}`);
    expect(emoji.toTextarea(4)).toBe(3);
    expect(emoji.toCanonical(3)).toBe(4);
    const loneCr = textareaCoordinateBridge(`A\r${phone}`, `A\n${phone}`);
    expect(loneCr.toTextarea(2)).toBe(2);
  });

  it("maps mixed CRLF, CR, LF and surrogate code units against fixed offsets", () => {
    const canonical = "甲\r\n😀乙\r丙\n丁";
    const dom = "甲\n😀乙\n丙\n丁";
    const bridge = textareaCoordinateBridge(canonical, dom);
    expect(canonical.length).toBe(10);
    expect(dom.length).toBe(9);
    expect([0, 1, 3, 4, 5, 6, 7, 8, 9, 10].map(bridge.toTextarea)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(bridge.toCanonical)).toEqual([0, 1, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(bridge.toTextarea(4)).toBe(3); // between surrogate code units is still a UTF-16 boundary
    expect(bridge.toCanonical(3)).toBe(4);
    expect(() => bridge.toTextarea(2)).toThrow("TEXTAREA_CRLF_INTERIOR_UNREPRESENTABLE");
  });

  it("shifts a paged window by its canonical prefix without counting earlier line endings again", () => {
    const prefix = 4096;
    const text = "A\r\nB\rC\n😀Z";
    const bridge = textareaCoordinateBridge(text, "A\nB\nC\n😀Z");
    const canonicalRange: [number, number] = [prefix + 3, prefix + 9]; // B through emoji
    const domRange = canonicalRange.map(offset => bridge.toTextarea(offset - prefix));
    expect(domRange).toEqual([2, 8]);
    expect(domRange.map(index => prefix + bridge.toCanonical(index))).toEqual(canonicalRange);
  });

  it("round trips every representable boundary and rejects stale values or invalid offsets", () => {
    const text = "\r\nX\rY\n😀";
    const dom = "\nX\nY\n😀";
    const bridge = textareaCoordinateBridge(text, dom);
    for (let i = 0; i <= dom.length; i++) expect(bridge.toTextarea(bridge.toCanonical(i))).toBe(i);
    for (let i = 0; i <= text.length; i++) if (i !== 1) expect(bridge.toCanonical(bridge.toTextarea(i))).toBe(i);
    for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, text.length + 1])
      expect(() => bridge.toTextarea(invalid)).toThrow("TEXTAREA_OFFSET_INVALID");
    for (const invalid of [-1, 0.5, Number.NaN, dom.length + 1])
      expect(() => bridge.toCanonical(invalid)).toThrow("TEXTAREA_OFFSET_INVALID");
    expect(() => textareaCoordinateBridge(text, text)).toThrow("TEXTAREA_VALUE_MISMATCH");
    expect(textareaCoordinateBridge("", "").toCanonical(0)).toBe(0);
  });
});
