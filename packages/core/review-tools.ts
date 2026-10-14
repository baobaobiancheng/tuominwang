import {sameEntity,entityIdentity} from './entity-identity.ts';
import { isDeepStrictEqual } from "node:util";
import { MAX_MARKS, type Anchor, type Mark, type SourceFormat } from "../contracts/index.ts";
import { replacementFor, validateMarks } from "./redaction.ts";
import { validateFileMarks } from "./files.ts";
import { textWindow } from "./text-window.ts";

export type KnownEntityCheck = {
  entities: { value: string; kind: Mark["kind"];rawEntityType?:string; ambiguous: boolean; matches: { start: number; end: number; status: "marked" | "retained" | "missing" | "conflict" }[] }[];
  additions: Mark[];
};

export type KnownEntitySeed = {value:string;kind:Mark["kind"];rawEntityType?:string;replacement?:Mark["replacement"]};
export function checkKnownEntities(text: string, marks: Mark[], format: SourceFormat, anchors: Anchor[], seeds: KnownEntitySeed[] = []): KnownEntityCheck {
  validateFileMarks(text, marks, format, anchors);
  const retained = (mark: Mark) => mark.decision === "ignore" || mark.decision === "pending" && !!mark.sources?.some(s => s.code === "project-whitelist");
  const known = new Map<string, { mark: Mark; value:string; ambiguous: boolean }>();
  for (const mark of marks) {
    if (retained(mark)) continue;
    if (mark.end - mark.start > 2000) throw new Error("KNOWN_ENTITY_VALUE_LIMIT");
    replacementFor(text, mark);
    const value = text.slice(mark.start, mark.end), previous = known.get(mark.rawEntityType===undefined?`value:${value}`:JSON.stringify([entityIdentity(mark),value]));
    if (previous) previous.ambiguous ||= !sameEntity(previous.mark,mark) || !isDeepStrictEqual(previous.mark.replacement ?? { mode: "type" }, mark.replacement ?? { mode: "type" });
    else known.set(mark.rawEntityType===undefined?`value:${value}`:JSON.stringify([entityIdentity(mark),value]), { mark,value, ambiguous: false });
    // Each distinct value scans the whole text. Reject the workload before scanning, never sample it.
    if (text.length * known.size > 100_000_000) throw new Error("KNOWN_ENTITY_SCAN_LIMIT");
  }
  for (const seed of seeds) {
    if (!seed.value || seed.value.length > 2000 || !seed.value.isWellFormed()) throw new Error("KNOWN_ENTITY_VALUE_LIMIT");
    const mark: Mark = {start:0,end:seed.value.length,kind:seed.kind,...seed.rawEntityType!==undefined?{rawEntityType:seed.rawEntityType}:{},decision:"pending",replacement:seed.replacement};
    replacementFor(seed.value, mark);
    const previous = known.get(mark.rawEntityType===undefined?`value:${seed.value}`:JSON.stringify([entityIdentity(mark),seed.value]));
    if (previous) previous.ambiguous ||= !sameEntity(previous.mark,mark) || !isDeepStrictEqual(previous.mark.replacement ?? {mode:"type"}, mark.replacement ?? {mode:"type"});
    else known.set(mark.rawEntityType===undefined?`value:${seed.value}`:JSON.stringify([entityIdentity(mark),seed.value]), {mark,value:seed.value,ambiguous:false});
    if (text.length * known.size > 100_000_000) throw new Error("KNOWN_ENTITY_SCAN_LIMIT");
  }
  function intervals(list: Mark[]) {
    const sorted = list.toSorted((a, b) => a.start - b.start), ends: number[] = [];
    for (const mark of sorted) ends.push(Math.max(ends.at(-1) ?? 0, mark.end));
    function endAt(position: number) {
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (sorted[mid].start <= position) lo = mid + 1; else hi = mid; }
      return ends[lo - 1] ?? 0;
    }
    return { contains: (start: number, end: number) => endAt(start) >= end, overlaps: (start: number, end: number) => endAt(end - 1) > start };
  }
  const marked = intervals(marks.filter(m => !retained(m))), preserved = intervals(marks.filter(retained));
  const entities: KnownEntityCheck["entities"] = [], candidates: { match: KnownEntityCheck["entities"][number]["matches"][number]; mark: Mark }[] = [];
  let count = 0;
  for (const seed of known.values()) {
    const value=seed.value, sameMarks=seed.mark.rawEntityType===undefined?null:marks.filter(m=>sameEntity(m,seed.mark)),seedMarked=sameMarks?intervals(sameMarks.filter(m=>!retained(m))):marked,seedPreserved=sameMarks?intervals(sameMarks.filter(retained)):preserved;
    const entity: KnownEntityCheck["entities"][number] = { value, kind: seed.mark.kind,...seed.mark.rawEntityType!==undefined?{rawEntityType:seed.mark.rawEntityType}:{}, ambiguous: seed.ambiguous, matches: [] };
    let from = 0;
    while (true) {
      const start = text.indexOf(value, from);
      if (start < 0) break;
      if (++count > MAX_MARKS) throw new Error("MARK_LIMIT");
      const end = start + value.length, markOverlap = marked.overlaps(start, end), retainedOverlap = preserved.overlaps(start, end);
      const match: typeof entity.matches[number] = { start, end, status: "missing" };
      if (seedMarked.contains(start, end) && !retainedOverlap) match.status = "marked";
      else if (seedPreserved.contains(start, end) && !markOverlap) match.status = "retained";
      else if (markOverlap || retainedOverlap || seed.ambiguous) match.status = "conflict";
      const candidate: Mark = { start, end, kind: seed.mark.kind,...seed.mark.rawEntityType!==undefined?{rawEntityType:seed.mark.rawEntityType}:{}, decision: "pending", ...(seed.mark.replacement && { replacement: seed.mark.replacement }), sources: [{ layer: "manual", code: "known-entity-check" }] };
      if (!markOverlap && !retainedOverlap) {
        try { validateFileMarks(text, [candidate], format, anchors); }
        catch (error) { if (["CROSS_CELL_MARK", "CROSS_OBJECT_MARK"].includes((error as Error).message)) match.status = "conflict"; else throw error; }
        candidates.push({ match, mark: candidate });
      }
      entity.matches.push(match); from = start + 1;
    }
    entities.push(entity);
  }
  candidates.sort((a, b) => a.mark.start - b.mark.start || a.mark.end - b.mark.end);
  let previousEnd = 0;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.mark.start < previousEnd || (candidates[i + 1]?.mark.start ?? Infinity) < candidate.mark.end) candidate.match.status = "conflict";
    previousEnd = Math.max(previousEnd, candidate.mark.end);
  }
  const additions = candidates.filter(c => c.match.status === "missing").map(c => c.mark);
  if (marks.length + additions.length > MAX_MARKS) throw new Error("MARK_LIMIT");
  return { entities, additions };
}

export type SearchScope = "all" | "inside" | "outside";
export type SearchSpan = Pick<Mark, "start" | "end" | "decision">;
export function searchText(text: string, query: string, from: number, scope: SearchScope = "all", spans: SearchSpan[] = []) {
  if (!query || query.length > 200 || !query.isWellFormed() || !Number.isInteger(from) || from < 0 || !["all", "inside", "outside"].includes(scope)) throw new Error("INVALID_SEARCH");
  if (spans.length > MAX_MARKS || spans.some(m => !Number.isInteger(m.start) || !Number.isInteger(m.end) || m.start < 0 || !["pending", "redact", "ignore"].includes(m.decision))) throw new Error("INVALID_MARKS");
  // Search needs valid ranges, not exportable replacements or non-overlapping decisions.
  validateMarks(text, spans.map(m => ({ start: m.start, end: m.end, kind: "自定义", decision: "pending" })));
  const sorted = spans.filter(m => m.decision !== "ignore").sort((a, b) => a.start - b.start);
  const matches: { start: number; end: number; excerpt: string }[] = [];
  let cursor = from, index = 0, coveringEnd = 0;
  while (true) {
    const start = text.indexOf(query, cursor);
    if (start < 0) return { matches, next: null };
    const end = start + query.length;
    // The maximum end belongs to one span starting before this hit. Never merge adjacent spans.
    while (index < sorted.length && sorted[index].start <= start) coveringEnd = Math.max(coveringEnd, sorted[index++].end);
    const inside = coveringEnd >= end;
    if (scope === "all" || (scope === "inside") === inside) {
      // Look ahead for one qualifying hit; next never promises an empty filtered page.
      if (matches.length === 50) return { matches, next: start };
      matches.push({ start, end, excerpt: text.slice(Math.max(0, start - 35), end + 35) });
    }
    cursor = end;
  }
}
// Draft preview preserves pending/ignored content and is never a downloadable artifact.
export function previewText(text: string, marks: Mark[], offset: number) {
  const selected = validateMarks(text, marks), window = textWindow(text, offset);
  const start = window.textOffset, end = start + window.text.length;
  const pieces: string[] = [];
  let cursor = start;
  for (const mark of selected) {
    if (mark.end <= start || mark.start >= end) continue;
    pieces.push(text.slice(cursor, Math.max(cursor, mark.start)), replacementFor(text, mark));
    cursor = Math.min(end, mark.end);
  }
  pieces.push(text.slice(cursor, end));
  return { ...window, text: pieces.join("") };
}
