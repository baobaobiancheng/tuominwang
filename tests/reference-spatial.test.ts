import {it,expect} from 'vitest';
import {classifyReferenceRelationNode,detectReferenceSpatialRelations,referenceSpatialTokensFromGlyphs,type ReferenceSpatialToken} from '../packages/core/reference-spatial.ts';
import type {Glyph} from '../packages/core/ocr.ts';
function fixture(items:{text:string;x:number;y:number;width?:number}[]){let text='';const tokens:ReferenceSpatialToken[]=[];for(const [i,item]of items.entries()){const start=text.length;text+=item.text+'\n';tokens.push({id:'synthetic:'+i,page:0,start,end:start+item.text.length,text:item.text,bbox:{x:item.x,y:item.y,width:item.width??40,height:15}});}return{text:text.slice(0,-1),tokens};}
it('runs the source headed graph branch, spatial person fallback, strict blacklist and organization classifier',()=>{
 const f=fixture([{text:'股权结构',x:20,y:0},{text:'張明',x:20,y:30},{text:'王五',x:120,y:30},{text:'自然人',x:220,y:30},{text:'合成甲有限公司',x:320,y:30,width:80},{text:'40%',x:20,y:65},{text:'60%',x:120,y:65},{text:'10%',x:220,y:65}]);
 const c=detectReferenceSpatialRelations(f.text,f.tokens).candidates;
 expect(c.map(m=>f.text.slice(m.start,m.end))).toEqual(['張明','王五','合成甲有限公司']);expect(c.every(m=>m.decision==='pending')).toBe(true);expect(c.every(m=>m.sources?.[0].code==='SCENE-visual-relation-diagram')).toBe(true);
 expect(classifyReferenceRelationNode('提交材料',f.tokens[1],f.tokens)).toBeNull();expect(classifyReferenceRelationNode('股东',f.tokens[1],f.tokens)).toBeNull();
});
it('merges split headings and same-row organization nodes while preserving canonical original spans',()=>{
 const f=fixture([{text:'股权',x:10,y:0,width:20},{text:'结构',x:32,y:0,width:20},{text:'合成甲',x:10,y:30,width:30},{text:'有限公司',x:42,y:30,width:40},{text:'王五',x:130,y:30},{text:'50%',x:10,y:70},{text:'50%',x:130,y:70}]);const c=detectReferenceSpatialRelations(f.text,f.tokens).candidates;expect(c.map(m=>f.text.slice(m.start,m.end))).toEqual(['合成甲\n有限公司','王五']);
});
it('activates the title-free four-percentage cluster and rejects three-percentage or compact false clusters',()=>{
 const items=[];for(let i=0;i<4;i++){items.push({text:['张三','李四','王五','赵六'][i],x:20+i*80,y:20},{text:'25%',x:20+i*80,y:60});}const f=fixture(items);expect(detectReferenceSpatialRelations(f.text,f.tokens).candidates).toHaveLength(4);
 const short=fixture(items.slice(0,6));expect(detectReferenceSpatialRelations(short.text,short.tokens).candidates).toEqual([]);
 const close=fixture(items.map(i=>({...i,x:20})));expect(detectReferenceSpatialRelations(close.text,close.tokens).candidates).toEqual([]);
});
it('never uses another page percentage, far below percentages, paragraph following a section, or guessed source offset',()=>{
 const f=fixture([{text:'控制关系',x:20,y:0},{text:'张三',x:20,y:30},{text:'合成甲有限公司',x:200,y:35,width:80},{text:'50%',x:20,y:200},{text:'50%',x:200,y:200},{text:'一、其他事项',x:20,y:110}]);expect(detectReferenceSpatialRelations(f.text,f.tokens).candidates).toEqual([]);
 const candidate=f.tokens[1],percentage={...f.tokens[3],page:1,bbox:{x:20,y:65,width:40,height:15}};expect(classifyReferenceRelationNode('张三',candidate,[percentage])).toBeNull();
 const valid=fixture([{text:'控制关系',x:20,y:0},{text:'张三',x:20,y:30},{text:'50%',x:20,y:65},{text:'50%',x:150,y:65}]);valid.tokens[1].start=999;const result=detectReferenceSpatialRelations(valid.text,valid.tokens);expect(result.candidates).toEqual([]);expect(result.unbound).toHaveLength(1);
});
it('builds strong glyph-bound tokens in exact UTF16 with no missing-character acceptance',()=>{
 const text='😀张 三\n50%';const glyphs:Glyph[]=[[0,2,10,10,10,10],[2,3,20,10,10,10],[4,5,32,10,10,10],[6,7,10,35,10,10],[7,8,20,35,10,10],[8,9,30,35,10,10]];
 const tokens=referenceSpatialTokensFromGlyphs(text,{kind:'page',page:0,start:0,end:text.length},glyphs,0);expect(tokens.map(t=>text.slice(t.start,t.end))).toEqual(['😀张','三','50%']);expect(referenceSpatialTokensFromGlyphs(text,{kind:'page',start:0,end:text.length},glyphs.slice(1),0).map(t=>t.text)).not.toContain('😀张');
 expect(()=>detectReferenceSpatialRelations(text,[{...tokens[0],bbox:{x:-1,y:1,width:2,height:2}}])).toThrow('REFERENCE_SPATIAL_INVALID');
});
import golden from './fixtures/reference-spatial-golden.json' with {type:'json'};
it('matches all 100 frozen source spatial branches without source runtime in release',()=>{for(const row of golden){const actual=detectReferenceSpatialRelations(row.text,row.tokens).candidates.map(m=>({start:m.start,end:m.end,kind:m.kind,bbox:m.bbox})).sort((a,b)=>a.start-b.start||a.end-b.end);expect(actual,JSON.stringify([row.headed,row.gap,row.n,row.rowWidth])).toEqual(row.expected);}});
it('rejects glyphs outside canonical raster, numeric overflow, invalid tuple arrays and split surrogate offsets',()=>{
 const text='😀张三',anchor={kind:'page' as const,page:0,start:0,end:text.length},glyphs:Glyph[]=[[0,2,0,0,10,10],[2,3,10,0,10,10],[3,4,20,0,10,10]];
 expect(referenceSpatialTokensFromGlyphs(text,anchor,glyphs,0,{width:30,height:10})).toHaveLength(1);
 for(const bad of [[0,2,-1,0,10,10],[0,2,0,-1,10,10],[0,2,29,0,2,10],[0,2,0,9,10,2],[0,2,Number.MAX_VALUE,0,Number.MAX_VALUE,10],[0,1,0,0,10,10]] as Glyph[])expect(()=>referenceSpatialTokensFromGlyphs(text,anchor,[bad],0,{width:30,height:10})).toThrow('PAGE_POSITION_MISSING');
 expect(()=>referenceSpatialTokensFromGlyphs(text,anchor,{} as Glyph[],0)).toThrow('PAGE_POSITION_MISSING');
 expect(()=>referenceSpatialTokensFromGlyphs(text,anchor,[null] as unknown as Glyph[],0)).toThrow('PAGE_POSITION_MISSING');
 expect(()=>referenceSpatialTokensFromGlyphs(text,{...anchor,start:1},glyphs,0)).toThrow('REFERENCE_POSITION_INVALID');
 expect(()=>referenceSpatialTokensFromGlyphs(text,anchor,glyphs,0,{width:0,height:10})).toThrow('PAGE_POSITION_MISSING');
});
