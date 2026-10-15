import {isDeepStrictEqual} from 'node:util';
import type {Anchor,Mark,SourceFormat} from '../contracts/index.ts';
import {hash,unseal} from './storage.ts';
import {verifiedDocumentSource} from './document-source.ts';
import {documentTableMarks} from './reference-table.ts';
import {effectiveSignatureGroups} from '../core/signature-group-policy.ts';
import {processingDocument} from '../core/document-format.ts';
import {rulesetMaterialRoute} from '../core/document-route.ts';
import {assertSignatureGroups} from '../core/review-groups.ts';
const supported=new Set<SourceFormat>(['csv','docx','xlsx','md']);
const fail=():never=>{throw Object.assign(new Error('SIGNATURE_GROUP_RECOGNITION_REQUIRED'),{statusCode:409});};
export function assertStoredSignatureGroups(expected:readonly Mark[],actual:readonly Mark[]):void{
 if(!Array.isArray(actual))fail();
 try{assertSignatureGroups(actual);}catch{fail();}
 const signature=actual.filter(m=>m.signatureGroup);
 if(signature.length!==expected.length)fail();
 const key=(m:Mark)=>`${m.start}:${m.end}:${m.kind}`;
 const byKey=new Map(signature.map(m=>[key(m),m]));if(byKey.size!==signature.length)fail();
 for(const mark of expected){const stored=byKey.get(key(mark));if(!stored||!isDeepStrictEqual(stored.signatureGroup,mark.signatureGroup))fail();}
}
/** Existing reviews without trustworthy group metadata remain intact, but cannot
 * authorize a new review or export. Recompute from a hash-verified source.
 * Historical signed downloads are verified on their own immutable snapshot. */
export async function assertTrustedSignatureGroups(d:any):Promise<void>{
 const projected=processingDocument(d);if(!supported.has(projected.source_format as SourceFormat))return;
 const bytes=await verifiedDocumentSource(d),aad=`${d.tenant_id}:${d.project_id}:${d.id}`;
 const text=unseal(d.content,aad);if(hash(text)!==d.content_hash)throw new Error('SOURCE_MISMATCH');
 const raw=(await documentTableMarks(bytes,text,d.anchors as Anchor[],projected.source_format as SourceFormat)).marks.filter(m=>m.signatureGroup);
 if(raw.length&&typeof d.recognition?.classification?.type!=='string')fail();
 const route=rulesetMaterialRoute(d.recognition?.classification?.type??'other',d.documentPolicy?.configuration);
 const expected=effectiveSignatureGroups(text,d.anchors as Anchor[],raw,d.presetPolicy?.profile?.settings,d.presetPolicy?.ruleset?.settings,route);
 assertStoredSignatureGroups(expected,d.marks as Mark[]);
}
