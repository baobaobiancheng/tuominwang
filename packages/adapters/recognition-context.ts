import type {Anchor,Mark,ParsedPage,SourceFormat} from '../contracts/index.ts';
import type {Glyph} from '../core/ocr.ts';
import {mergeCandidates} from '../core/redaction.ts';
import {filterReferenceTableAmounts} from '../core/reference-table.ts';
import {detectReferencePartyReferences} from '../core/reference-party.ts';
import {detectReferenceFragments} from '../core/reference-fragment.ts';
import type {ReferenceOptions} from '../core/reference-rules.ts';
import type {DocumentConfiguration} from '../contracts/document-policy.ts';
import {effectiveReferenceDocumentType} from '../core/document-route.ts';
import {documentTableMarks,referenceTableNerAdapter} from './reference-table.ts';
import {documentVisualTableMarks} from './reference-visual-table.ts';
/** Reuse the caller's NER session. Actual cells and authenticated glyphs bind
 * every span; neither invented columns nor substring searches supply offsets. */
export async function contextualDocumentMarks(bytes:Buffer,text:string,anchors:Anchor[],pages:ParsedPage[],format:SourceFormat,seeds:Mark[],options:{ner?:(text:string,anchors:Anchor[])=>Promise<Mark[]>;overrides?:Map<number,Glyph[]>;documentType?:ReferenceOptions['documentType'];configuration?:DocumentConfiguration}={}){
 const predict=options.ner?referenceTableNerAdapter(options.ner):undefined;
 const table=await documentTableMarks(bytes,text,anchors,format,{predict});
 let marks=mergeCandidates(text,filterReferenceTableAmounts(text,seeds,table.exclusions),table.marks);
 if(pages.length&&['docx','pdf','png','jpg','jpeg'].includes(format)){
  const visual=await documentVisualTableMarks(bytes,text,anchors,pages,format as 'docx'|'pdf'|'png'|'jpg'|'jpeg',{predict},options.overrides);
  marks=mergeCandidates(text,filterReferenceTableAmounts(text,marks,visual.exclusions),visual.marks);
 }
 // Source modern PDF summary uses Ll(allowJudgment) and jl. Modern text/Word
 // and image callers do not activate the alternative five-group legacy path.
 const strategy=options.configuration?.referenceStrategy??'modern';
 if(strategy==='legacy'&&options.configuration?.fragmentRecomposer&&options.documentType!=='other'&&['txt','md','docx'].includes(format))marks=mergeCandidates(text,marks,detectReferenceFragments(text,marks,anchors,{enabled:true,maxAdd:150,requireContext:true}));
 if(format==='pdf'||strategy==='legacy')marks=mergeCandidates(text,marks,detectReferencePartyReferences(text,marks,anchors,{strategy,allowJudgment:format==='pdf',documentType:options.documentType,caller:format==='pdf'?'pdf-summary':format==='docx'?'word-structured':['png','jpg','jpeg'].includes(format)?'image-rescan':'text'}).marks);
 return marks;
}

export function contextualDocumentType(classification:NonNullable<ReferenceOptions['documentType']>,configuration?:DocumentConfiguration){
 return effectiveReferenceDocumentType(classification,configuration);
}
