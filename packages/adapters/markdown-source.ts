import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {parseReferenceMarkdown,markdownRecognitionMetadata,assertMarkdownBlockersAcknowledged,type ReferenceMarkdown,type MarkdownBlockerReview} from '../core/reference-markdown.ts';
import {verifiedDocumentSource} from './document-source.ts';
import {hash,readArtifact,writeArtifact,unseal} from './storage.ts';

export async function storeMarkdownSource(parsed:ReferenceMarkdown,document:string){
  const sidecarId=randomUUID(),sidecarHash=await writeArtifact(sidecarId,JSON.stringify(parsed.sidecar),document);
  return markdownRecognitionMetadata(parsed,sidecarId,sidecarHash);
}
export async function readMarkdownBlockerReview(d:any):Promise<MarkdownBlockerReview|undefined>{
  const meta=d.recognition?.markdown;
  if(!meta?.blockerReviewId){if(meta?.blockerReviewHash)throw new Error('SOURCE_MISMATCH');return;}
  const value=await readArtifact(meta.blockerReviewId);
  if(hash(value)!==meta.blockerReviewHash)throw new Error('SOURCE_MISMATCH');
  return JSON.parse(value);
}
/** Rebuild from immutable bytes; a database pointer alone is never a source witness. */
export async function loadMarkdownSource(d:any,text:string,requireAcknowledgement=true){
  if(d.parse_version!==2)throw new Error('MARKDOWN_RECOGNITION_REQUIRED');
  const meta=d.recognition?.markdown;
  if(!meta)throw new Error('MARKDOWN_SIDECAR_REQUIRED');
  const parsed=parseReferenceMarkdown(await verifiedDocumentSource(d),unseal(d.source_name,`${d.tenant_id}:${d.project_id}:${d.id}:name`));
  const stored=await readArtifact(meta.sidecarId);
  if(hash(stored)!==meta.sidecarHash||!isDeepStrictEqual(JSON.parse(stored),parsed.sidecar)||parsed.scanText!==text||!isDeepStrictEqual(parsed.anchors,d.anchors)||!isDeepStrictEqual(parsed.coverage,d.coverage))throw new Error('SOURCE_MISMATCH');
  const expected=markdownRecognitionMetadata(parsed,meta.sidecarId,meta.sidecarHash);
  if(Object.entries(expected).some(([key,value])=>meta[key]!==value))throw new Error('SOURCE_MISMATCH');
  if(requireAcknowledgement){
    assertMarkdownBlockersAcknowledged(parsed,await readMarkdownBlockerReview(d));
  }
  return parsed;
}
