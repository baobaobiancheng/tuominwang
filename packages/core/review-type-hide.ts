import type {Mark} from '../contracts/index.ts';
import {sameEntity,type EntityIdentity} from './entity-identity.ts';
/** Source d2 uses actual creation state, never merely a human review decision. */
export function reviewEntityWasUserAdded(mark:Mark):boolean{return mark.userAdded!==undefined?mark.userAdded:mark.hiddenByType===true?mark.hiddenTypeWasUserAdded===true:!!mark.sources?.some(source=>source.layer==='manual');}
/** Source _c/tu2: reject processing for this type, retaining every original slot. */
export function hideReviewEntityType<T extends Mark>(marks:T[],identity:EntityIdentity,wasUserAdded:(mark:T,index:number)=>boolean=reviewEntityWasUserAdded):T[]{
 return marks.map((mark,index)=>{if(!sameEntity(mark,identity)||mark.hiddenByType===true)return mark;const userAdded=wasUserAdded(mark,index);return{...mark,decision:'ignore',userAdded,hiddenByType:true,hiddenTypeWasUserAdded:userAdded};});
}
/** Source Sc: restoring a type requires fresh confirmation; it never revives approval. */
export function restoreHiddenReviewEntities<T extends Mark>(marks:T[],identity?:EntityIdentity):T[]{
 return marks.map(mark=>{if(mark.hiddenByType!==true||identity&&!sameEntity(mark,identity))return mark;const{hiddenByType:_,hiddenTypeWasUserAdded:wasAdded,...rest}=mark;return{...rest,decision:'pending',userAdded:wasAdded===true} as T;});
}
