import type {Glyph} from './ocr.ts';

export type SelectableOcrBox={x:number;y:number;width:number;height:number};
export type SelectableOcrLine={text:string;confidence:number;bbox:SelectableOcrBox;charBoxes:{text:string;bbox:SelectableOcrBox}[]};
export type SelectableOcrPage={revision:number;page:number;pageWidth:number;pageHeight:number;rotation:number;previewHash:string;selectionOnly:true;lines:SelectableOcrLine[]};

// OCR offsets belong to this temporary recognition text, never document.content.
export function selectableOcrLines(result:{text:string;glyphs:Glyph[];confidence:number},width:number,height:number):SelectableOcrLine[]{
 if(!result.text.isWellFormed()||![width,height,result.confidence].every(Number.isFinite)||width<=0||height<=0||!Array.isArray(result.glyphs))throw Error('OCR_SELECTION_INVALID');
 let previousEnd=0;for(const g of result.glyphs){if(!Array.isArray(g)||g.length!==6||!g.every(Number.isFinite)||!Number.isSafeInteger(g[0])||!Number.isSafeInteger(g[1])||g[0]<previousEnd||g[1]<=g[0]||g[1]>result.text.length||g[2]<0||g[3]<0||g[4]<0||g[5]<0||g[2]+g[4]>width+1e-5||g[3]+g[5]>height+1e-5)throw Error('OCR_SELECTION_INVALID');previousEnd=g[1];}
 const lines:SelectableOcrLine[]=[];let start=0,glyphIndex=0;
 for(const value of result.text.split('\n')){
  const end=start+value.length,boxes:{text:string;bbox:SelectableOcrBox}[]=[];
  while(glyphIndex<result.glyphs.length&&result.glyphs[glyphIndex][0]<end){
   const g=result.glyphs[glyphIndex++];if(g[0]<start||g[1]>end)throw Error('OCR_SELECTION_INVALID');if(!g[4]||!g[5])continue;
   boxes.push({text:result.text.slice(g[0],g[1]),bbox:{x:g[2],y:g[3],width:g[4],height:g[5]}});
  }
  if(boxes.length){const left=Math.min(...boxes.map(b=>b.bbox.x)),top=Math.min(...boxes.map(b=>b.bbox.y)),right=Math.max(...boxes.map(b=>b.bbox.x+b.bbox.width)),bottom=Math.max(...boxes.map(b=>b.bbox.y+b.bbox.height));lines.push({text:value,confidence:result.confidence,bbox:{x:left,y:top,width:right-left,height:bottom-top},charBoxes:boxes});}
  start=end+1;
 }
 return lines;
}
