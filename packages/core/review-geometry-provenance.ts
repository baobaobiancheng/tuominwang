import type{ReviewProvenance,ProvenanceEvent}from'./review-provenance.ts';
import{assertReviewProvenance}from'./review-provenance.ts';
import type{EntityGeometryBox}from'../contracts/entity-geometry.ts';
export type GeometryProvenanceChange={entityId:string;afterIndex:number;beforeBoxes:EntityGeometryBox[];afterBoxes:EntityGeometryBox[];actorId:string;timestamp:string;action:'geometry-edited'|'geometry-reset'};
/** Input is produced by server-authenticated old/new geometry tokens. It is
 * never accepted from the review request or imported as a local approval. */
export function appendGeometryProvenance(input:ReviewProvenance,changes:readonly GeometryProvenanceChange[]):ReviewProvenance{
 if(!changes.length)return input;
 const frame=structuredClone(input),entries=new Map(frame.entries.filter(e=>e.active).map(e=>[e.markIndex,e])),seen=new Set<string>(),valid=(boxes:EntityGeometryBox[])=>Array.isArray(boxes)&&boxes.length>0&&boxes.every(b=>[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0);
 for(const change of changes){const e=entries.get(change.afterIndex);if(!e||e.id!==change.entityId||seen.has(e.id)||!change.actorId||!Number.isFinite(Date.parse(change.timestamp))||!['geometry-edited','geometry-reset'].includes(change.action)||!valid(change.beforeBoxes)||!valid(change.afterBoxes))throw Error('REVIEW_PROVENANCE_INVALID');seen.add(e.id);if(JSON.stringify(change.beforeBoxes)===JSON.stringify(change.afterBoxes))continue;
  e.meta.operationSource='user';e.meta.reviewState={...e.meta.reviewState,operationSource:'user',note:change.action,updatedAt:change.timestamp,actorId:change.actorId};const event:ProvenanceEvent&{geometrySnapshot:{before:EntityGeometryBox[];after:EntityGeometryBox[]}}={phase:'review',source:'user',action:change.action,positionSnapshot:{start:e.start,end:e.end},timestamp:change.timestamp,actorId:change.actorId,geometrySnapshot:{before:structuredClone(change.beforeBoxes),after:structuredClone(change.afterBoxes)}};e.meta.sourceChain.push(event);
 }
 assertReviewProvenance(frame,{documentId:input.documentId,contentHash:input.contentHash,revision:input.revision});return frame;
}
