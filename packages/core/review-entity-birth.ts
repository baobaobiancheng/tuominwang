import type{Mark}from'../contracts/index.ts';import type{ReviewProvenance,ReviewEntityMetadata}from'./review-provenance.ts';
/** Birth is a descriptive source attribute, never an actor or an approval. */
export function reviewEntityBirth(mark:Mark,entry?:ReviewEntityMetadata):boolean{
 if(typeof mark.userAdded==='boolean')return mark.userAdded;
 if(mark.hiddenByType&&typeof mark.hiddenTypeWasUserAdded==='boolean')return mark.hiddenTypeWasUserAdded;
 if(typeof entry?.meta.userAdded==='boolean')return entry.meta.userAdded;
 if(entry?.meta.sourceChain.some(e=>e.phase==='review'&&e.source==='user'&&e.action==='entity-added'))return true;
 const first=entry?.meta.sourceChain.find(e=>e.phase==='detect');
 if(first&&first.source!=='manual'&&first.source!=='unknown')return false;
 return!!mark.sources?.some(s=>s.layer==='manual'&&['human-mark','page-text-selection','manual-occurrence','manual-add','project-entity-add','known-entity-add'].includes(s.code));
}
export function reviewEntityBirths(frame:ReviewProvenance,marks:Mark[]):Map<number,boolean>{const slots=new Map(frame.entries.filter(e=>e.active).map(e=>[e.markIndex,e]));return new Map(marks.map((m,index)=>[index,reviewEntityBirth(m,slots.get(index))]));}
export function withReviewEntityBirths<T extends Mark>(frame:ReviewProvenance,marks:T[]):T[]{const births=reviewEntityBirths(frame,marks);return marks.map((m,index)=>({...m,userAdded:births.get(index)!}));}
