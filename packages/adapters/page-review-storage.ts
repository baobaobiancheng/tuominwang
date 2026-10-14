import {pageReviewSchema,type PageReview} from '../contracts/index.ts';
import {hash,seal,unseal} from './storage.ts';
type Context={id:string;tenant_id:string;project_id:string;revision:number;source_hash?:string|null;content_hash:string;page_review?:unknown};
const fields=['entityType','text','meta'] as const;
function fail():never{throw Object.assign(new Error('PAGE_REVIEW_STORAGE_INVALID'),{statusCode:409});}
function aad(doc:Context,region:any,revision:number){const geometry={id:region.id,page:region.page,x:region.x,y:region.y,width:region.width,height:region.height,shape:region.shape,reason:region.reason};return`${doc.tenant_id}:${doc.project_id}:${doc.id}:page-review:${revision}:${doc.source_hash??''}:${doc.content_hash}:${region.id}:${hash(JSON.stringify(geometry))}`;}
/** Legacy geometry remains unchanged; plaintext legacy private fields are only read for compatibility.
 * Every application write must use sealPageReview, including review snapshots. */
export function openPageReview(doc:Context,stored:unknown=doc.page_review):PageReview|null{
 if(stored==null)return null;if(typeof stored!=='object'||!Array.isArray((stored as any).regions))return fail();
 try{const input=stored as any,regions=input.regions.map((region:any)=>{if(region.privateMetadata===undefined)return region;if(fields.some(key=>Object.hasOwn(region,key)))return fail();const envelope=region.privateMetadata;if(!envelope||envelope.version!==1||!Number.isInteger(envelope.revision)||envelope.revision<0||envelope.revision>doc.revision||typeof envelope.ciphertext!=='string')return fail();const{privateMetadata,...geometry}=region,payload=JSON.parse(unseal(envelope.ciphertext,aad(doc,geometry,envelope.revision)));if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!fields.includes(key as any)))return fail();return{...geometry,...payload};});return pageReviewSchema.parse({...input,regions});}catch{return fail();}
}
export function sealPageReview(doc:Context,plain:unknown,targetRevision=doc.revision):any{
 if(plain==null)return null;if(!Number.isInteger(targetRevision)||targetRevision<0)return fail();const value=openPageReview(doc,plain)!;
 return{...value,regions:value.regions.map(region=>{const geometry:any={...region},payload:any={};for(const key of fields)if(Object.hasOwn(region,key)){payload[key]=region[key];delete geometry[key];}if(!Object.keys(payload).length)return geometry;return{...geometry,privateMetadata:{version:1,revision:targetRevision,ciphertext:seal(JSON.stringify(payload),aad(doc,geometry,targetRevision))}};})};
}
