import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { canonicalVisualResult, coloredSealCandidates, suppressOverlaps, detectVisual, type VisualCandidate } from "../packages/core/visual-detection.ts";
describe("visual proposals", () => {
  it("finds two separated colored stamps but not a solid logo or black text", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"><rect width="500" height="700" fill="white"/><circle cx="100" cy="550" r="45" fill="none" stroke="red" stroke-width="5"/><circle cx="350" cy="400" r="40" fill="none" stroke="blue" stroke-width="5"/><rect x="300" y="50" width="60" height="60" fill="red"/><text x="20" y="50" fill="black">PRIVATE</text></svg>`;
    const bytes = await sharp(Buffer.from(svg)).png().toBuffer(), result = await detectVisual(bytes, ["seal"]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every(c => c.reason === "印章")).toBe(true);
    expect(result.candidates.some(c => c.x < 55 && c.x + c.width > 145 && c.y < 505)).toBe(true);
  });
  it("rejects invalid buffers and blank pages", () => {
    expect(() => coloredSealCandidates(new Uint8Array(1), 20, 20)).toThrow("VISUAL_INPUT_INVALID");
    expect(coloredSealCandidates(new Uint8Array(40 * 40 * 3).fill(255), 40, 40)).toEqual([]);
  });
  it("suppresses overlapping same type proposals, preserves different types", () => {
    const b: VisualCandidate = { x: 1, y: 2, width: 20, height: 30, reason: "人脸", score: .8, detector: "test" };
    expect(suppressOverlaps([b, { ...b, score: .9 }, { ...b, reason: "印章" }])).toHaveLength(2);
  });
});

it("maps a 2x raster PDF candidate into canonical page coordinates", () => {
 const result = canonicalVisualResult({ width: 1200, height: 1600, faceVersion: undefined, sealVersion: "test", candidates: [{ x: 1000, y: 1400, width: 200, height: 200, reason: "印章", score: .65, detector: "test" }] }, { width: 600, height: 800 });
 expect(result.candidates[0]).toMatchObject({x:500,y:700,width:100,height:100});
});
