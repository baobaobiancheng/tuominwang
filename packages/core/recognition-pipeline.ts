import type { Mark, Anchor, DictionaryEntry, SourceFormat } from '../contracts/index.ts';
import type {DocumentConfiguration} from '../contracts/document-policy.ts';
import {isOfficeProtocolAttribute} from './office-protocol.ts';
import { detect, mergeCandidates } from './redaction.ts';
import { detectReferenceRules, filterReferenceNerCandidates, classifyReferenceDocumentDetail, REFERENCE_RULES_VERSION } from './reference-rules.ts';
import {applyEvidenceScene,selectEvidenceScene} from './evidence-screenshot.ts';
import {effectiveReferenceDocumentType} from './document-route.ts';
export const recognitionVersion = `cn-rules-3+${REFERENCE_RULES_VERSION}`;
// Parsed objects retain their offsets: fields cannot bridge cells, XML stories or image objects.
export function detectComplete(text: string, anchors: Anchor[], dictionary: DictionaryEntry[] = [], context: {filename?: string; ocr?: boolean; screenshot?: boolean; sourceFormat?:SourceFormat; configuration?:DocumentConfiguration} = {}) {
  const classification = classifyReferenceDocumentDetail(text, context.filename);
  const spans: Anchor[] = anchors.length ? anchors : [{ kind:"text", start: 0, end: text.length }];
  const evidenceScene=selectEvidenceScene(text,context.sourceFormat,classification,context.configuration);
  const reference: Mark[] = [], original = detect(text, anchors, dictionary).filter(m => !anchors.length || anchors.some(a => a.start <= m.start && a.end >= m.end));
  const accountFields = original.filter(m => m.kind === "证券/资金账号" || m.kind === "证照/许可证号");
  for (const span of spans) for (const c of detectReferenceRules(text.slice(span.start, span.end), { ...context,sceneMode:evidenceScene.controlled?'off':undefined, documentType: effectiveReferenceDocumentType(classification.type,context.configuration), windowOffset: span.start })) {
    if (c.kind === '网址' && isOfficeProtocolAttribute(text,span)) continue;
    const field = c.kind === '银行账号' ? accountFields.find(f => c.start >= f.start && c.end <= f.end) : undefined;
    reference.push({ start: field?.start ?? c.start, end: field?.end ?? c.end, kind: field?.kind ?? c.kind, decision: 'pending', sources: c.sources.map(source=>({...source,score:c.confidence})) });
  }
  return { marks: applyEvidenceScene(text,spans,mergeCandidates(text,original,reference),evidenceScene), classification,evidenceScene };
}
export function filterCompleteNer(text: string, marks: Mark[], anchors: Anchor[] = []) {
  return marks.flatMap(mark => {
    if (!['姓名', '机构', '地址'].includes(mark.kind)) return [mark];
    const filtered = filterReferenceNerCandidates(text, [{ start: mark.start, end: mark.end, kind: mark.kind as '姓名'|'机构'|'地址', score: mark.sources?.find(s => s.layer === 'ner')?.score ?? 0 }], anchors);
    return filtered.map(c => ({ ...mark, start: c.start, end: c.end, sources: [...(mark.sources ?? []), ...c.sources] }));
  });
}
