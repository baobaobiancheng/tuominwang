import sharp from "sharp";
import { detectVisual, iou, type VisualCandidate } from "../packages/core/visual-detection.ts";
export type VisualEvaluationCase = { id: string; detector: "seal" | "signature"; svg: string; expected: VisualCandidate[] };
const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"><rect width="500" height="700" fill="white"/>${body}</svg>`;
const box = (x: number, y: number, width: number, height: number, reason: VisualCandidate["reason"]): VisualCandidate => ({ x, y, width, height, reason, score: 1, detector: "ground-truth" });
export function visualEvaluationCases() {
  const cases: VisualEvaluationCase[] = [];
  for (const color of ["red", "blue", "black", "#888"]) for (const radius of [20, 40, 60]) for (const y of [100, 550]) {
    cases.push({ id: `seal-${color}-${radius}-${y}`, detector: "seal", svg: wrap(`<circle cx="250" cy="${y}" r="${radius}" fill="none" stroke="${color}" stroke-width="4"/>`), expected: [box(250 - radius - 2, y - radius - 2, radius * 2 + 4, radius * 2 + 4, "印章")] });
  }
  cases.push({ id: "broken-gray-seal", detector: "seal", svg: wrap('<circle cx="250" cy="550" r="40" fill="none" stroke="#aaa" stroke-width="4" stroke-dasharray="15 8"/>'), expected: [box(208, 508, 84, 84, "印章")] });
  cases.push({ id: "square-black-seal", detector: "seal", svg: wrap('<rect x="200" y="500" width="90" height="90" fill="none" stroke="black" stroke-width="4"/><text x="214" y="555" font-size="24">ABC</text>'), expected: [box(198, 498, 94, 94, "印章")] });
  for (const shape of ["blank", "text", "lines", "solid", "empty-cell", "clock-ring"]) for (const color of ["black", "red"]) {
    const body = shape === "blank" ? "" : shape === "text" ? `<text x="80" y="550" font-size="30" fill="${color}">PUBLIC DOCUMENT</text>` : shape === "lines" ? `<path d="M50 450H400 M50 550H400 M50 450V550 M400 450V550" stroke="${color}" fill="none"/>` : shape === "solid" ? `<rect x="200" y="500" width="90" height="90" fill="${color}"/>` : shape === "empty-cell" ? `<rect x="200" y="500" width="90" height="90" fill="none" stroke="${color}" stroke-width="2"/>` : `<circle cx="250" cy="550" r="40" fill="none" stroke="${color}" stroke-width="4"/><path d="M250 515V550L275 560" stroke="${color}" stroke-width="3" fill="none"/>`;
    cases.push({ id: `negative-${shape}-${color}`, detector: "seal", svg: wrap(body), expected: [] });
  }
  for (const stroke of [1, 3, 6]) for (const angle of [-15, 0, 15]) {
    const body = `<path transform="rotate(${angle} 165 540)" d="M70 520C105 480 65 590 130 540S155 480 180 530S220 590 260 520" fill="none" stroke="black" stroke-width="${stroke}"/>`;
    // Broad known enclosing truth box; this evaluates whether the proposed region covers the synthetic writing, not semantic identity.
    cases.push({ id: `signature-${stroke}-${angle}`, detector: "signature", svg: wrap(body), expected: [box(60, 485, 215, 110, "签名")] });
  }
  for (const body of ["", '<path d="M70 540H300" stroke="black" stroke-width="4"/>', '<rect x="200" y="500" width="90" height="90" fill="black"/>', '<text x="70" y="540" font-size="32">Printed words</text>']) cases.push({ id: `signature-negative-${cases.length}`, detector: "signature", svg: wrap(body), expected: [] });
  return cases;
}
export async function evaluateVisualCases(cases = visualEvaluationCases()) {
  const results: { id: string; detector: string; expected: number; actual: number; truePositive: number; falsePositive: number; falseNegative: number; boxes: VisualCandidate[] }[] = [];
  for (const test of cases) {
    const bytes = await sharp(Buffer.from(test.svg)).png().toBuffer(), actual = (await detectVisual(bytes, [test.detector])).candidates;
    const matched = new Set<number>(); let tp = 0;
    for (const expected of test.expected) { const match = actual.findIndex((c, i) => !matched.has(i) && c.reason === expected.reason && iou(c, expected) >= .3); if (match >= 0) { tp++; matched.add(match); } }
    results.push({ id: test.id, detector: test.detector, expected: test.expected.length, actual: actual.length, truePositive: tp, falsePositive: actual.length - tp, falseNegative: test.expected.length - tp, boxes: actual });
  }
  const metrics = ["seal", "signature"].map(detector => {
    const rows = results.filter(r => r.detector === detector), tp = rows.reduce((a, b) => a + b.truePositive, 0), fp = rows.reduce((a, b) => a + b.falsePositive, 0), fn = rows.reduce((a, b) => a + b.falseNegative, 0);
    return { detector, cases: rows.length, truePositive: tp, falsePositive: fp, falseNegative: fn, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1) };
  });
  return { corpus: "deterministic synthetic SVG morphology v1", source: "tests/visual-evaluation.ts", matchingIoU: .3, claim: "Synthetic regression only. Not real-document accuracy, competitor equivalence, or a signature identity classifier.", metrics, results };
}
