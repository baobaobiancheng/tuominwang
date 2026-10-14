import { test, expect } from "vitest";
import { MAX_MARKS, TEXT_MAX_BYTES, REVIEW_BODY_BYTES, reviewSchema } from "../packages/contracts/index.ts";
import {
  detect,
  redact,
  verify,
  validId,
  validateMarks,
} from "../packages/core/redaction.ts";
import {
  seal,
  unseal,
  passwordHash,
  passwordMatches,
} from "../packages/adapters/storage.ts";
test("bounded email rule tolerates maximum-length non-matching input", () => {
  expect(detect("%".repeat(102400))).toHaveLength(0);
  expect(detect("a".repeat(102400))).toHaveLength(0);
});
test("all dense 100 KiB detections fit the review contract and request budget", () => {
  for (const sample of ["13800138000 ", "a@b.co ", "11010519491231002X "]) {
    const text = sample.repeat(Math.floor(TEXT_MAX_BYTES / sample.length));
    const marks = detect(text).map(m => ({ ...m, decision: "redact" as const }));
    expect(marks.length).toBeGreaterThan(5000);
    const body = reviewSchema.parse({ revision: 0, marks });
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(REVIEW_BODY_BYTES);
  }
  expect(reviewSchema.safeParse({ revision: 0, marks: Array(MAX_MARKS + 1).fill({ start: 0, end: 1, kind: "自定义", decision: "ignore" }) }).success).toBe(false);
});
test("rules return UTF-16 offsets and checksum-valid IDs", () => {
  const text =
    "😀张三：13800138000；邮箱 demo@example.com；证件11010519491231002X";
  const marks = detect(text);
  expect(marks.map((m) => text.slice(m.start, m.end))).toEqual([
    "13800138000",
    "demo@example.com",
    "11010519491231002X",
  ]);
  expect(marks[0].start).toBe(5);
  expect(validId("11010519491231002X")).toBe(true);
  expect(validId("11010519490231002X")).toBe(false);
  expect(detect("123138001380001 110105194912310021")).toHaveLength(0);
});
test("pending, overlap and surrogate boundaries block export", () => {
  expect(() => redact("13800138000", detect("13800138000"))).toThrow(
    "INVALID_MARKS",
  );
  expect(() =>
    validateMarks("😀A", [
      { start: 1, end: 2, kind: "自定义", decision: "redact" },
    ]),
  ).toThrow();
  expect(() =>
    redact("abc", [
      { start: 0, end: 2, kind: "自定义", decision: "redact" },
      { start: 1, end: 3, kind: "自定义", decision: "redact" },
    ]),
  ).toThrow("OVERLAPPING_MARKS");
});
test("actual export has no chosen residue; duplicates must be handled", () => {
  const text = "联系13800138000";
  const marks = detect(text).map((m) => ({
    ...m,
    decision: "redact" as const,
  }));
  expect(redact(text, marks)).toBe("联系【手机号】");
  expect(() => verify(text, marks, "联系【手机号】")).not.toThrow();
  expect(() => verify(text, marks, text)).toThrow("ARTIFACT_MISMATCH");
  const duplicated = "13800138000 13800138000";
  expect(() =>
    verify(
      duplicated,
      marks.map((m) => ({ ...m, start: 0, end: 11 })),
      redact(
        duplicated,
        marks.map((m) => ({ ...m, start: 0, end: 11 })),
      ),
    ),
  ).toThrow("RESIDUE_FOUND");
});
test("encrypted assets bind context and reject tampering", () => {
  process.env.DATA_KEY = "a".repeat(64);
  const encrypted = seal("原文secret", "tenant:doc");
  expect(encrypted).not.toContain("secret");
  expect(unseal(encrypted, "tenant:doc")).toBe("原文secret");
  expect(() => unseal(encrypted, "other")).toThrow();
  const pw = passwordHash("long-secret-password");
  expect(passwordMatches("long-secret-password", pw)).toBe(true);
  expect(passwordMatches("wrong-password", pw)).toBe(false);
});
