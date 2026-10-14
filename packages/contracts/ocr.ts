import { z } from "zod";
export const ocrCorrectionSchema = z.object({
  revision: z.number().int().nonnegative(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  expectedText: z.string().max(200000).refine(v => v.isWellFormed()),
  text: z.string().max(200000).refine(v => v.isWellFormed() && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(v)),
}).strict().refine(v => v.end > v.start, { message: "Select existing page text" });
export type OcrCorrectionInput = z.infer<typeof ocrCorrectionSchema>;
export type OcrTextView = { revision: number; page: number; text: string; width: number; height: number; correctionRevision: number; glyphs: [number, number, number, number, number, number][] };
