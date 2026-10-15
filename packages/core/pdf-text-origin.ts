import {createHash} from 'node:crypto';
export type PdfTextOrigin='native'|'ocr'|'mixed';
export interface PdfTextOriginSegment{start:number;end:number;origin:PdfTextOrigin}
export interface PdfTextOriginFrame{version:1;sourceHash:string;textHash:string;ocrRevision:number;segments:PdfTextOriginSegment[]}
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const validSegments=(value:unknown,length:number):value is PdfTextOriginSegment[]=>{
 if(!Array.isArray(value))return false;let cursor=0;
 for(const s of value){if(!s||typeof s!=='object'||!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.start!==cursor||s.end<=s.start||s.end>length||!['native','ocr','mixed'].includes(s.origin))return false;cursor=s.end;}
 return cursor===length;
};
/** Stored origins are valid only for the exact current source, page text and OCR edit revision. */
export function readPdfTextOrigins(page:any,text:string,sourceHash:string):PdfTextOriginSegment[]|null{
 if(page.textOriginFrame!==undefined){const f=page.textOriginFrame;
  return f?.version===1&&f.sourceHash===sourceHash&&f.textHash===digest(text)&&f.ocrRevision===(page.ocrRevision??0)&&validSegments(f.segments,text.length)?f.segments.map((s:PdfTextOriginSegment)=>({...s})):null;
 }
 // Historical edited pages did not record an exact transform. Do not infer one
 // from OCR confidence, a current prefix length, or coincidentally equal text.
 if((page.ocrRevision??0)!==0||!Number.isSafeInteger(page.nativeTextLength)||page.nativeTextLength<0||page.nativeTextLength>text.length||!['native','ocr','hybrid'].includes(page.textSource))return null;
 const n=page.nativeTextLength;if(page.textSource!==(n===0?'ocr':n===text.length?'native':'hybrid'))return null;return[...(n?[{start:0,end:n,origin:'native' as const}]:[]),...(n<text.length?[{start:n,end:text.length,origin:'ocr' as const}]:[])];
}
export function classifyPdfTextOrigin(page:any,text:string,sourceHash:string,start:number,end:number):PdfTextOrigin|'unknown'{
 const segments=readPdfTextOrigins(page,text,sourceHash);if(!segments||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>text.length)return'unknown';
 const types=new Set(segments.filter(s=>s.start<end&&s.end>start).map(s=>s.origin));return types.size===1?[...types][0]!:'mixed';
}
/** Preserve exact unchanged ranges; only a replacement crossing sources is mixed. */
export function rebindPdfTextOrigins(page:any,before:string,after:string,sourceHash:string,start:number,end:number):{textOriginFrame:PdfTextOriginFrame;nativeTextLength:number;textSource:'native'|'ocr'|'hybrid'}|null{
 const old=readPdfTextOrigins(page,before,sourceHash);if(!old)return null;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>before.length)throw new Error('PDF_TEXT_ORIGIN_INVALID');
 const delta=after.length-before.length,replacementLength=end-start+delta;if(replacementLength<0||before.slice(0,start)!==after.slice(0,start)||before.slice(end)!==after.slice(start+replacementLength))throw new Error('PDF_TEXT_ORIGIN_INVALID');
 const overlapping=old.filter(s=>start===end?s.start<=start&&s.end>=start:s.start<end&&s.end>start),types=new Set(overlapping.map(s=>s.origin));
 const origin:PdfTextOrigin=types.size===1?[...types][0]!:'mixed';const raw:PdfTextOriginSegment[]=[];
 for(const s of old)if(s.start<start)raw.push({start:s.start,end:Math.min(s.end,start),origin:s.origin});
 if(replacementLength)raw.push({start,end:start+replacementLength,origin});
 for(const s of old)if(s.end>end)raw.push({start:Math.max(s.start,end)+delta,end:s.end+delta,origin:s.origin});
 const segments:PdfTextOriginSegment[]=[];for(const s of raw){const last=segments.at(-1);if(last&&last.end===s.start&&last.origin===s.origin)last.end=s.end;else segments.push(s);}
 if(!validSegments(segments,after.length))throw new Error('PDF_TEXT_ORIGIN_INVALID');
 const first=segments[0],nativeTextLength=first?.origin==='native'?first.end:0,all=new Set(segments.map(s=>s.origin));
 return{textOriginFrame:{version:1,sourceHash,textHash:digest(after),ocrRevision:(page.ocrRevision??0)+1,segments},nativeTextLength,textSource:all.size===1&&all.has('native')?'native':all.size===1&&all.has('ocr')?'ocr':'hybrid'};
}
