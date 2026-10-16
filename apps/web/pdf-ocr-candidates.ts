import type {Mark} from '../../packages/contracts/index.ts';

export type PageCandidate=Pick<Mark,'start'|'end'|'kind'> & Partial<Pick<Mark,'rawEntityType'>>;
export type CandidatePage={pageIndex:number;text:string;machineCandidates:PageCandidate[]};
export type CandidatePulse={pageNumber:number;stage:string;matches?:PageCandidate[];canonicalHash?:string};
export type CandidateStream=Map<number,{matches:PageCandidate[];final:boolean}>;
const key=(m:PageCandidate)=>JSON.stringify([m.start,m.end,m.kind,m.rawEntityType??null]);

// NER progress carries global offsets and may arrive in several batches. The
// final page event replaces all provisional candidates for that page.
export function foldPdfOcrCandidatePulse(previous:CandidateStream,pulse:CandidatePulse):CandidateStream{
 if(pulse.stage!=='recognize'||!Number.isInteger(pulse.pageNumber)||pulse.pageNumber<1||!Array.isArray(pulse.matches))return previous;
 const page=pulse.pageNumber-1,old=previous.get(page),final=typeof pulse.canonicalHash==='string';
 if(old?.final&&!final)return previous;
 const merged=final?pulse.matches:[...(old?.matches??[]),...pulse.matches],unique=new Map(merged.map(m=>[key(m),m]));
 const next=new Map(previous);next.set(page,{matches:[...unique.values()],final});return next;
}

export function visiblePdfOcrCandidates(pages:CandidatePage[],pageIndex:number,stream:CandidateStream):{matches:PageCandidate[];final:boolean}{
 const page=pages.find(p=>p.pageIndex===pageIndex);if(!page)return{matches:[],final:false};
 const start=pages.filter(p=>p.pageIndex<pageIndex).reduce((offset,p)=>offset+p.text.length+1,0),event=stream.get(pageIndex);
 const streamed=(event?.matches??[]).filter(m=>Number.isInteger(m.start)&&Number.isInteger(m.end)&&m.start>=start&&m.end<=start+page.text.length&&m.start<m.end).map(m=>({...m,start:m.start-start,end:m.end-start}));
 const merged=event?.final?streamed:[...page.machineCandidates,...streamed],unique=new Map(merged.map(m=>[key(m),m]));
 return{matches:[...unique.values()],final:event?.final??false};
}
