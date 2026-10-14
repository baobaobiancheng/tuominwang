import type {Anchor, Mark} from '../contracts/index.ts';
import type {Glyph} from './ocr.ts';
import {MAX_MARKS} from '../contracts/index.ts';
import {isReferenceNameBlacklistedStrict,validReferenceName} from './reference-rules.ts';

/** Independent implementation of source main.js:5682-5825 relation-diagram branches. Canonical page coordinates; no geometric guess may invent a text span. */
export type ReferenceSpatialToken={id:string;page:number;text:string;bbox:{x:number;y:number;width:number;height:number};start?:number;end?:number};
export type ReferenceSpatialCandidate=Mark & {page:number;bbox:ReferenceSpatialToken['bbox'];heading:string;tokenIds:string[]};
const headingPattern=/(?:股权结构|股东结构|控制关系|组织架构|组织结构|实际控制人|产权关系|出资关系)/u;
const percentagePattern=/^-?\d+(?:\.\d+)?\s*%$/u;
const sectionPattern=/^(?:\d+|[一二三四五六七八九十]+)[、.．](?!\d)\s*\S+/u;
const genericPerson=/^(?:合计|总计|其他|其中|自然人|法人|股东|股东名称|控股股东|实际控制人|一致行动人|社会公众股东|公众股东|持股比例|持股数量)$/u;
const organizationTail=/(?:有限责任公司|股份有限公司|有限公司|集团有限公司|集团公司|股份公司|总公司|分公司|子公司|有限合伙|合伙企业|人民政府|人民法院|高级人民法院|中级人民法院|基层人民法院|人民检察院|高级人民检察院|律师事务所|法律服务所|会计师事务所|税务师事务所|仲裁委员会|仲裁委|委员会|管理局|监督管理局|公安局|司法局|分局|派出所|公证处|交易所|商会|联合会|协会|中心|研究院|研究所|医院|大学|学院|学校|银行|支行|分行|信用社|保险公司|证券公司|基金管理公司|公司|集团)(?:\([^()]{1,12}\))?$/u;
const shortOrganizationTail=/(?:公司|集团|银行|证券|基金|事务所|中心|委员会|合伙企业|研究院|大学|医院|政府|局|院)$/u;
const minimum=(values:number[])=>values.reduce((a,b)=>Math.min(a,b),Infinity),maximum=(values:number[])=>values.reduce((a,b)=>Math.max(a,b),-Infinity);
const compact=(v:string)=>v.replace(/\s+/gu,'').trim();
const normalize=(v:string)=>compact(v.replace(/[・‧]/gu,'·').replace(/[‐‑‒–—―−﹘﹣－]/gu,'-').replace(/[（]/gu,'(').replace(/[）]/gu,')'));
const center=(t:ReferenceSpatialToken)=>t.bbox.x+t.bbox.width/2;
const validate=(t:ReferenceSpatialToken)=>{if(!t.id||!Number.isSafeInteger(t.page)||t.page<0||!t.text.isWellFormed()||![t.bbox.x,t.bbox.y,t.bbox.width,t.bbox.height].every(Number.isFinite)||t.bbox.x<0||t.bbox.y<0||t.bbox.width<=0||t.bbox.height<=0||!Number.isFinite(t.bbox.x+t.bbox.width)||!Number.isFinite(t.bbox.y+t.bbox.height))throw new Error('REFERENCE_SPATIAL_INVALID');};
export function classifyReferenceRelationNode(value:string,token:ReferenceSpatialToken,percentages:readonly ReferenceSpatialToken[]):'姓名'|'机构'|null{
 const v=compact(value),org=normalize(v).replace(/^["“”'‘’「『]+|["“”'‘’」』]+$/gu,'');
 if(org.length>=4&&organizationTail.test(org)||v.length>=4&&shortOrganizationTail.test(v))return '机构';
 if(!percentages.some(p=>{const vertical=p.bbox.y-(token.bbox.y+token.bbox.height);return p.page===token.page&&vertical>=-12&&vertical<=95&&Math.abs(center(p)-center(token))<=Math.max(46,.8*token.bbox.width,1.5*p.bbox.width);}))return null;
 if(!/^[\u3400-\u9fff·]{2,4}$/u.test(v)||isReferenceNameBlacklistedStrict(v)||!validReferenceName(v)&&(v.length>3||genericPerson.test(v)))return null;
 return '姓名';
}
function mergeRowTokens(tokens:ReferenceSpatialToken[],gap:(height:number)=>number){
 const ordered=[...tokens].sort((a,b)=>a.page-b.page||a.bbox.y-b.bbox.y||a.bbox.x-b.bbox.x),rows:ReferenceSpatialToken[][]=[];
 for(const token of ordered){const row=rows.at(-1),last=row?.at(-1);if(last&&last.page===token.page&&Math.abs(last.bbox.y+last.bbox.height/2-(token.bbox.y+token.bbox.height/2))<=Math.max(3,.45*Math.min(last.bbox.height,token.bbox.height))&&token.bbox.x-(last.bbox.x+last.bbox.width)<=gap(token.bbox.height))row!.push(token);else rows.push([token]);}
 return rows;
}
function mergeTokens(tokens:ReferenceSpatialToken[],id:string):ReferenceSpatialToken{
 const x=minimum(tokens.map(t=>t.bbox.x)),y=minimum(tokens.map(t=>t.bbox.y));
 return {...tokens[0],id,text:tokens.map(t=>t.text).join(''),end:tokens.at(-1)!.end,bbox:{x,y,width:maximum(tokens.map(t=>t.bbox.x+t.bbox.width))-x,height:maximum(tokens.map(t=>t.bbox.y+t.bbox.height))-y}};
}
type Diagram={heading:ReferenceSpatialToken;tokens:ReferenceSpatialToken[];percentages:ReferenceSpatialToken[]};
function diagrams(tokens:ReferenceSpatialToken[]):Diagram[]{
 const headings=tokens.filter(t=>headingPattern.test(compact(t.text)));
 for(const row of mergeRowTokens(tokens,h=>Math.max(8,h)))if(row.length>=2&&!row.some(t=>headingPattern.test(compact(t.text)))&&headingPattern.test(compact(row.map(t=>t.text).join(''))))headings.push(mergeTokens(row,'relation-heading:'+row.map(t=>t.id).join('-')));
 const pages=new Map<number,ReferenceSpatialToken[]>();for(const token of tokens){const list=pages.get(token.page)??[];list.push(token);pages.set(token.page,list);}
 const result:Diagram[]=[];
 for(const heading of headings){const page=pages.get(heading.page)!,nextSection=page.find(t=>t.bbox.y>heading.bbox.y+heading.bbox.height&&t.bbox.y-heading.bbox.y>80&&sectionPattern.test(compact(t.text))),bottom=Math.min(heading.bbox.y+460,nextSection?.bbox.y??Infinity);
  const selected=page.filter(t=>t.bbox.y>heading.bbox.y+heading.bbox.height-4&&t.bbox.y<bottom),merged=mergeRowTokens(selected,h=>Math.max(4,.65*h)).map(r=>r.length===1?r[0]:mergeTokens(r,'relation-node:'+r.map(t=>t.id).join('-'))),percentages=merged.filter(t=>percentagePattern.test(compact(t.text)));
  if(percentages.length>=2)result.push({heading,tokens:merged,percentages});
 }
 // Four aligned, horizontally spread percentages can identify a diagram without a title.
 for(const [page,all]of pages){if(result.some(d=>d.heading.page===page))continue;const rows:ReferenceSpatialToken[][]=[];
  for(const percent of all.filter(t=>percentagePattern.test(compact(t.text))).sort((a,b)=>a.bbox.y-b.bbox.y||a.bbox.x-b.bbox.x)){const cy=percent.bbox.y+percent.bbox.height/2,row=rows.find(r=>Math.abs(cy-(r[0].bbox.y+r[0].bbox.height/2))<=Math.max(10,.8*Math.max(r[0].bbox.height,percent.bbox.height)));if(row)row.push(percent);else rows.push([percent]);}
  const percentages=rows.filter(r=>r.length>=4).sort((a,b)=>b.length-a.length).find(r=>maximum(r.map(center))-minimum(r.map(center))>=160);if(!percentages)continue;
  const top=minimum(percentages.map(t=>t.bbox.y)),bottom=maximum(percentages.map(t=>t.bbox.y+t.bbox.height)),selected=all.filter(t=>t.bbox.y>=top-120&&t.bbox.y<=bottom+240);
  if(selected.filter(t=>!percentagePattern.test(compact(t.text))&&classifyReferenceRelationNode(compact(t.text),t,percentages)!==null).length>=4)result.push({heading:{...percentages[0],id:'relation-cluster:'+page,text:'股权关系图'},tokens:selected,percentages});
 }
 return result;
}
const safeBoundary=(text:string,n:number)=>!(n>0&&n<text.length&&/[\uD800-\uDBFF]/u.test(text[n-1])&&/[\uDC00-\uDFFF]/u.test(text[n]));
export function detectReferenceSpatialRelations(text:string,input:readonly ReferenceSpatialToken[]){
 if(!text.isWellFormed())throw new Error('INVALID_TEXT');if(input.length>200000)throw new Error('REFERENCE_SPATIAL_LIMIT');const tokens=[...input];tokens.forEach(validate);tokens.sort((a,b)=>a.page-b.page||a.bbox.y-b.bbox.y||a.bbox.x-b.bbox.x);
 const candidates:ReferenceSpatialCandidate[]=[],unbound:{tokenId:string;page:number;reason:'source-span-unbound'}[]=[];
 for(const diagram of diagrams(tokens))for(const token of diagram.tokens){const value=compact(token.text);if(!value||percentagePattern.test(value)||headingPattern.test(value)||sectionPattern.test(value)||/[，。；：！？]/u.test(value)||value.length>40)continue;const kind=classifyReferenceRelationNode(value,token,diagram.percentages);if(!kind)continue;
  if(!Number.isSafeInteger(token.start)||!Number.isSafeInteger(token.end)||token.start!<0||token.end!<=token.start!||token.end!>text.length||!safeBoundary(text,token.start!)||!safeBoundary(text,token.end!)||normalize(text.slice(token.start,token.end))!==normalize(value)){unbound.push({tokenId:token.id,page:token.page,reason:'source-span-unbound'});continue;}
  candidates.push({start:token.start!,end:token.end!,kind,decision:'pending',page:token.page,bbox:token.bbox,heading:compact(diagram.heading.text),tokenIds:[token.id],sources:[{layer:'rules',code:'SCENE-visual-relation-diagram',score:kind==='机构'?.95:.93}]});if(candidates.length>MAX_MARKS)throw new Error('MARK_LIMIT');
 }
 // Preserve distinct physically valid nodes; do not copy the source bbox-only placeholder (0,0).
 return {candidates:[...new Map(candidates.map(c=>[`${c.page}:${c.kind}:${c.start}:${c.end}:${c.bbox.x}:${c.bbox.y}`,c])).values()],unbound};
}
export function referenceSpatialTokensFromGlyphs(text:string,anchor:Anchor,glyphs:readonly Glyph[],page:number,bounds?:{width:number;height:number}):ReferenceSpatialToken[]{
 if(!text.isWellFormed()||!Number.isSafeInteger(page)||page<0||!Number.isSafeInteger(anchor.start)||!Number.isSafeInteger(anchor.end)||anchor.start<0||anchor.end<anchor.start||anchor.end>text.length||!safeBoundary(text,anchor.start)||!safeBoundary(text,anchor.end))throw new Error('REFERENCE_POSITION_INVALID');
 if(bounds&&(!Number.isFinite(bounds.width)||!Number.isFinite(bounds.height)||bounds.width<=0||bounds.height<=0))throw new Error('PAGE_POSITION_MISSING');
 if(!Array.isArray(glyphs))throw new Error('PAGE_POSITION_MISSING');
 for(const g of glyphs)if(!Array.isArray(g)||g.length!==6||!g.every(Number.isFinite)||!Number.isSafeInteger(g[0])||!Number.isSafeInteger(g[1])||g[0]<0||g[1]<=g[0]||g[1]>anchor.end-anchor.start||!safeBoundary(text,anchor.start+g[0])||!safeBoundary(text,anchor.start+g[1])||g[2]<0||g[3]<0||g[4]<0||g[5]<0||!Number.isFinite(g[2]+g[4])||!Number.isFinite(g[3]+g[5])||bounds&&(g[2]+g[4]>bounds.width+1e-6||g[3]+g[5]>bounds.height+1e-6))throw new Error('PAGE_POSITION_MISSING');
 const local=text.slice(anchor.start,anchor.end),result:ReferenceSpatialToken[]=[],ordered=[...glyphs].sort((a,b)=>a[0]-b[0]);let cursor=0,active:Glyph[]=[];
 for(const match of local.matchAll(/\S+/gu)){const start=match.index,end=start+match[0].length,selected:Glyph[]=[];while(cursor<ordered.length&&ordered[cursor][0]<end)active.push(ordered[cursor++]);active=active.filter(g=>g[1]>start);for(const g of active)if(g[4]>0&&g[5]>0)selected.push(g);if(!selected.length)continue;const covered=new Uint8Array(end-start);for(const g of selected){if(g.length!==6||!g.every(Number.isFinite)||!Number.isSafeInteger(g[0])||!Number.isSafeInteger(g[1])||g[0]<0||g[1]>local.length||g[1]<=g[0])throw new Error('PAGE_POSITION_MISSING');covered.fill(1,Math.max(start,g[0])-start,Math.min(end,g[1])-start);}if(covered.some(n=>!n))continue;
  const x=minimum(selected.map(g=>g[2])),y=minimum(selected.map(g=>g[3]));result.push({id:`page:${page}:token:${start}`,page,text:match[0],start:anchor.start+start,end:anchor.start+end,bbox:{x,y,width:maximum(selected.map(g=>g[2]+g[4]))-x,height:maximum(selected.map(g=>g[3]+g[5]))-y}});
 }
 return result;
}
