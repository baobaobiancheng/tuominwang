import { z } from "zod";
import { markSchema, type Mark } from "../contracts/index.ts";
import { mergeCandidates } from "./redaction.ts";

export const aiResultSchema = z.object({ results: z.array(z.object({
  id: z.string().min(1).max(80),
  candidates: z.array(z.object({ quote: z.string().min(1).max(2000), kind: markSchema.shape.kind,
    reasonCode: z.enum(["identity", "contact", "financial_identifier", "organization", "location", "settlement_floor", "litigation_strategy", "nonpublic_transaction", "relationship", "uncertain"]),
    uncertain: z.boolean(),
  }).strict()).max(100),
}).strict()).max(20) }).strict();
export function validateAiResults(samples: { id: string; text: string }[], raw: unknown) {
  const parsed = aiResultSchema.parse(raw), byId = new Map(samples.map(sample => [sample.id, sample.text]));
  if (parsed.results.length !== samples.length || new Set(parsed.results.map(r => r.id)).size !== samples.length) throw new Error("AI_SAMPLE_MISMATCH");
  return parsed.results.map(result => {
    const text = byId.get(result.id); if (text === undefined) throw new Error("AI_SAMPLE_MISMATCH");
    const marks: Mark[] = result.candidates.map(candidate => {
      const start = text.indexOf(candidate.quote);
      if (start < 0) throw new Error("AI_QUOTE_MISMATCH");
      if (text.indexOf(candidate.quote, start + 1) !== -1) throw new Error("AI_AMBIGUOUS_QUOTE");
      return { start, end: start + candidate.quote.length, kind: candidate.kind, decision: "pending", sources: [{ layer: "ai", code: candidate.reasonCode, uncertain: candidate.uncertain }] };
    });
    return { id: result.id, marks: mergeCandidates(text, marks) };
  });
}
