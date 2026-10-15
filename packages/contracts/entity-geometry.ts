import type{Mark,PageReview}from'./index.ts';
export type EntityGeometryBox={x:number;y:number;width:number;height:number};
export type EntityGeometryDescriptor={markIndex:number;reviewEntityId:string;page:number;text:string;displayText?:string;entityType:string;bboxes:EntityGeometryBox[];token:string};
export type EntityGeometryView={documentId:string;revision:number;page:number;entities:EntityGeometryDescriptor[]};
export type EntityGeometryEdit={version:1;token:string;bboxes:EntityGeometryBox[]};
/** Metadata presence is not authority. Server code must authenticate its token
 * and current source/map/entity slot before interpreting this as an override. */
export function hasEntityGeometry(region:Pick<PageReview['regions'][number],'meta'>){return !!region.meta&&Object.hasOwn(region.meta,'entityGeometryOverride');}
export function geometryEnvelope(boxes:readonly EntityGeometryBox[]):EntityGeometryBox{if(!boxes.length||boxes.some(b=>![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0))throw Error('ENTITY_GEOMETRY_INVALID');let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;for(const b of boxes){x=Math.min(x,b.x);y=Math.min(y,b.y);right=Math.max(right,b.x+b.width);bottom=Math.max(bottom,b.y+b.height);}return{x,y,width:right-x,height:bottom-y};}
/** Source gr2/yr2: an existing multi-rectangle entity follows the same outer
 * bounding transformation. Keep every inner rectangle rather than collapsing
 * multiline highlights into one text rectangle. */
export function transformEntityGeometry(boxes:readonly EntityGeometryBox[],target:EntityGeometryBox){const before=geometryEnvelope(boxes);geometryEnvelope([target]);return boxes.map(b=>({x:target.x+(b.x-before.x)*target.width/before.width,y:target.y+(b.y-before.y)*target.height/before.height,width:b.width*target.width/before.width,height:b.height*target.height/before.height}));}

export type EntityGeometryBinding={reviewEntityId:string;markIndex:number;start:number;end:number;identity:string};
export const geometryMarkIdentity=(mark:Pick<Mark,'kind'|'rawEntityType'>)=>mark.rawEntityType===undefined?mark.kind:`raw:${JSON.stringify(mark.rawEntityType)}`;
/** Client cleanup only. A public opaque ID associates controls; the server
 * independently checks the AEAD descriptor and actual provenance slot. */
export function pruneEntityGeometryRegions(before:readonly(Mark&{reviewEntityId?:string})[],next:readonly(Mark&{reviewEntityId?:string})[],policy:PageReview):PageReview{const indexed=(values:readonly(Mark&{reviewEntityId?:string})[])=>{const result=new Map<string,(Mark&{reviewEntityId?:string})|null>();for(const mark of values)if(mark.reviewEntityId){if(result.has(mark.reviewEntityId))result.set(mark.reviewEntityId,null);else result.set(mark.reviewEntityId,mark);}return result;},oldById=indexed(before),nextById=indexed(next);let changed=false;const regions=policy.regions.filter(region=>{if(!hasEntityGeometry(region))return true;const binding=region.meta?.entityGeometryBinding as EntityGeometryBinding|undefined;if(!binding)return true;const identified=oldById.get(binding.reviewEntityId),legacy=before[binding.markIndex],old=identified??(legacy?.reviewEntityId===undefined?legacy:undefined);if(!old||old.start!==binding.start||old.end!==binding.end||geometryMarkIdentity(old)!==binding.identity)return true;const match=identified?nextById.get(binding.reviewEntityId):next.length===before.length&&next[binding.markIndex]?.reviewEntityId===undefined?next[binding.markIndex]:undefined,keep=!!match&&match.start===binding.start&&match.end===binding.end&&geometryMarkIdentity(match)===binding.identity;if(!keep)changed=true;return keep;});return changed?{...policy,regions}:policy;}

/** Source mr2(number) edits one particular bbox. mr2(null) selects its outer
 * range; the explicit outer-transform option keeps multiline boxes coherent. */
export function editEntityGeometryPart(boxes:readonly EntityGeometryBox[],index:number,target:EntityGeometryBox){if(!Number.isSafeInteger(index)||index<0||index>=boxes.length)throw Error('ENTITY_GEOMETRY_INVALID');geometryEnvelope([target]);return boxes.map((b,i)=>({...i===index?target:b}));}

/** Source type hiding removes the entity from interactive geometry layers. An
 * ordinary ignore decision remains a distinct visible review operation. */
export function visibleEntityGeometryDescriptors<T extends EntityGeometryDescriptor>(entities:readonly T[],marks:readonly Mark[]):T[]{return entities.filter(entity=>marks[entity.markIndex]?.hiddenByType!==true);}
