import { test, expect } from "vitest";
import { redact, replacementFor, verify } from "../packages/core/redaction.ts";
import { checkKnownEntities, previewText, searchText } from "../packages/core/review-tools.ts";
import { MAX_MARKS, markSchema, type Mark } from "../packages/contracts/index.ts";

test("partial and custom replacements share Unicode-safe validation and keep old type marks compatible", () => {
  const text = "😀甲乙丙丁🙂", base: Mark = { start: 0, end: text.length, kind: "姓名", decision: "redact" };
  const mask: Mark = { ...base, replacement: { mode: "mask", prefix: 2, suffix: 1 } };
  expect(redact(text, [mask])).toBe("😀甲***🙂");
  expect(() => verify(text, [mask], "😀甲***🙂")).not.toThrow();
  expect(redact(text, [base])).toBe("【姓名】");
  expect(redact(text, [{ ...base, replacement: { mode: "custom", value: "客户甲" } }])).toBe("客户甲");
  expect(() => replacementFor(text, { ...base, replacement: { mode: "mask", prefix: 5, suffix: 1 } })).toThrow("INVALID_REPLACEMENT");
  expect(() => replacementFor(text, { ...base, replacement: { mode: "custom", value: text } })).toThrow("INVALID_REPLACEMENT");
  expect(markSchema.safeParse({ ...base, replacement: { mode: "custom", value: "【MAP_1】" } }).success).toBe(false);
  expect(markSchema.safeParse({ ...base, replacement: { mode: "custom", value: "<script>" } }).success).toBe(false);
  const huge = "😀".repeat(100000);
  expect(replacementFor(huge, { ...base, end: huge.length, replacement: { mode: "mask", prefix: 100, suffix: 100 } })).toBe("😀".repeat(100) + "***" + "😀".repeat(100));
});
test("draft previews leave pending values visible and never reveal selected content crossing a text window", () => {
  const text = "13800138000 13900139000", marks: Mark[] = [
    { start: 0, end: 11, kind: "手机号", decision: "redact", replacement: { mode: "mask", prefix: 3, suffix: 4 } },
    { start: 12, end: 23, kind: "手机号", decision: "pending" },
  ];
  expect(previewText(text, marks, 0).text).toBe("138***8000 13900139000");
  const large = "x".repeat(120000), cross: Mark = { start: 32760, end: 32780, kind: "自定义", decision: "redact" };
  expect(previewText(large, [cross], 32768).text.startsWith("【自定义】")).toBe(true);
  expect(() => previewText(text, [...marks, { ...marks[0], start: 3 }], 0)).toThrow("OVERLAPPING_MARKS");
});
test("search is literal, bounded, paginated and located in original UTF-16 coordinates", () => {
  const text = "😀" + "客户甲 ".repeat(120);
  const first = searchText(text, "客户甲", 0), second = searchText(text, "客户甲", first.next!);
  expect(first.matches).toHaveLength(50); expect(first.matches[0].start).toBe(2);
  expect(second.matches[0].start).toBe(202);
  const last = searchText(text, "客户甲", second.next!);
  expect(last.matches).toHaveLength(20); expect(last.next).toBeNull();
  expect(searchText(text, ".*", 0).matches).toHaveLength(0);
  expect(() => searchText(text, "", 0)).toThrow("INVALID_SEARCH");
});
test("search scopes cover the full document, paginate qualifying hits and do not mutate the draft", () => {
  const text = "😀" + "客户甲 ".repeat(60) + "x".repeat(40000) + "客户甲 ".repeat(52);
  const tail = 2 + 60 * 4 + 40000;
  const marks: Mark[] = Array.from({ length: 52 }, (_, i) => ({ start: tail + i * 4, end: tail + i * 4 + 3, kind: "姓名", decision: "pending" }));
  const snapshot = structuredClone(marks);
  const first = searchText(text, "客户甲", 0, "inside", marks);
  expect(first.matches).toHaveLength(50); expect(first.matches[0].start).toBe(tail);
  const last = searchText(text, "客户甲", first.next!, "inside", marks);
  expect(last.matches.map(m => m.start)).toEqual([tail + 200, tail + 204]); expect(last.next).toBeNull();
  const outside = searchText(text, "客户甲", 0, "outside", marks);
  expect(outside.matches).toHaveLength(50);
  expect(searchText(text, "客户甲", outside.next!, "outside", marks).matches).toHaveLength(10);
  // An exact page of qualifying hits followed only by filtered hits is terminal.
  expect(searchText(text, "客户甲", tail + 8, "inside", marks).next).toBeNull();
  expect(marks).toEqual(snapshot);
});
test("inside requires one covering non-ignored span, including nested overlaps but never adjacent unions", () => {
  const text = "甲乙丙|甲乙丙|甲乙丙|甲乙丙";
  const spans: Parameters<typeof searchText>[4] = [
    { start: 0, end: 3, decision: "ignore" },
    { start: 4, end: 6, decision: "pending" }, // partial coverage
    { start: 8, end: 9, decision: "redact" }, { start: 9, end: 11, decision: "redact" }, // adjacent union
    { start: 12, end: 15, decision: "pending" }, { start: 12, end: 13, decision: "redact" }, // nested coverage
  ];
  expect(searchText(text, "甲乙丙", 0, "inside", spans).matches.map(m => m.start)).toEqual([12]);
  expect(searchText(text, "甲乙丙", 0, "outside", spans).matches.map(m => m.start)).toEqual([0, 4, 8]);
  expect(searchText(text, "甲乙丙", 0, "inside", []).matches).toEqual([]);
});
test("scoped search rejects oversized, invalid and Unicode-splitting draft ranges", () => {
  const text = "😀姓名";
  for (const span of [
    { start: -1, end: 2 }, { start: 0, end: 1 }, { start: 1, end: 2 },
    { start: 2, end: 20 }, { start: 2, end: 2 }, { start: 2.5, end: 3 },
  ]) expect(() => searchText(text, "姓名", 0, "inside", [{ ...span, decision: "pending" }])).toThrow("INVALID_MARKS");
  expect(() => searchText(text, "姓名", 0, "inside", Array.from({ length: MAX_MARKS + 1 }, () => ({ start: 2, end: 4, decision: "pending" })))).toThrow("INVALID_MARKS");
});
test("known entity checks scan beyond the visible window and preserve reviewed/whitelisted positions and alias policies", () => {
  const value = "合成客户😀", text = `😀${value}|${value}|${value}|` + "x".repeat(40000) + value;
  const starts = [2, 2 + value.length + 1, 2 + (value.length + 1) * 2, text.length - value.length];
  const alias: NonNullable<Mark["replacement"]> = { mode: "alias", mappingId: "00000000-0000-4000-8000-000000000001", version: 1, token: "【姓名_000001】" };
  const marks: Mark[] = [
    { start: starts[0], end: starts[0] + value.length, kind: "姓名", decision: "redact", replacement: alias },
    { start: starts[1], end: starts[1] + value.length, kind: "姓名", decision: "ignore" },
    { start: starts[2], end: starts[2] + value.length, kind: "姓名", decision: "pending", sources: [{ layer: "rules", code: "project-whitelist" }] },
  ];
  const original = structuredClone(marks), checked = checkKnownEntities(text, marks, "txt", []);
  expect(checked.entities[0].matches.map(m => m.status)).toEqual(["marked", "retained", "retained", "missing"]);
  expect(checked.additions).toEqual([{ start: starts[3], end: text.length, kind: "姓名", decision: "pending", replacement: alias, sources: [{ layer: "manual", code: "known-entity-check" }] }]);
  expect(marks).toEqual(original);
  expect(checkKnownEntities(text, [...marks, ...checked.additions], "txt", []).additions).toEqual([]);
});
test("same-value strategy ambiguity, existing partial overlaps, competing additions and cross-cell matches need review", () => {
  const text = "甲乙|甲乙|甲乙", marks: Mark[] = [
    { start: 0, end: 2, kind: "姓名", decision: "redact", replacement: { mode: "custom", value: "客户A" } },
    { start: 3, end: 5, kind: "姓名", decision: "pending", replacement: { mode: "custom", value: "客户B" } },
  ];
  const ambiguous = checkKnownEntities(text, marks, "txt", []);
  expect(ambiguous.entities[0].ambiguous).toBe(true);
  expect(ambiguous.entities[0].matches.at(-1)?.status).toBe("conflict"); expect(ambiguous.additions).toEqual([]);
  const partial = checkKnownEntities(text, [marks[0], { start: 6, end: 7, kind: "姓名", decision: "ignore" }], "txt", []);
  expect(partial.entities[0].matches.at(-1)?.status).toBe("conflict"); expect(partial.additions.map(m => m.start)).toEqual([3]);
  const competing = checkKnownEntities("甲乙|乙丙|甲乙丙", [
    { start: 0, end: 2, kind: "姓名", decision: "pending" }, { start: 3, end: 5, kind: "姓名", decision: "pending" },
  ], "txt", []);
  expect(competing.entities.map(e => e.matches.at(-1)?.status)).toEqual(["conflict", "conflict"]); expect(competing.additions).toEqual([]);
  const cells = checkKnownEntities("甲\n乙|甲\n乙", [{ start: 0, end: 3, kind: "自定义", decision: "pending" }], "csv", [
    { kind: "cell", start: 0, end: 3 }, { kind: "cell", start: 4, end: 5 }, { kind: "cell", start: 6, end: 7 },
  ]);
  expect(cells.entities[0].matches.at(-1)?.status).toBe("conflict"); expect(cells.additions).toEqual([]);
});
test("known entity check limits fail explicitly instead of returning partial coverage", () => {
  expect(() => checkKnownEntities("甲".repeat(2001), [{ start: 0, end: 2001, kind: "自定义", decision: "pending" }], "txt", [])).toThrow("KNOWN_ENTITY_VALUE_LIMIT");
  expect(() => checkKnownEntities("甲 ".repeat(MAX_MARKS + 1), [{ start: 0, end: 1, kind: "姓名", decision: "pending" }], "txt", [])).toThrow("MARK_LIMIT");
  const values = Array.from({ length: 1001 }, (_, i) => `实体${String(i).padStart(4, "0")}`), text = values.join("|") + "x".repeat(100000);
  const marks = values.map((value, i): Mark => ({ start: i * 7, end: i * 7 + value.length, kind: "姓名", decision: "pending" }));
  expect(() => checkKnownEntities(text, marks, "txt", [])).toThrow("KNOWN_ENTITY_SCAN_LIMIT");
});
