import {test,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {writeArtifact,writeOriginal,seal,hash} from '../packages/adapters/storage.ts';
import {documentSpatialMarks} from '../packages/adapters/reference-spatial.ts';
import {correctOcrText} from '../packages/adapters/ocr-correction.ts';
import {applyReplacementPolicies} from '../packages/core/replacement-policies.ts';
import {profileReplacementPolicies,finalizeProfileReplacements} from '../packages/core/profile-recognition.ts';
import {defaultProfile} from '../packages/core/presets.ts';
import type {Glyph} from '../packages/core/ocr.ts';
import type {ParsedPage,Anchor} from '../packages/contracts/index.ts';
test('spatial adapter authenticates maps, supports corrected override and confines page geometry',async()=>{
 const oldDir=process.env.DATA_DIR,oldKey=process.env.DATA_KEY,dir=await mkdtemp(join(tmpdir(),'tmw-spatial-test-'));process.env.DATA_DIR=dir;process.env.DATA_KEY='a'.repeat(64);
 try{
  const parts=['股权结构','张三','王五','50%','50%'],text=parts.join('\n'),glyphs:Glyph[]=[];let offset=0;
  for(const [i,v] of parts.entries()){const x=[0,0,100,0,100][i],y=[0,30,30,65,65][i];glyphs.push([offset,offset+v.length,x,y,40,15]);offset+=v.length+1;}
  const mapId=randomUUID(),mapHash=await writeArtifact(mapId,JSON.stringify(glyphs)),page:ParsedPage={index:0,width:200,height:120,mapId,mapHash,rotation:0,confidence:1,previewId:randomUUID(),previewHash:'0'.repeat(64)},anchors:Anchor[]=[{kind:'page',page:0,start:0,end:text.length}];
  expect((await documentSpatialMarks(text,anchors,[page])).map(m=>text.slice(m.start,m.end))).toEqual(['张三','王五']);
  await expect(documentSpatialMarks(text,anchors,[{...page,mapHash:'0'.repeat(64)}])).rejects.toThrow('SOURCE_MISMATCH');
  await expect(documentSpatialMarks(text,[],[page])).rejects.toThrow('PAGE_POSITION_MISSING');
  expect(await documentSpatialMarks(text,anchors,[{...page,mapId:randomUUID()}],new Map([[0,glyphs]]))).toHaveLength(2);
  await expect(documentSpatialMarks(text,anchors,[{...page,width:10}])).rejects.toThrow('PAGE_POSITION_MISSING');
 }finally{if(oldDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=oldDir;if(oldKey===undefined)delete process.env.DATA_KEY;else process.env.DATA_KEY=oldKey;await rm(dir,{recursive:true});}
});
test('OCR correction uses the selected receipt route and inherited profile without approving candidates',async()=>{
 const oldDir=process.env.DATA_DIR,oldKey=process.env.DATA_KEY,dir=await mkdtemp(join(tmpdir(),'tmw-ocr-context-test-'));process.env.DATA_DIR=dir;process.env.DATA_KEY='b'.repeat(64);
 try{
  const text='转账申请人 收款方付款方\n2026-10-14 12:00:00张三',id=randomUUID(),tenant_id=randomUUID(),project_id=randomUUID(),mapId=randomUUID(),glyphs:Glyph[]=[];
  for(let i=0;i<text.length;i++)if(text[i]!=='\n')glyphs.push([i,i+1,(i%7)*10,Math.floor(i/7)*25,10,15]);
  const previewId=randomUUID(),preview=await sharp({create:{width:100,height:200,channels:3,background:'#ffffff'}}).png().toBuffer();
  await writeOriginal(previewId,preview,id);
  const mapHash=await writeArtifact(mapId,JSON.stringify(glyphs)),anchors:Anchor[]=[{kind:'page',page:0,start:0,end:text.length}],page:ParsedPage={index:0,width:100,height:200,mapId,mapHash,rotation:0,confidence:1,previewId,previewHash:hash(preview)},profile=defaultProfile();profile.image.defaultMode='default_star';
  const d={id,tenant_id,project_id,content:seal(text,`${tenant_id}:${project_id}:${id}`),content_hash:hash(text),anchors,page_data:[page],marks:[],source_format:'png',ner_enabled:false,presetPolicy:{profile:{settings:profile},revision:0}};
  const edit={revision:0,start:text.length-2,end:text.length,expectedText:'张三',text:'李四'};
  const automatic=await correctOcrText(d,0,edit);expect(automatic.marks!.some(m=>m.sources?.some(s=>s.code.includes('SCENE-receipt')))).toBe(false);
  await expect(correctOcrText({...d,page_data:[{...page,previewHash:'0'.repeat(64)}]},0,edit)).rejects.toThrow('SOURCE_MISMATCH');
  const result=await correctOcrText({...d,documentPolicy:{configuration:{documentType:'screenshot'}}},0,edit);
  const next=text.slice(0,-2)+'李四';expect(result.marks!.some(m=>m.sources?.some(s=>s.code.includes('SCENE-receipt')))).toBe(true);
  const marks=finalizeProfileReplacements(applyReplacementPolicies(next,result.marks!,profileReplacementPolicies(profile,'png')).marks,result.anchors!,profile,'png');expect(marks.every(m=>m.decision==='pending')).toBe(true);expect(marks.every(m=>m.replacement?.mode==='reference-mask')).toBe(true);
 }finally{if(oldDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=oldDir;if(oldKey===undefined)delete process.env.DATA_KEY;else process.env.DATA_KEY=oldKey;await rm(dir,{recursive:true});}
});
