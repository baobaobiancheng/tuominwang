import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { bottomSealCandidates, filterCertificateSealCandidates, hasPossibleSealInk, monochromeSealCandidates, possibleSealInk, signatureCandidates } from "../packages/core/visual-morphology.ts";
import { detectVisual, canonicalVisualResult } from "../packages/core/visual-detection.ts";
import { pdfImageSealShape } from "../packages/core/visual-pdf.ts";
async function fixture(body: string, width = 500, height = 700) {
  const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/>${body}</svg>`)).png().toBuffer();
  const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { png, data, width, height };
}
describe("complete observed visual branches and independent proposals", () => {
  it("matches HSV ink guard's red/blue/low-saturation boundaries and eight-pixel minimum", () => {
    expect(possibleSealInk(255, 0, 0)).toBe(true); expect(possibleSealInk(0, 0, 255)).toBe(true); expect(possibleSealInk(30, 0, 0)).toBe(false); expect(possibleSealInk(100, 90, 90)).toBe(false);
    const a = new Uint8Array(8 * 3); for (let i = 0; i < 8; i++) a[i * 3] = 255;
    expect(hasPossibleSealInk(a)).toBe(true); expect(hasPossibleSealInk(a.subarray(0, 21))).toBe(false); expect(hasPossibleSealInk(new Uint8Array(1))).toBe(true);
  });
  it("includes bottom-page fallback but rejects top ink and pages with distant scattered ink", async () => {
    const f = await fixture('<circle cx="250" cy="555" r="40" fill="none" stroke="red" stroke-width="6"/>');
    expect(bottomSealCandidates(f.data, f.width, f.height)).toHaveLength(1);
    const top = await fixture('<circle cx="250" cy="155" r="40" fill="none" stroke="red" stroke-width="6"/>'); expect(bottomSealCandidates(top.data, top.width, top.height)).toEqual([]);
    const scattered = await fixture('<circle cx="50" cy="555" r="40" fill="none" stroke="red" stroke-width="6"/><circle cx="450" cy="555" r="40" fill="none" stroke="red" stroke-width="6"/>'); expect(bottomSealCandidates(scattered.data, scattered.width, scattered.height)).toEqual([]);
  });
  it("finds black and gray closed rings while rejecting text, solid logos and table lines", async () => {
    const f = await fixture('<circle cx="100" cy="550" r="40" fill="none" stroke="black" stroke-width="5"/><ellipse cx="350" cy="400" rx="50" ry="40" fill="none" stroke="#888" stroke-width="5"/><rect x="250" y="50" width="60" height="60" fill="black"/><path d="M20 200H480 M20 250H480" stroke="black" stroke-width="2"/><text x="20" y="40">PRIVATE</text>');
    expect(monochromeSealCandidates(f.data, f.width, f.height)).toHaveLength(2);
    const output = await detectVisual(f.png, ["seal"]); expect(output.candidates).toHaveLength(2); expect(output.sealVersion).toContain("monochrome");
  });
  it("joins interrupted gray contours and includes square seals with interior ink", async () => {
    const f = await fixture('<circle cx="100" cy="550" r="40" fill="none" stroke="#aaa" stroke-width="4" stroke-dasharray="15 8"/><rect x="300" y="350" width="90" height="90" fill="none" stroke="black" stroke-width="4"/><text x="314" y="405" font-size="24">ABC</text>');
    expect(monochromeSealCandidates(f.data, f.width, f.height)).toHaveLength(2);
  });
  it("proposes curved connected handwriting and rejects a straight underline", async () => {
    const f = await fixture('<path d="M70 520C105 480 65 590 130 540S155 480 180 530S220 590 260 520" fill="none" stroke="black" stroke-width="3"/><path d="M50 610H300" stroke="black" stroke-width="4"/>');
    const boxes = signatureCandidates(f.data, f.width, f.height); expect(boxes).toHaveLength(1); expect(boxes[0].reason).toBe("签名");
    expect((await detectVisual(f.png, ["signature"])).signatureVersion).toBe("yolos-tiny-signature-b788cf7-onnx17-f32-v1");
  });
  it("rejects duplicate/unknown/empty selectors and maps signature preview coordinates", async () => {
    const f = await fixture(""); await expect(detectVisual(f.png, [])).rejects.toThrow("VISUAL_INPUT_INVALID"); await expect(detectVisual(f.png, ["seal", "seal"])).rejects.toThrow("VISUAL_INPUT_INVALID");
    const boxes = canonicalVisualResult({ width: 1000, height: 1400, candidates: [{ x: 100, y: 600, width: 80, height: 40, reason: "签名", score: .45, detector: "test" }], faceVersion: undefined, sealVersion: undefined, signatureVersion: "test" }, { width: 500, height: 700 });
    expect(boxes.candidates[0]).toMatchObject({ x: 50, y: 300, width: 40, height: 20 });
  });
  it("retains certificate exclusion evidence and preserves manual recovery for identity/business documents", () => {
    const b = { x: 310, y: 420, width: 60, height: 60, reason: "印章" as const, score: .65, detector: "test" };
    const identity = filterCertificateSealCandidates([b], { text: "居民身份证", filename: "x.png" }, { width: 500, height: 700 });
    expect(identity.candidates).toHaveLength(0); expect(identity.excludedCandidates[0].exclusion).toBe("身份证章图案排除");
    const business = filterCertificateSealCandidates([b, { ...b, y: 10 }, { ...b, x: 10 }], { text: "营业执照", filename: "x.png" }, { width: 500, height: 700 });
    expect(business.candidates).toHaveLength(1); expect(business.excludedCandidates).toHaveLength(2);
    expect(filterCertificateSealCandidates([b], { text: "合同", filename: "x.png" }, { width: 500, height: 700 }).candidates).toHaveLength(1);
  });
  it("includes only lower-page, plausible-size embedded PDF image shapes", () => {
    expect(pdfImageSealShape({ x: 200, y: 450, width: 100, height: 100 }, 600, 800)).toBe(true);
    expect(pdfImageSealShape({ x: 200, y: 10, width: 100, height: 100 }, 600, 800)).toBe(false);
    expect(pdfImageSealShape({ x: 0, y: 0, width: 600, height: 800 }, 600, 800)).toBe(false);
  });
});
