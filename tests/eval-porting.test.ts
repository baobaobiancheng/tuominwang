import { describe, it, expect } from "vitest";
import { metrics, scoreSpans } from "../scripts/eval-porting.ts";

describe("independent evaluation accounting", () => {
  it("counts exact spans and duplicate predictions once, with separate type errors", () => {
    const result = scoreSpans("甲张三乙", [{ start: 1, end: 3, kind: "姓名" }], [{ start: 1, end: 3, kind: "机构" }, { start: 1, end: 3, kind: "机构" }]);
    expect(result.exactTypeSpan).toMatchObject({ tp: 0, fp: 1, fn: 1, f1: 0 });
    expect(result.exactSpanIgnoringType.tp).toBe(1);
    expect(result.sensitiveUtf16Coverage.recall).toBe(1);
  });
  it("does not let a single large prediction claim two gold spans", () => {
    const result = scoreSpans("张三李四", [{ start: 0, end: 2, kind: "姓名" }, { start: 2, end: 4, kind: "姓名" }], [{ start: 0, end: 4, kind: "姓名" }]);
    expect(result.overlapTypeIoU50).toMatchObject({ tp: 1, fp: 0, fn: 1 });
    expect(result.exactTypeSpan).toMatchObject({ tp: 0, fp: 1, fn: 2 });
  });
  it("uses maximum matching rather than order-dependent greedy overlap", () => {
    const result = scoreSpans("abcdefgh", [{ start: 0, end: 4, kind: "姓名" }, { start: 2, end: 6, kind: "姓名" }], [{ start: 0, end: 6, kind: "姓名" }, { start: 0, end: 3, kind: "姓名" }]);
    expect(result.overlapTypeIoU50.tp).toBe(2);
  });
  it("rejects offsets that split surrogate pairs and preserves UTF-16 units", () => {
    expect(() => scoreSpans("😀张三", [{ start: 1, end: 4, kind: "姓名" }], [])).toThrow("INVALID_EVAL_SPAN");
    expect(scoreSpans("😀张三", [{ start: 2, end: 4, kind: "姓名" }], []).sensitiveUtf16Coverage.uncoveredUnits).toBe(2);
  });
  it("keeps undefined no-positive rates separate from zero recall", () => {
    expect(metrics(0, 0, 0)).toMatchObject({ precision: null, recall: null, f1: null });
    expect(metrics(0, 0, 1)).toMatchObject({ precision: null, recall: 0, f1: 0 });
  });
});
