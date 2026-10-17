import type {PdfOcrCheckpoint} from "./pdf-ocr-checkpoints.ts";
import type{PageRotationRequest}from"../contracts/page-rotation.ts";
import {cancelConfiguredLegacyJob} from './legacy-office.ts';
import {processingDocument} from '../core/document-format.ts';
import type {FolderOutputJob,FolderReadJob} from './folder-output.ts';
import {openPageReview} from "./page-review-storage.ts";
import type {ProcessingEventEnvelope} from "../core/processing-events.ts";
import type {RestorationBatchFile} from "../core/restoration-batch.ts";
import type {RestorationPlan} from "../core/restoration-files.ts";
import type {ImageUtilityInput} from "./image-utilities.ts";
import type { KnownEntitySeed } from "../core/review-tools.ts";
import type { ReplacementPolicies } from "../contracts/policies.ts";
import type { OcrCorrectionInput } from "../contracts/ocr.ts";
import { Worker } from "node:worker_threads";
import type {RuntimeWhitelist} from '../core/runtime-rule-update.ts';
import type { Mark, DictionaryEntry } from "../contracts/index.ts";
import type { SearchScope, SearchSpan } from "../core/review-tools.ts";
import type { Mapping } from "../core/mappings.ts";
import { withHeavySlot, withPartialPagePreviewSlot } from "./db.ts";
// Native getenv in a worker observes the process environment, not only the JS worker's copy.
process.env.ORT_DISABLE_TELEMETRY = "1";
export type ProcessingInput = { kind: "detect" | "export" | "view" | "review" | "verify" | "gate" | "page" | "page-preview" | "partial-page-preview" | "preview" | "search" | "known-entities" | "mapping-value" | "visual-detect" | "docx-layout" | "docx-preview" | "ocr-text" | "ocr-correct" | "replacement-policies" | "entity-seeds" | "office-faces"; entitySeeds?: KnownEntitySeed[]; replacementPolicies?: ReplacementPolicies; doc: any; snapshot?: any; automaticBinding?:{taskId:string|null;actorId:string}; offset?: number; query?: string; searchScope?: SearchScope; searchSpans?: SearchSpan[]; detectors?: ("face" | "seal" | "signature")[]; correction?: OcrCorrectionInput; page?: number; marks?: Mark[]; mappings?: Mapping[]; artifact?: { id: string; hash: string; output_role?: "primary"|"markdown"|"pdf-docx"|"word-docx" }; pdfOcrCheckpointPages?:PdfOcrCheckpoint[] }
  | { kind: "download"; artifact: { id: string; hash: string; format?: string } }
  | {kind:"restoration-batch-file";file:RestorationBatchFile;plan:RestorationPlan}
  | {kind:"image-batch-search";doc:any;query:string;pageIndex?:number}
  | ImageUtilityInput
  | FolderOutputJob | FolderReadJob
  | {kind:"document-route";doc:any;overrideDocType?:string}
  | {kind:"entity-filter";doc:any;input:import("./review-mark-filter.ts").ReviewMarkFilterInput;marks?:Mark[];sourceSlots?:import("../core/review-entity-slots.ts").ReviewEntityLink[]}
  | {kind:"manual-occurrences";doc:any;query:string}
  | {kind:"docx-image-ocr";doc:any}
  | {kind:"page-rotation";doc:any;request:PageRotationRequest}
  | { kind: "document-unlock"; doc:any; password:string }
  | { kind: "legacy-office-normalize"; doc:any; password?:string }
  | { kind: "dictionary-import"; bytes: Uint8Array }
  | { kind: "dictionary-export"; entries: DictionaryEntry[] };

// A real worker thread keeps parser/crypto CPU work away from HTTP and lease heartbeats.
type ProcessingOptions = { signal?: AbortSignal; timeoutMs?: number; heavySlotHeld?: boolean; onEvent?: (event: ProcessingEventEnvelope) => void | Promise<void>; onCheckpoint?: (frame:PdfOcrCheckpoint) => void | Promise<void>; readRuntimeRules?:()=>Promise<RuntimeWhitelist[]>; readPdfSealPause?:()=>Promise<boolean> };
export function runProcessing<T>(input: ProcessingInput, options: ProcessingOptions = {}): Promise<T> {
  // A verified in-progress page must coexist with its detect worker, which
  // holds slot 2. Slot 3 admits one partial render across API processes.
  if(input.kind==='partial-page-preview')return withPartialPagePreviewSlot(signal=>runThread<T>(input,{...options,signal:options.signal?AbortSignal.any([signal,options.signal]):signal}));
  if (!options.heavySlotHeld && ["manual-occurrences", "entity-filter", "page-rotation", "legacy-office-normalize", "folder-output", "folder-output-read", "document-route", "docx-image-ocr", "image-batch-search", "restoration-batch-file", "image-utility", "document-unlock", "office-faces", "docx-layout", "docx-preview", "ocr-correct", "visual-detect", "detect", "export", "verify", "page-preview", "search", "known-entities", "dictionary-import", "dictionary-export"].includes(input.kind)) return withHeavySlot(signal => runThread<T>(input, { ...options, signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal }));
  return runThread<T>(input, options);
}
function runThread<T>(input: ProcessingInput, options: ProcessingOptions): Promise<T> {
  if("doc" in input&&input.doc){const original=input.doc;input={...input,doc:processingDocument({...original,page_review:openPageReview(original)})};if("snapshot" in input&&input.snapshot){const snapshot=input.snapshot;input={...input,snapshot:{...snapshot,page_review:openPageReview({...original,revision:snapshot.revision,content_hash:snapshot.content_hash},snapshot.page_review)}};}}
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("PROCESSING_CANCELLED")); return; }
    const worker = new Worker(new URL("./processing-worker.ts", import.meta.url), {
      workerData: {...input, legacyOfficeControl:true, processingEventStream: !!options.onEvent, liveRuntimeRules: input.kind==='detect'&&!!options.readRuntimeRules, livePdfSealPause: input.kind==='detect'&&'doc' in input&&input.doc?.source_format==='pdf'&&!!options.readPdfSealPause}, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 32 },
      env: { LEGACY_OFFICE_URL: process.env.LEGACY_OFFICE_URL ?? "", LEGACY_OFFICE_TOKEN: process.env.LEGACY_OFFICE_TOKEN ?? "", ORT_DISABLE_TELEMETRY: "1", DATA_KEY: process.env.DATA_KEY ?? "", DATA_DIR: process.env.DATA_DIR ?? ".data/files", VISUAL_MODEL_DIR: process.env.VISUAL_MODEL_DIR ?? ".data/models/visual", SIGNATURE_MODEL_DIR: process.env.SIGNATURE_MODEL_DIR ?? ".data/models/signature", OCR_MODEL_DIR: process.env.OCR_MODEL_DIR ?? ".data/models/ocr", NER_MODEL_DIR: process.env.NER_MODEL_DIR ?? ".data/models/ner" },
    });
    let settled = false, receivedResult = false;
    const legacyJobs = new Set<string>();
    let eventWrites = Promise.resolve();
    const finish = async (error?: Error, result?: T) => {
      if (settled) return;
      settled = true; clearTimeout(timer); options.signal?.removeEventListener("abort", abort);
      const cancellations=Promise.allSettled([...legacyJobs].map(jobId=>cancelConfiguredLegacyJob(jobId)));
      try { await worker.terminate(); } catch { await cancellations; reject(error ?? new Error("PROCESSING_FAILED")); return; }
      await cancellations;
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => void finish(new Error("PROCESSING_CANCELLED"));
    const timer = setTimeout(() => void finish(new Error("PROCESSING_TIMEOUT")), options.timeoutMs ?? (input.kind==="legacy-office-normalize" ? 150000 : input.kind==="restoration-batch-file" && ["doc","wps"].includes(input.file.format) ? 1800000 : "doc" in input && ["detect", "export", "verify"].includes(input.kind) && ["pdf", "docx", "doc", "wps"].includes(input.doc.source_format) ? 1800000 : 120000));
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.on("message", (message: ProcessingEventEnvelope | {type:'runtime-rules-request';requestId:string} | {type:'pdf-seal-pause-request';requestId:string} | {type:"legacy-office-job";action:"start"|"end";jobId:string} | { type?: "processing-result"; ok: boolean; value?: T; code?: string } | {type:"pdf-ocr-checkpoint";frame:PdfOcrCheckpoint}) => {
      if(settled)return;
      if(message.type==='pdf-seal-pause-request'){
        if(input.kind!=='detect'||!options.readPdfSealPause)return;
        eventWrites=eventWrites.then(async()=>{if(settled)return;const paused=await options.readPdfSealPause!();if(!settled)worker.postMessage({type:'pdf-seal-pause-reply',requestId:message.requestId,paused});});
        void eventWrites.catch(()=>finish(new Error('PDF_SEAL_CONTROL_FAILED')));return;
      }
      if(message.type==='runtime-rules-request'){
        if(input.kind!=='detect'||!options.readRuntimeRules)return;
        eventWrites=eventWrites.then(async()=>{if(settled)return;const rules=await options.readRuntimeRules!();if(!settled)worker.postMessage({type:'runtime-rules-reply',requestId:message.requestId,rules});});
        void eventWrites.catch(()=>finish(new Error('RUNTIME_RULE_DELIVERY_FAILED')));return;
      }
      if(message.type === "legacy-office-job") {
        if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(message.jobId))return;
        if(message.action==="start"){legacyJobs.add(message.jobId);worker.postMessage({type:"legacy-office-job-ack",jobId:message.jobId});}
        else if(message.action==="end")legacyJobs.delete(message.jobId);
        return;
      }
      if(message.type === "pdf-ocr-checkpoint") { eventWrites=eventWrites.then(async()=>{if(!settled)await options.onCheckpoint?.(message.frame);});void eventWrites.catch(()=>finish(new Error("PDF_OCR_CHECKPOINT_WRITE_FAILED")));return; }
      if(message.type === "processing-event") { eventWrites=eventWrites.then(async()=>{if(!settled)await options.onEvent?.(message);});void eventWrites.catch(()=>finish(new Error("PROCESSING_EVENT_WRITE_FAILED")));return; }
      if(receivedResult)return;receivedResult=true;
      void eventWrites.then(()=>finish(message.ok ? undefined : new Error(message.code ?? "PROCESSING_FAILED"),message.value)).catch(()=>finish(new Error("PROCESSING_EVENT_WRITE_FAILED")));
    });
    worker.once("error", error => void finish(new Error((error as NodeJS.ErrnoException).code === "ERR_WORKER_OUT_OF_MEMORY" ? "PROCESSING_MEMORY_LIMIT" : "PROCESSING_FAILED")));
    worker.once("exit", () => { if (!settled && !receivedResult) void finish(new Error("PROCESSING_FAILED")); });
    if (options.signal?.aborted) abort();
  });
}
