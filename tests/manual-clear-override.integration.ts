import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import sharp from 'sharp';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,readOriginal,readArtifact} from '../packages/adapters/storage.ts';
import {RasterPdf} from '../packages/core/page-redaction.ts';
import {openPdf} from '../packages/core/pdf-reader.ts';
import {officeImageFixture} from './office-fixtures.ts';
import {readZip} from '../packages/core/office-zip.ts';
import {safePageMarkdown} from '../packages/adapters/profile-export.ts';
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
for(const format of ['png','pdf','docx']as const)test(`${format.toUpperCase()} actual exports apply manual rect and ellipse after explicit partial/full text drawings; cleared labels are absent from Markdown`,{timeout:180000},async()=>{
 assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
 const user=randomUUID(),tenant=randomUUID(),username='last-clear-'+randomUUID(),password='synthetic-last-clear';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}}),cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,binary=false)=>app.inject({method,url,payload,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}}});
 const project=(await req('POST','/api/projects',{name:'末次清除实际导出',applyDefaultPresets:true})).json().id,png=await readFile('tests/fixtures/image-utilities-synthetic.png'),pdf=new RasterPdf();
 pdf.add({index:0,width:600,height:200},await sharp(png).removeAlpha().raw().toBuffer(),600,200);
 const source=format==='png'?png:format==='pdf'?pdf.finish():await officeImageFixture(png);
 {
  const batch=randomUUID(),request=randomUUID();assert.equal((await req('POST',`/api/projects/${project}/upload-batches`,{id:batch,files:[{requestId:request,path:`last-clear.${format}`,size:source.length}]})).statusCode,200);
  const uploaded=await req('POST',`/api/projects/${project}/files?batchId=${batch}&requestId=${request}`,source,true);assert.equal(uploaded.statusCode,200,uploaded.body);
  const id=uploaded.json().id,url='/api/documents/'+id;await tick();let view=(await req('GET',url)).json();assert.equal(view.job.status,'succeeded',JSON.stringify(view.job));
  const stored=(await admin.query('SELECT * FROM documents WHERE id=$1',[id])).rows[0],page=stored.page_data[0],anchor=stored.anchors.find((a:any)=>format==='docx'?a.part===page.part&&a.object==='image-text':a.kind==='page'&&a.page===0);
  assert.ok(anchor);const target=view.marks.find((m:any)=>m.kind==='手机号'&&m.start>=anchor.start&&m.end<=anchor.end);assert.ok(target,JSON.stringify({format,marks:view.marks,anchor}));
  const glyphs=JSON.parse(await readArtifact(page.mapId)).filter((g:number[])=>g[0]<target.end-anchor.start&&g[1]>target.start-anchor.start),left=Math.min(...glyphs.map((g:number[])=>g[2])),top=Math.min(...glyphs.map((g:number[])=>g[3])),right=Math.max(...glyphs.map((g:number[])=>g[2]+g[4])),bottom=Math.max(...glyphs.map((g:number[])=>g[3]+g[5]));
  const region={id:randomUUID(),page:0,x:left,y:top,width:right-left,height:bottom-top,reason:'敏感区域',entityType:'phone',text:'13800138000'};
  async function run(mode:'mask'|'full'|'default',shape?:'rect'|'circle'){
   view=(await req('GET',url)).json();const marks=view.marks.map((m:any)=>({...m,decision:m.start===target.start&&m.end===target.end?'redact':'ignore',...(m.start===target.start&&m.end===target.end?mode==='default'?{replacement:target.replacement,replacementOrigin:target.replacementOrigin,rasterReplacement:target.rasterReplacement}:{replacement:mode==='mask'?{mode:'mask',prefix:3,suffix:4}:{mode:'full'},replacementOrigin:'manual',rasterReplacement:true}:{})})),policy={mode:'raster',regions:shape?[{...region,shape}]:[],deletedPages:[]};
   const review=await req('PUT',url+'/review',{revision:view.revision,marks,pageReview:policy});assert.equal(review.statusCode,200,review.body);view=(await req('GET',url)).json();
   if(format!=='docx'){
    const doc=(await admin.query('SELECT * FROM documents WHERE id=$1',[id])).rows[0],md=await safePageMarkdown({...doc,page_review:policy,marks},view.text);
    if(shape)assert.ok(!md.includes('138')&&!md.includes('8000')&&!md.includes('\\*'),md);else if(mode==='default')assert.ok(!md.includes('138')&&!md.includes('8000')&&!md.includes('\\*'),md);else assert.ok(mode==='mask'?md.includes('138')&&md.includes('8000'):md.includes('\\*'),md);
   }
   const exported=await req('POST',url+'/export',{revision:view.revision});assert.equal(exported.statusCode,200,exported.body);await tick();view=(await req('GET',url)).json();assert.equal(view.job.status,'succeeded',JSON.stringify({format,mode,shape,job:view.job}));
   const link=await req('POST',url+'/download-link',{revision:view.revision});assert.equal(link.statusCode,200,link.body);const downloaded=await app.inject({url:link.json().url});assert.equal(downloaded.statusCode,200);let image=downloaded.rawPayload;
   if(format==='pdf'){const opened=await openPdf(image);try{image=(await opened.page(0)).png;}finally{opened.close();}}else if(format==='docx'){const parts=await readZip(image);image=parts.get('word/media/redacted-1.png')!;assert.ok(image);}
   const decoded=await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.channels,3);return decoded;
  }
  assert.equal(target.rasterReplacement,false,format+' default computed source rendering marker');const defaultOutput=await run('default');const dx=defaultOutput.info.width/page.width,dy=defaultOutput.info.height/page.height;for(const g of glyphs)for(let y=Math.floor(g[3]*dy);y<Math.ceil((g[3]+g[5])*dy);y++)for(let x=Math.floor(g[2]*dx);x<Math.ceil((g[2]+g[4])*dx);x++){const at=(y*defaultOutput.info.width+x)*3;assert.deepEqual([...defaultOutput.data.subarray(at,at+3)],[0,0,0],format+' actual default glyph must not redraw partial originals');}
  for(const mode of ['mask','full']as const){const baseline=await run(mode);let foreground=0;const sx=baseline.info.width/page.width,sy=baseline.info.height/page.height;
   for(let y=Math.ceil(top*sy)+1;y<Math.floor(bottom*sy)-1;y++)for(let x=Math.ceil(left*sx)+1;x<Math.floor(right*sx)-1;x++){const at=(y*baseline.info.width+x)*3;if(baseline.data[at]>100)foreground++;}assert.ok(foreground>0,format+'/'+mode+' must draw actual replacement glyphs');
   for(const shape of ['rect','circle']as const){const actual=await run(mode,shape);assert.equal(actual.info.width,baseline.info.width);assert.equal(actual.info.height,baseline.info.height);let changed=0;
    for(let y=0;y<actual.info.height;y++)for(let x=0;x<actual.info.width;x++){
     const at=(y*actual.info.width+x)*3,cx=(left+right)*sx/2,cy=(top+bottom)*sy/2,rx=(right-left)*sx/2,ry=(bottom-top)*sy/2,dx=Math.max(x,Math.min(x+1,cx))-cx,dy=Math.max(y,Math.min(y+1,cy))-cy,inside=x>=Math.floor(left*sx)&&x<Math.ceil(right*sx)&&y>=Math.floor(top*sy)&&y<Math.ceil(bottom*sy)&&(shape==='rect'||(dx/rx)**2+(dy/ry)**2<1);
     if(inside){assert.deepEqual([...actual.data.subarray(at,at+3)],[0,0,0],`${format}/${mode}/${shape}: ${x},${y}`);if(!actual.data.subarray(at,at+3).equals(baseline.data.subarray(at,at+3)))changed++;}
     else if(x<Math.floor(left*sx)||x>=Math.ceil(right*sx)||y<Math.floor(top*sy)||y>=Math.ceil(bottom*sy)||(dx/rx)**2+(dy/ry)**2>1)assert.deepEqual(actual.data.subarray(at,at+3),baseline.data.subarray(at,at+3),`${format}/${mode}/${shape}: unchanged ${x},${y}`);
    }assert.ok(changed>0,format+'/'+mode+'/'+shape+' must overwrite real derived glyphs');
   }
  }
  assert.deepEqual(await readOriginal(stored.source_id),source);
 }
});
