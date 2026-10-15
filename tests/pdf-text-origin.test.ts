import{describe,it,expect}from'vitest';import{classifyPdfTextOrigin as classify,readPdfTextOrigins,rebindPdfTextOrigins as rebind}from'../packages/core/pdf-text-origin.ts';
const source='a'.repeat(64),page={nativeTextLength:3,textSource:'hybrid',ocrRevision:0};
describe('PDF text origins survive exact OCR edit transforms',()=>{
 it('keeps a changed native prefix native and shifts OCR without text-prefix guessing',()=>{
  const updated=rebind(page,'abcXYZ','abcdefXYZ',source,1,3)!;expect(updated.nativeTextLength).toBe(6);const next={...page,...updated,ocrRevision:1};expect(classify(next,'abcdefXYZ',source,0,6)).toBe('native');expect(classify(next,'abcdefXYZ',source,6,9)).toBe('ocr');expect(classify(next,'abcdefXYZ',source,5,7)).toBe('mixed');
 });
 it('limits a boundary crossing replacement to mixed while retaining both outer sources',()=>{
  const updated=rebind(page,'abcXYZ','abqqYZ',source,2,4)!;expect(updated.textOriginFrame.segments).toEqual([{start:0,end:2,origin:'native'},{start:2,end:4,origin:'mixed'},{start:4,end:6,origin:'ocr'}]);const next={...page,...updated,ocrRevision:1};expect(classify(next,'abqqYZ',source,0,2)).toBe('native');expect(classify(next,'abqqYZ',source,2,3)).toBe('mixed');expect(classify(next,'abqqYZ',source,4,6)).toBe('ocr');
 });
 it('supports deletion, boundary insertion, empty pages and successive edits without stale binding',()=>{
  const removed=rebind(page,'abcXYZ','aYZ',source,1,4)!;const p={...page,...removed,ocrRevision:1};expect(removed.textOriginFrame.segments).toEqual([{start:0,end:1,origin:'native'},{start:1,end:3,origin:'ocr'}]);const inserted=rebind(p,'aYZ','aqYZ',source,1,1)!;expect(inserted.textOriginFrame.segments[1]!.origin).toBe('mixed');const empty=rebind(page,'abcXYZ','',source,0,6)!;expect(readPdfTextOrigins({...page,...empty,ocrRevision:1},'',source)).toEqual([]);
 });
 it('rejects forged/stale text, source or edit revision and does not invent old edited origins',()=>{
  const updated=rebind(page,'abcXYZ','aXYZ',source,1,3)!,p={...page,...updated,ocrRevision:1};expect(readPdfTextOrigins(p,'aXYY',source)).toBeNull();expect(readPdfTextOrigins(p,'aXYZ','b'.repeat(64))).toBeNull();expect(readPdfTextOrigins({...p,ocrRevision:2},'aXYZ',source)).toBeNull();expect(readPdfTextOrigins({...page,ocrRevision:1},'abcXYZ',source)).toBeNull();expect(classify({...page,nativeTextLength:7},'abcXYZ',source,0,1)).toBe('unknown');expect(readPdfTextOrigins({...page,textSource:'ocr'},'abcXYZ',source)).toBeNull();expect(()=>rebind(page,'abcXYZ','ZbcXYZ',source,2,3)).toThrow('PDF_TEXT_ORIGIN_INVALID');
 });
});
