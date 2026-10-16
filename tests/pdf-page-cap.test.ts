import {test,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pdfFixture} from './pdf-fixtures.ts';
import {openPdf} from '../packages/core/pdf-reader.ts';
import {parsePages} from '../packages/adapters/page-parser.ts';
import {coverageComplete} from '../packages/core/export-gate.ts';
import {RasterPdf,validatePageReview} from '../packages/core/page-redaction.ts';

// 301 tiny public synthetic pages exercise the real parser, page policy, and
// image-only PDF writer while retaining the ordinary per-page resource gates.
test('301-page PDF parses, reviews and exports, with page 302 rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tmw-pdf301-')),prior=process.env.DATA_DIR,priorKey=process.env.DATA_KEY;
 process.env.DATA_DIR=dir;process.env.DATA_KEY='ab'.repeat(32);
 try{
  const source=pdfFixture({pages:301,width:40,height:40,x:1,y:10,text:'Public 13800138000'});
  const opened=await openPdf(source);
  try{expect(opened.count).toBe(301);expect((await opened.page(300,1)).width).toBe(40);await expect(opened.page(301,1)).rejects.toThrow('INVALID_PDF_PAGE');}finally{opened.close();}
  const parsed=await parsePages(source,'pdf');
  expect(parsed.pages).toHaveLength(301);
  expect(parsed.pages[300].index).toBe(300);
  expect(parsed.coverage).toContainEqual({id:'page:300',status:'complete'});
  const policy={mode:'raster' as const,regions:[],deletedPages:[300]};
  expect(validatePageReview(policy,parsed.pages,true).deletedPages).toEqual([300]);
  expect(()=>validatePageReview({...policy,deletedPages:[301]},parsed.pages,true)).toThrow('INVALID_PAGE_REVIEW');
  const doc={id:'synthetic',tenant_id:'synthetic',project_id:'synthetic',revision:0,state:'review',source_id:'synthetic',source_format:'pdf',parse_version:1,content_hash:'synthetic',page_data:parsed.pages,page_review:policy,anchors:parsed.anchors,coverage:parsed.coverage,marks:[]};
  expect(coverageComplete(doc,parsed.text.length)).toBe(true);
  const rgb=Buffer.from([255,255,255]),writer=new RasterPdf();
  for(let i=0;i<301;i++)writer.add({index:i,width:1,height:1},rgb,1,1);
  const exported=await openPdf(writer.finish());
  try{expect(exported.count).toBe(301);expect((await exported.page(300,1)).png.length).toBeGreaterThan(0);await expect(exported.page(301,1)).rejects.toThrow('INVALID_PDF_PAGE');}finally{exported.close();}
 }finally{if(prior===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior;if(priorKey===undefined)delete process.env.DATA_KEY;else process.env.DATA_KEY=priorKey;await rm(dir,{recursive:true,force:true});}
},120000);
