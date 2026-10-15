import type { Mark } from '../contracts/index.ts';
import type { OcrTextView } from '../contracts/ocr.ts';
export type ImageBox={x:number;y:number;width:number;height:number};
export function canonicalImageBox(box:ImageBox,canvas:{width:number;height:number},page:{width:number;height:number}):ImageBox{
 for(const n of [box.x,box.y,box.width,box.height,canvas.width,canvas.height,page.width,page.height])if(!Number.isFinite(n))throw new Error('IMAGE_REGION_INVALID');
 if(box.x<0||box.y<0||box.width<=0||box.height<=0||canvas.width<=0||canvas.height<=0||page.width<=0||page.height<=0||box.x+box.width>canvas.width+1e-7||box.y+box.height>canvas.height+1e-7)throw new Error('IMAGE_REGION_INVALID');
 const sx=page.width/canvas.width,sy=page.height/canvas.height;return {x:box.x*sx,y:box.y*sy,width:box.width*sx,height:box.height*sy};
}
// The reference region endpoint reads its OCR cache; it does not rerun a model.
// A glyph is selected by its centre, then emitted in source line order.
export function selectOcrRegion(view:OcrTextView,box:ImageBox,canvas={width:view.width,height:view.height}){
 const region=canonicalImageBox(box,canvas,view),selected:OcrTextView['glyphs']=[];let approximate=false;
 for(const g of view.glyphs){if(g.length!==6||!g.every(Number.isFinite)||!Number.isSafeInteger(g[0])||!Number.isSafeInteger(g[1])||g[0]<0||g[1]<=g[0]||g[1]>view.text.length||g[2]<0||g[3]<0||g[4]<=0||g[5]<=0||g[2]+g[4]>view.width+1e-5||g[3]+g[5]>view.height+1e-5)throw new Error('OCR_MAP_INVALID');const value=view.text.slice(g[0],g[1]);if(!value.isWellFormed())throw new Error('OCR_MAP_INVALID');const letters=[...value];
  if(letters.length===1){const cx=g[2]+g[4]/2,cy=g[3]+g[5]/2;if(cx>=region.x&&cx<=region.x+region.width&&cy>=region.y&&cy<=region.y+region.height)selected.push(g);continue;}
  // Legacy maps can contain whole words without character boxes. Keep the reference
  // uniform-width fallback, explicitly label it approximate and never split a surrogate.
  if(g[2]+g[4]<region.x||g[2]>region.x+region.width||g[3]+g[5]<region.y||g[3]>region.y+region.height)continue;
  approximate=true;const visible=letters.filter(c=>!/\s/u.test(c)),step=g[4]/Math.max(1,visible.length),from=Math.max(0,Math.floor((region.x-g[2])/step)),to=Math.min(visible.length,Math.ceil((region.x+region.width-g[2])/step));let index=0,offset=g[0];for(const letter of letters){if(!/\s/u.test(letter)){if(index>=from&&index<to)selected.push([offset,offset+letter.length,g[2]+index*step,g[3],step,g[5]]);index++;}offset+=letter.length;}
 }selected.sort((a,b)=>a[0]-b[0]);
 const text=selected.map(g=>view.text.slice(g[0],g[1])).join('').trim();let bounds:ImageBox|null=null;
 if(selected.length){const x=selected.reduce((n,g)=>Math.min(n,g[2]),Infinity),y=selected.reduce((n,g)=>Math.min(n,g[3]),Infinity),right=selected.reduce((n,g)=>Math.max(n,g[2]+g[4]),-Infinity),bottom=selected.reduce((n,g)=>Math.max(n,g[3]+g[5]),-Infinity);bounds={x:x*canvas.width/view.width,y:y*canvas.height/view.height,width:(right-x)*canvas.width/view.width,height:(bottom-y)*canvas.height/view.height};}
 return {success:true,text,ocrBbox:bounds,canonicalRegion:region,revision:view.revision,page:view.page,method:approximate?'cached-word-width-fallback':'cached-glyph-centres',approximate};
}
export type ImageLabel=ImageBox&{type:string;confidence?:number;source?:string;meta?:Record<string,unknown>;id?:string;text?:string;shape?:'rect'|'circle';start?:number;end?:number;decision?:Mark['decision']};
export const imageRegionType=(reason:string)=>({印章:'seal',签名:'signature',人脸:'face',敏感区域:'other'} as Record<string,string>)[reason]??reason;
const nativeImageTypes:Record<string,string>={手机号:'phone',固定电话:'phone',邮箱:'email',身份证号:'id_card',银行账号:'bank_card',信用代码:'uscc',案号:'case_number',护照号:'passport_no',姓名:'name_cn',机构:'org_name',地址:'address',金额:'contract_amount',商业秘密:'other',自定义:'other','证券/资金账号':'securities_account',车牌号:'plate_cn',微信号:'wechat_id',网址:'website_url',专利号:'patent_no',备案号:'filing_no','证照/许可证号':'cert_no',税号:'tax_no',雇主识别号:'ein',国际身份证号:'international_id',社保号:'ssn',公文编号:'official_no'};
// One annotation per real glyph-line fragment: never a guessed enclosing rectangle
// spanning unrelated page text. Absolute source offsets survive as provenance.
export function buildImageReviewLabels(view:OcrTextView,anchorStart:number,marks:Mark[],regions:ImageLabel[]=[]):ImageLabel[]{
 if(!Number.isSafeInteger(anchorStart)||anchorStart<0)throw new Error('IMAGE_ANCHOR_INVALID');
 selectOcrRegion(view,{x:0,y:0,width:view.width,height:view.height}); // validates all canonical glyphs
 const labels:ImageLabel[]=[];
 for(const [index,mark]of marks.entries()){
  const start=mark.start-anchorStart,end=mark.end-anchorStart;if(start<0||end>view.text.length||end<=start)continue;
  if(!view.text.slice(start,end).isWellFormed())throw new Error('IMAGE_LABEL_INVALID');
  const hits=view.glyphs.filter(g=>g[0]<end&&g[1]>start);const lines:typeof hits[]=[];
  for(const glyph of hits){const line=lines.find(row=>Math.min(row[0][3]+row[0][5],glyph[3]+glyph[5])-Math.max(row[0][3],glyph[3])>=Math.min(row[0][5],glyph[5])*.5);if(line)line.push(glyph);else lines.push([glyph]);}
  for(const [part,line]of lines.entries()){const left=line.reduce((v,g)=>Math.min(v,g[2]),Infinity),top=line.reduce((v,g)=>Math.min(v,g[3]),Infinity),right=line.reduce((v,g)=>Math.max(v,g[2]+g[4]),-Infinity),bottom=line.reduce((v,g)=>Math.max(v,g[3]+g[5]),-Infinity);const source=mark.sources?.find(s=>s.layer==='manual')??mark.sources?.[0];labels.push({id:`mark-${index}-${part}`,text:view.text.slice(start,end),type:mark.rawEntityType??nativeImageTypes[mark.kind]??'other',x:left,y:top,width:right-left,height:bottom-top,shape:'rect',source:source?.layer??'rules',confidence:source?.score??1,start:mark.start,end:mark.end,decision:mark.decision});}
 }
 return [...labels,...regions.map(r=>({...r,type:imageRegionType(r.type),shape:r.shape??'rect'}))];
}

export function exportImageLabels(name:string,size:{width:number;height:number},labels:ImageLabel[],now=new Date().toISOString()){
 if(!Number.isFinite(size.width)||!Number.isFinite(size.height)||size.width<=0||size.height<=0)throw new Error('IMAGE_DIMENSIONS_INVALID');
 const entities=labels.map(label=>{const bbox=canonicalImageBox(label,size,size);if(!label.type||!label.type.isWellFormed()||label.confidence!==undefined&&(!Number.isFinite(label.confidence)||label.confidence<0||label.confidence>1)||label.source!==undefined&&(!label.source.isWellFormed()||label.source.includes('\0')))throw new Error('IMAGE_LABEL_INVALID');return {type:label.type,bbox_normalized:{x:bbox.x/size.width,y:bbox.y/size.height,width:bbox.width/size.width,height:bbox.height/size.height},bbox_absolute:bbox,confidence:label.confidence??1,source:label.source??'manual'};});
 return {image:name,imagePath:name,imageSize:{width:size.width,height:size.height},entities,exportedAt:now,version:'1.0'};
}
export function exportImageAnnotations(name:string,size:{width:number;height:number},labels:ImageLabel[],now=new Date().toISOString()){
 exportImageLabels(name,size,labels,now);return {image:name,imagePath:name,imageSize:{width:size.width,height:size.height},bboxes:labels,savedAt:now,version:'1.0'};
}
