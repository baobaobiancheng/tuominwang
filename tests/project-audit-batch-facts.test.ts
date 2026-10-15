import {test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {correctionDocumentFactsMany,type CorrectionFactReadCount} from '../packages/adapters/project-entity-corrections.ts';
import {hash,seal,writeOriginal,writeArtifact} from '../packages/adapters/storage.ts';

test('three project seeds validate the same owned source, preview and glyph map once',async()=>{
 const oldDir=process.env.DATA_DIR,oldKey=process.env.DATA_KEY,dir=await mkdtemp(join(tmpdir(),'tmw-project-audit-facts-'));process.env.DATA_DIR=dir;process.env.DATA_KEY='c'.repeat(64);
 try{
 const id=randomUUID(),tenant=randomUUID(),project=randomUUID(),sourceId=randomUUID(),previewId=randomUUID(),mapId=randomUUID();
 const source=await readFile('tests/fixtures/image-utilities-synthetic.png'),text='甲乙',glyphs=[[0,1,1,1,10,10],[1,2,12,1,10,10]],map=JSON.stringify(glyphs);
 await writeOriginal(sourceId,source,id);await writeOriginal(previewId,source,id);await writeArtifact(mapId,map,id);
 const d={id,tenant_id:tenant,project_id:project,source_id:sourceId,source_hash:hash(source),content:seal(text,`${tenant}:${project}:${id}`),content_hash:hash(text),source_format:'png',state:'review',revision:1,anchors:[{kind:'page',page:0,start:0,end:2}],page_data:[{index:0,width:100,height:100,previewId,previewHash:hash(source),mapId,mapHash:hash(map)}],marks:[],page_review:null,entity_corrections:null};
 const requests=['甲','乙','甲乙'].map(value=>({recognizedText:value,correctedText:value,targetType:'name',source:'highlight-context-menu' as const}));
 const reads:CorrectionFactReadCount={sourceValidations:0,previewValidations:0,mapValidations:0,pdfOpens:0};
 const facts=await correctionDocumentFactsMany(d,requests,reads);
 expect(facts.length).toBe(3);expect(reads).toEqual({sourceValidations:1,previewValidations:1,mapValidations:1,pdfOpens:0});
 expect(facts.map(f=>f.supplementHits.map(hit=>[hit.start,hit.end]))).toEqual([[[0,1]],[[1,2]],[[0,2]]]);
 expect(facts.every(f=>f.sourceHash===hash(source)&&f.contentHash===hash(text)&&f.revision===1)).toBe(true);
 }finally{if(oldDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=oldDir;if(oldKey===undefined)delete process.env.DATA_KEY;else process.env.DATA_KEY=oldKey;await rm(dir,{recursive:true,force:true});}
});
