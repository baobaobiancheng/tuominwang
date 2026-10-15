import {expect,test} from 'vitest';
import type {Mark} from '../packages/contracts/index.ts';
import {officeFixture,officeImageFixture} from './office-fixtures.ts';
import sharp from 'sharp';
import {parseFile,exportFile,verifyFile} from '../packages/core/files.ts';
import {parseOffice,exportOffice,verifyOffice} from '../packages/core/office.ts';
import {readZip,writeZip,xml,xmlBytes} from '../packages/core/office-zip.ts';
import {documentTableMarks} from '../packages/adapters/reference-table.ts';
import {applySignatureDecision} from '../packages/core/review-group-ui.ts';
import {assertSignatureGroups,assertSignatureReviewTransition} from '../packages/core/review-groups.ts';
import {parseRestorationMapping,restoreDocx,restoreMarkdown} from '../packages/core/restoration-files.ts';

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const names=['张','三','李','四','张','三'];
const csv=Buffer.from('签名,签名,签名,签名,签名,签名\n张,三,李,四,张,三\n');
const md=Buffer.from('|签名|签名|签名|签名|签名|签名|\n|---|---|---|---|---|---|\n|张|三|李|四|张|三|\n');
const docxCell=(value:string)=>`<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
const xlsxCell=(column:string,row:number,value:string)=>`<c r="${column}${row}" t="inlineStr"><is><t>${value}</t></is></c>`;
async function fixtures(){
 const columns=['A','B','C','D','E','F'];
 return [
  {format:'csv' as const,bytes:csv},
  {format:'md' as const,bytes:md},
  {format:'docx' as const,bytes:await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:tbl><w:tr>${names.map(()=>docxCell('签名')).join('')}</w:tr><w:tr>${names.map(docxCell).join('')}</w:tr></w:tbl></w:body></w:document>`})},
  {format:'xlsx' as const,bytes:await officeFixture('xlsx',{'xl/worksheets/sheet1.xml':`<worksheet xmlns="${S}"><sheetData><row r="1">${columns.map(c=>xlsxCell(c,1,'签名')).join('')}</row><row r="2">${names.map((value,i)=>xlsxCell(columns[i],2,value)).join('')}</row></sheetData></worksheet>`})},
 ];
}
async function detected(format:'csv'|'md'|'docx'|'xlsx',bytes:Buffer){
 const parsed=format==='csv'||format==='md'?parseFile(bytes,format):await parseOffice(bytes,format);
 const marks=(await documentTableMarks(bytes,parsed.text,parsed.anchors,format)).marks.filter(m=>m.signatureGroup);
 expect(marks).toHaveLength(6);
 assertSignatureGroups(marks);
 expect(new Set(marks.map(m=>m.signatureGroup!.id)).size).toBe(3);
 return {parsed,marks};
}
function decisions(marks:Mark[]){
 const groups=[...new Set(marks.map(m=>m.signatureGroup!.id))];
 return marks.map(m=>({...m,decision:groups.indexOf(m.signatureGroup!.id)===0?'redact':'ignore'} as Mark));
}

test('signature fragments have three distinct positional identities and a click decides every member',async()=>{
 const {marks}=await detected('csv',csv);
 const after=applySignatureDecision(marks,new Set([0]),'redact');
 expect(after.map(m=>m.decision)).toEqual(['redact','redact','pending','pending','pending','pending']);
 const links=marks.map((_,i)=>({beforeIndex:i,afterIndex:i}));
 expect(()=>assertSignatureReviewTransition(marks,after,links)).not.toThrow();
 const half=marks.map((m,i)=>i===0?{...m,decision:'redact' as const}:m);
 expect(()=>assertSignatureReviewTransition(marks,half,links)).toThrow('SIGNATURE_GROUP_INVALID');
 const complete=decisions(marks);
 expect(()=>assertSignatureReviewTransition(marks,complete,links)).not.toThrow();
 expect(()=>assertSignatureReviewTransition(marks,complete.slice(1),links.slice(1).map(l=>({...l,afterIndex:l.afterIndex-1})))).toThrow('SIGNATURE_GROUP_INVALID');
 expect(()=>assertSignatureReviewTransition(marks,complete.map((m,i)=>i===0?{...m,signatureGroup:{...m.signatureGroup!,id:'sig_'+'0'.repeat(32)}}:m),links)).toThrow('SIGNATURE_GROUP_INVALID');
 expect(()=>assertSignatureReviewTransition(marks,complete,[...links,links[0]])).toThrow('SIGNATURE_GROUP_INVALID');
 expect(()=>assertSignatureReviewTransition(marks,complete,[{beforeIndex:0.5,afterIndex:0},...links.slice(1)])).toThrow('SIGNATURE_GROUP_INVALID');
});

test('actual CSV, DOCX, XLSX and Markdown exports preserve ignored signatures and redact one whole name',async()=>{
 for(const {format,bytes} of await fixtures()){
  const {parsed,marks}=await detected(format,bytes),reviewed=decisions(marks);
  let output:string;
  if(format==='csv'||format==='md'){
   const context=format==='md'?{markdown:(parsed as ReturnType<typeof parseFile>).markdown}:{};
   output=exportFile(parsed.text,reviewed,format,parsed.anchors,context);
   expect(()=>verifyFile(parsed.text,reviewed,output,format,parsed.anchors,context)).not.toThrow();
  }else{
   const buffer=await exportOffice(bytes,format,parsed.text,parsed.anchors,parsed.coverage,reviewed);
   output=(await parseOffice(buffer,format)).text;
  }
  expect(output).toContain('李');expect(output).toContain('四');
  expect(output).toContain('张');expect(output).toContain('三');
  expect(output.split('【姓名】').length-1).toBe(2);
 }
});

test('Office verifier rejects same-part redacted/ignored cell swap and hidden attribute residue',async()=>{
 for(const {format,bytes} of (await fixtures()).filter(f=>f.format==='docx'||f.format==='xlsx') as {format:'docx'|'xlsx';bytes:Buffer}[]){
  const {parsed,marks}=await detected(format,bytes),reviewed=decisions(marks);
  const output=await exportOffice(bytes,format,parsed.text,parsed.anchors,parsed.coverage,reviewed);
  const part=format==='docx'?'word/document.xml':'xl/worksheets/sheet1.xml',ns=format==='docx'?W:S;
  const zip=await readZip(output),doc=xml(zip.get(part)!);
  const nodes=Array.from(doc.getElementsByTagNameNS(ns,'t'));
  const hidden=nodes.find(n=>n.textContent==='【姓名】'),ignored=nodes.find(n=>n.textContent==='张');
  expect(hidden).toBeDefined();expect(ignored).toBeDefined();
  hidden!.textContent='张';ignored!.textContent='【姓名】';zip.set(part,xmlBytes(doc));
  await expect(verifyOffice(bytes,format,await writeZip(zip),parsed.text,reviewed)).rejects.toThrow('RESIDUE_FOUND');
  const extra=await readZip(output),extraDoc=xml(extra.get(part)!);
  extraDoc.documentElement!.setAttribute('data-probe','张');extra.set(part,xmlBytes(extraDoc));
  await expect(verifyOffice(bytes,format,await writeZip(extra),parsed.text,reviewed)).rejects.toThrow('RESIDUE_FOUND');
 }
});

test('distinct aliases restore only the selected fragments in DOCX and Markdown',async()=>{
 for(const {format,bytes} of (await fixtures()).filter(f=>f.format==='docx'||f.format==='md') as {format:'docx'|'md';bytes:Buffer}[]){
  const {parsed,marks}=await detected(format,bytes),reviewed=decisions(marks),mappings:Record<string,string>={};
  const aliased=reviewed.map((mark,index)=>{
   if(mark.decision!=='redact')return mark;
   const token=`【姓名_${String(index+1).padStart(6,'0')}】`;mappings[token]=parsed.text.slice(mark.start,mark.end);
   return {...mark,replacement:{mode:'alias' as const,mappingId:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,version:1,token}};
  });
  const output=format==='docx'?await exportOffice(bytes,format,parsed.text,parsed.anchors,parsed.coverage,aliased):Buffer.from(exportFile(parsed.text,aliased,format,parsed.anchors,{markdown:(parsed as ReturnType<typeof parseFile>).markdown}));
  const plan=parseRestorationMapping({mappings,_meta:{version:'0.5.9'}});
  const restored=format==='docx'?await restoreDocx(output,plan):restoreMarkdown(output,plan);
  expect(restored.stats.totalReplacements).toBe(2);
  const readback=format==='docx'?(await parseOffice(restored.output,format)).text:parseFile(restored.output,format).text;
  for(const [token,value] of Object.entries(mappings)){expect(readback).toContain(value);expect(readback).not.toContain(token);}
 }
});


test('native signature cells and renamed embedded Word images verify against their own source indexes',async()=>{
 const originalImage='word/media/customer-13800138000.jpg',outputImage='word/media/redacted-1.png';
 const image=await sharp({create:{width:24,height:24,channels:3,background:'white'}}).jpeg().toBuffer();
 const parts=await readZip(await officeImageFixture(image));
 const table=`<w:tbl><w:tr>${names.map(()=>docxCell('签名')).join('')}</w:tr><w:tr>${names.map(docxCell).join('')}</w:tr></w:tbl>`;
 parts.set('word/document.xml',Buffer.from(parts.get('word/document.xml')!.toString().replace('</w:body>',table+'</w:body>')));
 const source=await writeZip(parts),imageTexts={[originalImage]:'公开扫描说明'};
 const parsed=await parseOffice(source,'docx',imageTexts);
 expect(parsed.coverage.every(c=>c.status==='complete')).toBe(true);
 const marks=(await documentTableMarks(source,parsed.text,parsed.anchors,'docx')).marks.filter(m=>m.signatureGroup);
 expect(marks).toHaveLength(6);
 const reviewed=decisions(marks),images={[originalImage]:{text:imageTexts[originalImage],output:await sharp(image).png().toBuffer(),outputText:imageTexts[originalImage]}};
 const output=await exportOffice(source,'docx',parsed.text,parsed.anchors,parsed.coverage,reviewed,images);
 const zip=await readZip(output);expect(zip.has(originalImage)).toBe(false);expect(zip.has(outputImage)).toBe(true);
 const reread=await parseOffice(output,'docx',{[outputImage]:imageTexts[originalImage]});
 expect(reread.text.split('【姓名】').length-1).toBe(2);
 expect(reread.text).toContain('李');expect(reread.text).toContain('四');expect(reread.text).toContain('张');expect(reread.text).toContain('三');
 await expect(verifyOffice(source,'docx',output,parsed.text,reviewed,{[outputImage]:imageTexts[originalImage]})).resolves.toBeUndefined();
});
