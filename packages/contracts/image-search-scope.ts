import type{ImageSearchHit,SearchBox}from'../core/image-batch-search.ts';
export type SearchEntityBoxes={pageNumber:number;text:string;bboxes:SearchBox[];correctedFrom?:string};
export type ScopedImageSearchHit=ImageSearchHit&{inEntity:boolean};
const normalize=(value:string)=>value.replace(/[\s\u00A0\u1680\u2000-\u200D\u2060\u202F\u205F\u3000\uFEFF\u00AD]/gu,'').toLowerCase();
/** Source PdfReviewContainer Ca2: containment uses the result center with a
 * three-unit margin. Used for navigation only, never a redaction coverage proof. */
export function sourceCenterInside(hit:SearchBox,entity:SearchBox,tolerance=3){const x=hit.x+hit.width/2,y=hit.y+hit.height/2;return x>=entity.x-tolerance&&x<=entity.x+entity.width+tolerance&&y>=entity.y-tolerance&&y<=entity.y+entity.height+tolerance;}
export function classifyImageSearchHits(hits:ImageSearchHit[],query:string,entities:SearchEntityBoxes[],deletedPages:number[]=[]){const needle=normalize(query),deleted=new Set(deletedPages.map(n=>n+1));if(!needle)return[];return hits.filter(hit=>!deleted.has(hit.pageNumber)).flatMap(hit=>{const boxes=hit.bboxes?.length?hit.bboxes:[hit],onPage=entities.filter(e=>e.pageNumber===hit.pageNumber),obsolete=onPage.some(e=>e.correctedFrom!==undefined&&!normalize(e.text).includes(needle)&&boxes.every(b=>e.bboxes.some(target=>sourceCenterInside(b,target))));if(obsolete)return[];const matches=onPage.filter(e=>normalize(e.text).includes(needle));return[{...hit,inEntity:boxes.every(box=>matches.some(e=>e.bboxes.some(target=>sourceCenterInside(box,target))))}];});}
