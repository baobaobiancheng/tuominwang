import type {DB} from './db.ts';
import type {PageReview} from '../contracts/index.ts';
import {hasEntityGeometry} from '../contracts/entity-geometry.ts';
import {reissueArchivedEntityGeometry,type ArchivedEntityGeometry} from './entity-geometry.ts';

/** The draft reader proves source, canonical spans and fresh glyphs first. Only
 * its exact old-slot links may carry an authenticated historical adjustment to
 * the newly issued scope. Recovered geometry remains a pending human candidate. */
export async function restorePortableEntityGeometry(db:DB,current:any,old:any,restored:{regionCandidates:PageReview['regions'];restoredMarkIndices:number[];unresolved:any[]},actorId:string){
 const archive:ArchivedEntityGeometry|null=old.entityGeometryArchive??null;
 const plain=restored.regionCandidates.filter(region=>!hasEntityGeometry(region));
 if(!archive){
  const orphaned=restored.regionCandidates.filter(hasEntityGeometry);
  return{regions:plain,unresolved:[...restored.unresolved,...orphaned.map(source=>({category:'entity-geometry',reason:'ENTITY_GEOMETRY_ARCHIVE_REQUIRED',source}))]};
 }
 const links=restored.restoredMarkIndices.flatMap((afterIndex,beforeIndex)=>Number.isSafeInteger(afterIndex)&&afterIndex>=0?[{beforeIndex,afterIndex}]:[]);
 const result=await reissueArchivedEntityGeometry(db,current,archive,links,actorId);
 return{regions:[...plain,...result.regions],unresolved:[...restored.unresolved,...result.unresolved.map(source=>({category:'entity-geometry',reason:'ENTITY_GEOMETRY_REBIND_REQUIRED',source}))]};
}
