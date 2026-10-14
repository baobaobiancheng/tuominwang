import { expect, test } from "vitest";
import policy from "../packages/core/export-policy.generated.js";
import { assertExportable, coverageComplete } from "../packages/core/export-gate.ts";
import { parseFile } from "../packages/core/files.ts";

function fixture(format: "txt" | "csv" = "txt") {
  const parsed = parseFile(Buffer.from(format === "csv" ? "a,b\nc,d" : "public sample"), format);
  const doc = { id: "d", tenant_id: "t", project_id: "p", revision: 2, state: "review", source_id: "s" as string | null, source_format: format as string, parse_version: 1, content_hash: "hash", marks: [] as unknown, anchors: parsed.anchors as unknown, coverage: parsed.coverage as unknown };
  const snapshot = { document_id: "d", tenant_id: "t", project_id: "p", revision: 2, parse_version: 1, content_hash: "hash", marks: [] as unknown };
  return { doc, snapshot, length: parsed.text.length };
}
test("Bend-generated runtime agrees with all 32 policy inputs", () => {
  for (let mask = 0; mask < 32; mask++) {
    const flags = Array.from({ length: 5 }, (_, i) => !!(mask & (1 << i))) as [boolean, boolean, boolean, boolean, boolean];
    expect(policy.eligible(...flags)).toBe(flags.every(Boolean));
  }
});
test("coverage bridge requires complete object inventory, rejects missing and malformed rows", () => {
  for (const format of ["txt", "csv"] as const) {
    const { doc, length } = fixture(format);
    expect(coverageComplete(doc, length)).toBe(true);
    for (const coverage of [null, [], [{ id: "text", status: "blocked" }], [{ id: "text", status: "unknown" }], [{ id: "text", status: "complete" }, { id: "text", status: "complete" }]]) {
      expect(coverageComplete({ ...doc, coverage }, length)).toBe(false);
    }
    expect(coverageComplete({ ...doc, anchors: [] }, length)).toBe(false);
    expect(coverageComplete({ ...doc, source_format: "pdf" }, length)).toBe(false);
    expect(coverageComplete(doc, length + 1)).toBe(false);
  }
  const { doc, length } = fixture("csv");
  expect(coverageComplete({ ...doc, coverage: [{ id: "row:1", status: "complete" }] }, length)).toBe(false);
  const anchors = structuredClone(doc.anchors) as any[];
  anchors[2].row = 3;
  expect(coverageComplete({ ...doc, anchors }, length)).toBe(false);
  const legacy = { ...fixture().doc, source_id: null, anchors: [], coverage: [] };
  expect(coverageComplete(legacy, 13)).toBe(true);
  expect(coverageComplete({ ...legacy, coverage: [{ id: "text", status: "blocked" }] }, 13)).toBe(false);
});
test("server facts bind decision to state, revision, content and immutable snapshot", () => {
  const { doc, snapshot, length } = fixture();
  const gate = (d = doc, revision = 2, digest = "hash", s: typeof snapshot | undefined = snapshot) => assertExportable(d, revision, length, digest, s);
  expect(() => gate()).not.toThrow();
  expect(() => gate(doc, 1)).toThrow("VERSION_CONFLICT");
  expect(() => gate({ ...doc, state: "queued" })).toThrow("DETECTION_INCOMPLETE");
  expect(() => gate({ ...doc, state: "unexpected" })).toThrow("DETECTION_INCOMPLETE");
  expect(() => gate({ ...doc, marks: [{ start: 0, end: 1, kind: "自定义", decision: "pending" }] })).toThrow("INVALID_MARKS");
  expect(() => gate({ ...doc, marks: [{ start: 0, end: 1, kind: "自定义", decision: "unrecognized" }] })).toThrow("INVALID_MARKS");
  expect(() => assertExportable(doc, 2, length, "hash", undefined)).toThrow("SNAPSHOT_MISMATCH");
  expect(() => gate(doc, 2, "changed")).toThrow("SNAPSHOT_MISMATCH");
  for (const changes of [{ document_id: "other" }, { tenant_id: "other" }, { project_id: "other" }, { revision: 1 }, { parse_version: 2 }, { content_hash: "different" }, { marks: [1] }]) {
    expect(() => gate(doc, 2, "hash", { ...snapshot, ...changes })).toThrow("SNAPSHOT_MISMATCH");
  }
});
