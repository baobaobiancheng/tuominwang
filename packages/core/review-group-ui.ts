import type {Mark} from '../contracts/index.ts';
/** The mark record has no complete source name; this only reads already-authorized view text. */
export function signatureGroupLabel(marks:readonly Mark[],id:string,text:string,offset:number,markTexts?:Record<string,string>):string{
 const members=marks.filter(m=>m.signatureGroup?.id===id).sort((a,b)=>a.signatureGroup!.memberIndex-b.signatureGroup!.memberIndex);
 const values=members.map(m=>m.start>=offset&&m.end<=offset+text.length?text.slice(m.start-offset,m.end-offset):markTexts?.[`${m.start}:${m.end}`]);
 return values.length&&values.every((v):v is string=>typeof v==='string')?values.join(''):'分格姓名';
}

/** A click or bulk action covers every member of every selected signature. */
export function applySignatureDecision<T extends Mark>(marks:readonly T[],selected:ReadonlySet<number>,decision:Mark['decision']):T[]{
 const groups=new Set([...selected].flatMap(i=>marks[i]?.signatureGroup?[marks[i].signatureGroup.id]:[]));
 return marks.map((mark,index)=>selected.has(index)||mark.signatureGroup&&groups.has(mark.signatureGroup.id)?{...mark,decision} as T:mark);
}
