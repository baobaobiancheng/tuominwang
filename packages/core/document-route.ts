import type {Anchor,Mark} from '../contracts/index.ts';
import type {DocumentConfiguration} from '../contracts/document-policy.ts';
import {detectReferenceRules} from './reference-rules.ts';
import {mergeCandidates} from './redaction.ts';
export function applyDocumentRoute(text:string,anchors:Anchor[],marks:Mark[],configuration?:DocumentConfiguration){
  const route=configuration?.documentType;if(!route||route==='auto')return marks;
  const documentType=route==='pleading'?'complaint':route==='general'||route==='disclosure'||route==='screenshot'?'other':route;
  const extra:Mark[]=[];
  for(const anchor of anchors)for(const c of detectReferenceRules(text.slice(anchor.start,anchor.end),{documentType,windowOffset:anchor.start,screenshot:route==='screenshot'}))extra.push({start:c.start,end:c.end,kind:c.kind,decision:'pending',sources:c.sources.map(source=>({...source,score:c.confidence}))});
  return mergeCandidates(text,marks,extra);
}
