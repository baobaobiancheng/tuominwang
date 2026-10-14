import { test, expect } from "vitest";
import { textWindow } from "../packages/core/text-window.ts";
import { detect, redact } from "../packages/core/redaction.ts";
import { MAX_MARKS, TEXT_PAGE_CHARS } from "../packages/contracts/index.ts";
import { seal } from "../packages/adapters/storage.ts";
import { runProcessing } from "../packages/adapters/processing.ts";

test("large text windows preserve global positions and never split a surrogate pair", () => {
  const text = "x".repeat(TEXT_PAGE_CHARS - 1) + "😀" + "y".repeat(110000);
  const page = textWindow(text, 0);
  expect(page.text.isWellFormed()).toBe(true);
  expect(page.nextTextOffset).toBe(TEXT_PAGE_CHARS + 1);
  const middle = textWindow(text, TEXT_PAGE_CHARS);
  expect(middle.textOffset).toBe(TEXT_PAGE_CHARS - 1);
  expect(middle.text.startsWith("😀")).toBe(true);
  const reconstructed: string[] = [];
  let offset = 0;
  do { const next = textWindow(text, offset); reconstructed.push(next.text); if (next.nextTextOffset === null) break; offset = next.nextTextOffset; } while (true);
  expect(reconstructed.join("")).toBe(text);
});
test("candidate excess is rejected rather than silently truncating", () => {
  expect(() => detect("13800138000 ".repeat(MAX_MARKS + 1))).toThrow("MARK_LIMIT");
  const source = "前 13800138000 后 13900139000 尾";
  const marks = detect(source).map(m => ({ ...m, decision: "redact" as const }));
  expect(redact(source, marks)).toBe("前 【手机号】 后 【手机号】 尾");
});
test("isolated processing terminates on cancellation and timeout, then remains usable", async () => {
  expect(process.env.ORT_DISABLE_TELEMETRY).toBe("1");
  process.env.DATA_KEY = "a".repeat(64);
  const doc = { id: "d", tenant_id: "t", project_id: "p", content: seal("sample", "t:p:d"), marks: [] };
  const controller = new AbortController();
  const cancelled = runProcessing({ kind: "view", doc }, { signal: controller.signal });
  controller.abort();
  await expect(cancelled).rejects.toThrow("PROCESSING_CANCELLED");
  await expect(runProcessing({ kind: "view", doc }, { timeoutMs: 1 })).rejects.toThrow("PROCESSING_TIMEOUT");
  await expect(runProcessing({ kind: "view", doc })).resolves.toMatchObject({ text: "sample", textLength: 6 });
});
