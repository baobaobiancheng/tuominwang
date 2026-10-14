import { test, expect, vi } from "vitest";
import { processingRead } from "../apps/web/processing-read-retry.ts";
const busy = () => Object.assign(new Error("localized"), { code: "PROCESSING_BUSY" });
test("busy reads retry the same callback then return its actual result", async () => {
  vi.useFakeTimers(); try { const read = vi.fn().mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValue({ actual: true }); const result = processingRead(read, new AbortController().signal); await vi.runAllTimersAsync(); await expect(result).resolves.toEqual({ actual: true }); expect(read).toHaveBeenCalledTimes(3); } finally { vi.useRealTimers(); }
});
test("permission, version and hash errors are never retried", async () => {
  for (const code of ["VERSION_CONFLICT", "ACCESS_DENIED", "SOURCE_MISMATCH", "SESSION_EXPIRED"]) { const error = Object.assign(new Error(code), { code }), read = vi.fn().mockRejectedValue(error); await expect(processingRead(read, new AbortController().signal)).rejects.toBe(error); expect(read).toHaveBeenCalledTimes(1); }
});
test("aborting while waiting prevents all subsequent reads and clears the timer", async () => {
  vi.useFakeTimers(); try { const controller = new AbortController(), read = vi.fn().mockRejectedValue(busy()), result = processingRead(read, controller.signal), rejection = expect(result).rejects.toHaveProperty("name", "AbortError"); await Promise.resolve(); controller.abort(); await rejection; await vi.runAllTimersAsync(); expect(read).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0); } finally { vi.useRealTimers(); }
});
test("a stale in-flight response is rejected after cancellation", async () => {
  const controller = new AbortController(); let complete!: (v: string) => void; const result = processingRead(() => new Promise<string>(resolve => { complete = resolve; }), controller.signal), rejection = expect(result).rejects.toHaveProperty("name", "AbortError"); controller.abort(); complete("old-document"); await rejection;
});
