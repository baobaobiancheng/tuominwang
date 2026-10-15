import{hasEntityGeometry}from'../contracts/entity-geometry.ts';
import sharp, {type OverlayOptions} from 'sharp';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import type {Anchor,Mark,ParsedPage,PageReview} from '../contracts/index.ts';
import type {Glyph} from './ocr.ts';
import {clearPixels,pageBoxes, type Box} from './page-redaction.ts';
import {replacementFor,validateMarks} from './redaction.ts';
import {PAGE_MAX_PIXELS} from './pdf-reader.ts';
export type VisualReplacementDraw={mark:{start:number;end:number;kind:Mark['kind']};bounds:Box;text:string};
export type VisualReplacementPlan={canonical:{width:number;height:number};erase:Box[];draws:VisualReplacementDraw[];finalClear?:Box[];hiddenValues:string[]};
const cancelled=(signal?:AbortSignal)=>{if(signal?.aborted)throw new Error('PROCESSING_CANCELLED');};
const compact=(value:string)=>value.replace(/\s/gu,'');
// Whitespace and an all-invisible formatting fragment have no raster glyphs.
// Keep the authenticated erasure without invoking Pango's empty-text error.
const visibleRasterText=(value:string)=>/[^\s\p{Default_Ignorable_Code_Point}]/u.test(value);
function lineBounds(glyphs:Glyph[],page:Pick<ParsedPage,'width'|'height'>){const lines:Box[]=[];for(const g of [...glyphs].sort((a,b)=>a[3]-b[3]||a[2]-b[2])){const box={x:Math.max(0,g[2]),y:Math.max(0,g[3]),width:Math.min(page.width,g[2]+g[4])-Math.max(0,g[2]),height:Math.min(page.height,g[3]+g[5])-Math.max(0,g[3])};if(box.width<=0||box.height<=0)continue;const line=lines.find(l=>Math.min(l.y+l.height,box.y+box.height)-Math.max(l.y,box.y)>=.55*Math.min(l.height,box.height));if(line){const right=Math.max(line.x+line.width,box.x+box.width),bottom=Math.max(line.y+line.height,box.y+box.height);line.x=Math.min(line.x,box.x);line.y=Math.min(line.y,box.y);line.width=right-line.x;line.height=bottom-line.y;}else lines.push(box);}return lines.sort((a,b)=>a.y-b.y||a.x-b.x);}
/** Conservative intersection for text visibility. Ellipse bounding-box corners
 * stay visible; a partially erased character/label is never exported as whole text. */
export function rectangleTouchesBox(rect:Box,box:Box):boolean{
 if(rect.x>=box.x+box.width||rect.x+rect.width<=box.x||rect.y>=box.y+box.height||rect.y+rect.height<=box.y)return false;
 if(box.shape!=='circle')return true;
 const rx=box.width/2,ry=box.height/2,cx=box.x+rx,cy=box.y+ry,x=Math.max(rect.x,Math.min(rect.x+rect.width,cx)),y=Math.max(rect.y,Math.min(rect.y+rect.height,cy));
 return ((x-cx)/rx)**2+((y-cy)/ry)**2<=1;
}
export function visibleVisualReplacementDraws(plan:VisualReplacementPlan){return plan.draws.filter(draw=>!(plan.finalClear??[]).some(box=>rectangleTouchesBox(draw.bounds,box)));}
/** Source meta.pseudonym is a rendering switch, not merely a mask string.
 * Default raster masking clears pixels; only explicit replacement choices draw. */
export function shouldDrawRasterReplacement(mark:Mark):boolean{
 const mode=mark.replacement?.mode;if(!mode||mode==='clear')return false;
 if(mark.rasterReplacement!==undefined)return mark.rasterReplacement;
 return !(mark.replacementOrigin==='overall'&&(mode==='full'||mode==='reference-mask'));
}
/** Positions stay in canonical upright-page units; this is the single plan shared by preview and export. */
export function visualReplacementPlan(text:string,marks:Mark[],anchors:Anchor[],page:Pick<ParsedPage,'index'|'width'|'height'>,glyphs:Glyph[],policy:PageReview,overrides:ReadonlyMap<number,Box[]>=new Map()):VisualReplacementPlan{
 validateMarks(text,marks,true);const anchor=anchors.find(a=>a.kind==='page'&&a.page===page.index);if(!anchor)throw new Error('PAGE_POSITION_MISSING');
 // Preserve the existing complete-glyph coverage and edge-clearing guarantees, without copying its replacement-mode restriction.
 const erase=pageBoxes(text,marks.map(m=>({...m,replacement:{mode:'full' as const}})),anchors,page,glyphs,policy,overrides),draws:VisualReplacementDraw[]=[],hiddenValues:string[]=[];
 for(const[markIndex,mark]of marks.entries()){
  if(!(mark.decision==='redact'&&mark.start<anchor.end&&mark.end>anchor.start))continue;
  const original=text.slice(mark.start,mark.end),hidden=compact(original);if(hidden)hiddenValues.push(hidden);
  if(!shouldDrawRasterReplacement(mark))continue;
  const derived=replacementFor(text,mark);if(!derived.isWellFormed()||compact(derived).includes(hidden))throw new Error('INVALID_REPLACEMENT');
  if(!visibleRasterText(derived))continue;
  // A continued mark is already cleared on every page. Its label is drawn once, on the page containing its start.
  if(mark.start<anchor.start)continue;
  const localStart=Math.max(mark.start,anchor.start)-anchor.start,localEnd=Math.min(mark.end,anchor.end)-anchor.start,positions=overrides.has(markIndex)?overrides.get(markIndex)!.map(b=>[localStart,localEnd,b.x,b.y,b.width,b.height]as Glyph):glyphs.filter(g=>g[0]<localEnd&&g[1]>localStart&&g[4]>0&&g[5]>0),lines=lineBounds(positions,page);if(!lines.length)throw new Error('PAGE_POSITION_MISSING');
  const points=[...derived],weights=lines.map(b=>Math.max(1,b.width/Math.max(1,b.height))),total=weights.reduce((a,b)=>a+b,0);let used=0,weight=0;
  for(let i=0;i<lines.length;i++){weight+=weights[i];const end=i===lines.length-1?points.length:Math.round(points.length*weight/total),fragment=points.slice(used,end).join('');used=end;if(!visibleRasterText(fragment))continue;const bounds=lines[i];
   // Clear the whole selected line rectangle before laying text over it; no original antialiasing remains between symbol boxes.
   const x=Math.max(0,bounds.x-2),y=Math.max(0,bounds.y-2);erase.push({x,y,width:Math.min(page.width,bounds.x+bounds.width+2)-x,height:Math.min(page.height,bounds.y+bounds.height+2)-y});draws.push({mark:{start:mark.start,end:mark.end,kind:mark.kind},bounds,text:fragment});
  }
  if(used!==points.length)throw new Error('VISUAL_TEXT_FIT_FAILED');
 }
 const finalClear=policy.regions.filter(r=>r.page===page.index&&!hasEntityGeometry(r)).map(({x,y,width,height,shape})=>({x,y,width,height,...shape?{shape}:{}}));
 return {canonical:{width:page.width,height:page.height},erase,draws,finalClear,hiddenValues:[...new Set(hiddenValues)]};
}
export async function verifyRenderFont(directory=resolve(process.env.RENDER_FONT_DIR??resolve(dirname(process.env.VISUAL_MODEL_DIR??'.data/models/visual'),'render'))){const lock=JSON.parse(await readFile(new URL('../../scripts/render-font-lock.json',import.meta.url),'utf8'));let font:Buffer|undefined;for(const[name,expected]of Object.entries(lock.files)){let bytes:Buffer;try{const info=await stat(resolve(directory,name));if(!info.isFile()||info.size!==lock.sizes[name])throw new Error('VISUAL_FONT_MISMATCH');bytes=await readFile(resolve(directory,name));}catch(e){if((e as Error).message==='VISUAL_FONT_MISMATCH')throw e;throw new Error('VISUAL_FONT_REQUIRED');}if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('VISUAL_FONT_MISMATCH');if(name==='NotoSansSC.ttf')font=bytes;}if(!font)throw new Error('VISUAL_FONT_REQUIRED');return{font,path:resolve(directory,'NotoSansSC.ttf'),family:lock.family as string};}
function glyphLookup(font:Buffer){let table=0;for(let i=0,n=font.readUInt16BE(4);i<n;i++){const p=12+i*16;if(font.toString('ascii',p,p+4)==='cmap'){table=font.readUInt32BE(p+8);break;}}if(!table)throw new Error('VISUAL_FONT_MISMATCH');const offsets:number[]=[];for(let i=0,n=font.readUInt16BE(table+2);i<n;i++)offsets.push(table+font.readUInt32BE(table+4+i*8+4));return(code:number)=>offsets.some(o=>{const format=font.readUInt16BE(o);if(format===12){let lo=0,hi=font.readUInt32BE(o+12)-1;while(lo<=hi){const mid=(lo+hi)>>>1,p=o+16+mid*12,start=font.readUInt32BE(p),end=font.readUInt32BE(p+4);if(code<start)hi=mid-1;else if(code>end)lo=mid+1;else return font.readUInt32BE(p+8)+code-start!==0;}return false;}if(format!==4||code>0xffff)return false;const count=font.readUInt16BE(o+6)/2;for(let i=0;i<count;i++){const end=font.readUInt16BE(o+14+i*2),start=font.readUInt16BE(o+16+count*2+i*2);if(code<start||code>end)continue;const delta=font.readInt16BE(o+16+count*4+i*2),rangeAt=o+16+count*6+i*2,range=font.readUInt16BE(rangeAt);if(!range)return((code+delta)&0xffff)!==0;const glyph=font.readUInt16BE(rangeAt+range+(code-start)*2);return glyph!==0&&((glyph+delta)&0xffff)!==0;}return false;});}
const escapeMarkup=(text:string)=>text.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&apos;');
/** No original metadata is copied; derived labels are rasterized only after clearPixels has verified erasure. */
export async function renderVisualReplacement(png:Buffer,page:Pick<ParsedPage,'index'|'width'|'height'>,plan:VisualReplacementPlan,style:NonNullable<PageReview['maskStyle']>='black',options:{signal?:AbortSignal;fontDirectory?:string}={}){
 cancelled(options.signal);if(page.width!==plan.canonical.width||page.height!==plan.canonical.height)throw new Error('SOURCE_MISMATCH');
 const cleared=await clearPixels(png,page,plan.erase,style);if(!plan.draws.length)return {...cleared,draws:plan.draws};
 if(plan.hiddenValues.some(value=>compact(plan.draws.map(d=>d.text).join('')).includes(value)))throw new Error('RESIDUE_FOUND');
 const font=await verifyRenderFont(options.fontDirectory),supports=glyphLookup(font.font),foreground=style==='black'||style==='purple'?'#ffffff':'#000000',composites:OverlayOptions[]=[];
 for(const draw of plan.draws){cancelled(options.signal);const {bounds}=draw;if(!draw.text.isWellFormed()||draw.text.length>200000||[...draw.text].some(c=>!/[\s\u200b]/u.test(c)&&!supports(c.codePointAt(0)!)))throw new Error('VISUAL_FONT_GLYPH_REQUIRED');if(![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.x<0||bounds.y<0||bounds.width<=0||bounds.height<=0||bounds.x+bounds.width>page.width||bounds.y+bounds.height>page.height)throw new Error('PAGE_POSITION_MISSING');
  if(!plan.erase.some(b=>b.shape!=='circle'&&b.x<=bounds.x&&b.y<=bounds.y&&b.x+b.width>=bounds.x+bounds.width&&b.y+b.height>=bounds.y+bounds.height))throw new Error('PAGE_POSITION_MISSING');
  const left=Math.ceil(bounds.x*cleared.width/page.width),top=Math.ceil(bounds.y*cleared.height/page.height),right=Math.floor((bounds.x+bounds.width)*cleared.width/page.width),bottom=Math.floor((bounds.y+bounds.height)*cleared.height/page.height),width=right-left,height=bottom-top;if(width<1||height<1)throw new Error('VISUAL_TEXT_FIT_FAILED');
  const input=await sharp({text:{text:`<span foreground="${foreground}">${escapeMarkup(draw.text)}</span>`,font:font.family+' 12',fontfile:font.path,width,height,align:'center',wrap:'char',rgba:true},limitInputPixels:PAGE_MAX_PIXELS}).png().toBuffer(),meta=await sharp(input).metadata();if(!meta.width||!meta.height||meta.width>width||meta.height>height)throw new Error('VISUAL_TEXT_FIT_FAILED');composites.push({input,left:left+Math.floor((width-meta.width)/2),top:top+Math.floor((height-meta.height)/2)});
 }
 const composed=await sharp(cleared.rgb,{raw:{width:cleared.width,height:cleared.height,channels:3}}).composite(composites).removeAlpha().png().toBuffer();
 // An explicitly cleared region is authoritative even when a separately approved
 // text replacement overlaps it. Never repaint partial originals/aliases over it.
 const final=(plan.finalClear?.length)?await clearPixels(composed,page,plan.finalClear,style):undefined,output=final?.png??composed,rgb=final?.rgb??await sharp(output).removeAlpha().raw().toBuffer(),meta=await sharp(output).metadata();if(meta.exif||meta.xmp||meta.icc||meta.iptc||(meta.pages??1)!==1||rgb.length!==cleared.rgb.length)throw new Error('PIXEL_VERIFICATION_FAILED');cancelled(options.signal);return {png:output,rgb,width:cleared.width,height:cleared.height,draws:plan.draws};
}
export function verifyVisualReplacementText(plan:VisualReplacementPlan,recognized:string){const actual=compact(recognized);if(plan.hiddenValues.some(v=>actual.includes(v)))throw new Error('RESIDUE_FOUND');}
