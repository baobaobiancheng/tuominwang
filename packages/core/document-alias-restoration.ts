import type{Mark}from'../contracts/index.ts';import{restoreText,validateMappingMarks,type Mapping}from'./mappings.ts';import{redact,replacementFor,validateMarks}from'./redaction.ts';
/** A multi-form group cannot infer which original variant an arbitrary token
 * represents. The authenticated current document supplies the occurrence plan.
 * Its complete reviewed canonical output must match, including count/order and
 * all surrounding text. Other irreversible masks remain masked. */
export function restoreDocumentAliases(input:string,source:string,marks:Mark[],mappings:Mapping[],authorized:boolean,current:boolean,options:{semanticValue?:(mark:Mark,index:number)=>string}={}){
 validateMappingMarks(source,marks,mappings);const byToken=new Map<string,Mapping>(),multiple=mappings.some(m=>{const old=byToken.get(m.token);byToken.set(m.token,old??m);return new Set([m.value,...m.forms??[]]).size>1||!!old&&(old.id!==m.id||old.version!==m.version||old.value!==m.value);});
 if(!multiple)return restoreText(input,mappings,authorized,current);
 if(!authorized||!current)return restoreText(input,mappings,authorized,current);
 if(input!==redact(source,marks))throw new Error('RESTORE_OCCURRENCE_PLAN_REQUIRED');
 // The exact current occurrence plan has resolved ID/version ambiguity. This
 // token-only gate validates authorization, current state and every input token;
 // its canonical replacement output is deliberately discarded.
 restoreText(input,[...byToken.values()],authorized,current);
 const pieces:string[]=[];let cursor=0;for(const mark of validateMarks(source,marks,true)){pieces.push(source.slice(cursor,mark.start),mark.replacement?.mode==='alias'?(options.semanticValue?.(mark,marks.indexOf(mark))??source.slice(mark.start,mark.end)):replacementFor(source,mark));cursor=mark.end;}pieces.push(source.slice(cursor));return pieces.join('');
}
