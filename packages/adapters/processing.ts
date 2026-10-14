import type { OcrCorrectionInput } from "../contracts/ocr.ts";
import { Worker } from "node:worker_threads";
import type { Mark, DictionaryEntry } from "../contracts/index.ts";
import type { SearchScope, SearchSpan } from "../core/review-tools.ts";
import type { Mapping } from "../core/mappings.ts";
import { withHeavySlot } from "./db.ts";
// Native getenv in a worker observes the process environment, not only the JS worker's copy.
process.env.ORT_DISABLE_TELEMETRY = "1";
export type ProcessingInput = { kind: "detect" | "export" | "view" | "review" | "verify" | "gate" | "page" | "page-preview" | "preview" | "search" | "known-entities" | "mapping-value" | "visual-detect" | "docx-layout" | "ocr-text" | "ocr-correct"; doc: any; snapshot?: any; offset?: number; query?: string; searchScope?: SearchScope; searchSpans?: SearchSpan[]; detectors?: ("face" | "seal")[]; correction?: OcrCorrectionInput; page?: number; marks?: Mark[]; mappings?: Mapping[]; artifact?: { id: string; hash: string } }
  | { kind: "download"; artifact: { id: string; hash: string; format?: string } }
  | { kind: "dictionary-import"; bytes: Uint8Array }
  | { kind: "dictionary-export"; entries: DictionaryEntry[] };

// A real worker thread keeps parser/crypto CPU work away from HTTP and lease heartbeats.
type ProcessingOptions = { signal?: AbortSignal; timeoutMs?: number; heavySlotHeld?: boolean };
export function runProcessing<T>(input: ProcessingInput, options: ProcessingOptions = {}): Promise<T> {
  if (!options.heavySlotHeld && ["docx-layout", "ocr-correct", "visual-detect", "detect", "export", "verify", "page-preview", "search", "known-entities", "dictionary-import", "dictionary-export"].includes(input.kind)) return withHeavySlot(signal => runThread<T>(input, { ...options, signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal }));
  return runThread<T>(input, options);
}
function runThread<T>(input: ProcessingInput, options: ProcessingOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("PROCESSING_CANCELLED")); return; }
    const worker = new Worker(new URL("./processing-worker.ts", import.meta.url), {
      workerData: input, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 32 },
      env: { ORT_DISABLE_TELEMETRY: "1", DATA_KEY: process.env.DATA_KEY ?? "", DATA_DIR: process.env.DATA_DIR ?? ".data/files", VISUAL_MODEL_DIR: process.env.VISUAL_MODEL_DIR ?? ".data/models/visual", OCR_MODEL_DIR: process.env.OCR_MODEL_DIR ?? ".data/models/ocr", NER_MODEL_DIR: process.env.NER_MODEL_DIR ?? ".data/models/ner" },
    });
    let settled = false;
    const finish = async (error?: Error, result?: T) => {
      if (settled) return;
      settled = true; clearTimeout(timer); options.signal?.removeEventListener("abort", abort);
      try { await worker.terminate(); } catch { reject(error ?? new Error("PROCESSING_FAILED")); return; }
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => void finish(new Error("PROCESSING_CANCELLED"));
    const timer = setTimeout(() => void finish(new Error("PROCESSING_TIMEOUT")), options.timeoutMs ?? ("doc" in input && ["detect", "export", "verify"].includes(input.kind) && ["pdf", "docx"].includes(input.doc.source_format) ? 1800000 : 120000));
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.once("message", (result: { ok: boolean; value?: T; code?: string }) => void finish(result.ok ? undefined : new Error(result.code ?? "PROCESSING_FAILED"), result.value));
    worker.once("error", error => void finish(new Error((error as NodeJS.ErrnoException).code === "ERR_WORKER_OUT_OF_MEMORY" ? "PROCESSING_MEMORY_LIMIT" : "PROCESSING_FAILED")));
    worker.once("exit", () => { if (!settled) void finish(new Error("PROCESSING_FAILED")); });
    if (options.signal?.aborted) abort();
  });
}
