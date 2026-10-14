import { describe, it, expect } from "vitest";
import { applyReplacementPolicies } from "../packages/core/replacement-policies.ts";
import { replacementFor } from "../packages/core/redaction.ts";
import type { Mark } from "../packages/contracts/index.ts";
const text = "😀张三张三李四13800138000";
const marks: Mark[] = [{ start: 2, end: 4, kind: "姓名", decision: "pending" }, { start: 4, end: 6, kind: "姓名", decision: "redact" }, { start: 6, end: 8, kind: "姓名", decision: "ignore" }, { start: 8, end: 19, kind: "手机号", decision: "pending" }];
describe("layered policies bind exact original values and preserve review decisions", () => {
  it("uses same-value override above type above overall across repeated occurrences", () => {
    const result = applyReplacementPolicies(text, marks, { overall: { mode: "full" }, types: [{ kind: "姓名", rule: { mode: "custom", value: "某人" } }], values: [{ start: 2, end: 4, kind: "姓名", rule: { mode: "type" } }], keepExplicit: true });
    expect(result.marks.map(m => m.decision)).toEqual(marks.map(m => m.decision));
    expect(result.marks[0].replacementOrigin).toBe("value"); expect(result.marks[1].replacementOrigin).toBe("value"); expect(result.marks[2]).toBe(marks[2]);
    expect(replacementFor(text, result.marks[3])).toBe("***********");
  });
  it("keeps manual exceptions until explicit overwrite but allows changing inherited policies", () => {
    const input: Mark[] = marks.map((m, i) => i < 2 ? { ...m, replacement: { mode: "custom", value: "已隐藏" }, replacementOrigin: i ? "overall" : "manual" } : m);
    const policies = { overall: { mode: "full" as const }, types: [], values: [], keepExplicit: true };
    expect(applyReplacementPolicies(text, input, policies).marks[0]).toBe(input[0]);
    expect(applyReplacementPolicies(text, input, policies).marks[1].replacement).toEqual({ mode: "full" });
    expect(applyReplacementPolicies(text, input, { ...policies, keepExplicit: false }).marks[0].replacement).toEqual({ mode: "full" });
  });
  it("rejects contradictory policies for identical values and references outside the draft", () => {
    expect(() => applyReplacementPolicies(text, marks, { types: [], values: [{ start: 2, end: 4, kind: "姓名", rule: { mode: "type" } }, { start: 4, end: 6, kind: "姓名", rule: { mode: "full" } }], keepExplicit: true })).toThrow("POLICY_VALUE_CONFLICT");
    expect(() => applyReplacementPolicies(text, marks, { types: [], values: [{ start: 0, end: 2, kind: "姓名", rule: { mode: "type" } }], keepExplicit: true })).toThrow("POLICY_TARGET_NOT_FOUND");
  });
  it("requests one immutable mapping for repeated values and rejects conflicting tokens", () => {
    const policies = { overall: { mode: "alias" as const }, types: [], values: [], keepExplicit: true };
    expect(applyReplacementPolicies(text, marks, policies).aliasRequests).toEqual([{ kind: "姓名", value: "张三" }, { kind: "手机号", value: "13800138000" }]);
    const mapping = { id: "862d817a-c27c-40b6-8f20-889339ed9e14", value: "张三", kind: "姓名" as const, token: "【姓名_000001】", version: 1 as const };
    expect(applyReplacementPolicies(text, marks, policies, [mapping]).marks[1].replacement).toMatchObject({ mode: "alias", token: mapping.token });
    expect(() => applyReplacementPolicies(text, marks, policies, [mapping, { ...mapping, token: "【姓名_000002】" }])).toThrow("AMBIGUOUS_MAPPING");
  });
  it("counts emoji as one star and rejects a mask that retains the full original", () => {
    expect(replacementFor(text, { start: 0, end: 4, kind: "自定义", decision: "redact", replacement: { mode: "full" } })).toBe("***");
    expect(() => applyReplacementPolicies(text, marks, { overall: { mode: "mask", prefix: 2, suffix: 0 }, types: [], values: [], keepExplicit: true })).toThrow("INVALID_REPLACEMENT");
  });
});
