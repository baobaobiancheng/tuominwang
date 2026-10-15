import {it,expect} from 'vitest';
import {parseRestorationMapping,restoreDocx,restoreMarkdown} from '../packages/core/restoration-files.ts';
import {readZip,writeZip,xml,xmlBytes} from '../packages/core/office-zip.ts';
import {parseOffice} from '../packages/core/office.ts';
import {officeFixture} from './office-fixtures.ts';
const token='【姓名001】',W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
it('valid fallback survives wrong optional metadata shapes, without accepting an invalid mapping container',()=>{
 for(const extra of [{details:{}},{occurrences:{}},{details:[{pseudonym:token,forms:{}}]},{entityMap:{[token]:{forms:{}}}}]){
  const plan=parseRestorationMapping({mappings:{[token]:'合成甲'},...extra});
  expect(restoreMarkdown(Buffer.from(token),plan).output.toString()).toBe('合成甲');
 }
 for(const mappings of [[],null,'bad',123])expect(()=>parseRestorationMapping({mappings})).toThrow('RESTORE_MAPPING_INVALID');
});
it('explicit source canonical fallback wins, caller choices and occurrence strategy retain precedence, legacy ambiguity stays visible',()=>{
 const data={_meta:{restoreStrategy:'token-canonical'},mappings:{[token]:'甲'},details:[{pseudonym:token,normalized:'乙'},{pseudonym:'【姓名002】',normalized:'不应新增'}],occurrences:[{token,original:'丙'}]};
 const plan=parseRestorationMapping(data);expect(plan.mappings).toEqual({[token]:'甲'});expect(plan.ambiguities).toEqual([]);
 expect(restoreMarkdown(Buffer.from(token),parseRestorationMapping(data,{choices:{[token]:'乙'}})).output.toString()).toBe('乙');
 expect(restoreMarkdown(Buffer.from(token),parseRestorationMapping(data,{strategy:'occurrence'})).output.toString()).toBe('丙');
 expect(()=>parseRestorationMapping(data,{choices:{'【姓名002】':'不应新增'}})).toThrow('RESTORE_CHOICE_INVALID');
 const {_meta,...legacy}=data;expect(parseRestorationMapping(legacy).ambiguities).toHaveLength(1);
});
function encode(source:string,encoding:string){
 if(encoding==='UTF-8')return Buffer.from(source);
 if(encoding==='UTF-16LE')return Buffer.concat([Buffer.from('fffe','hex'),Buffer.from(source,'utf16le')]);
 if(encoding==='UTF-16BE')return Buffer.concat([Buffer.from('feff','hex'),Buffer.from(source,'utf16le').swap16()]);
 const little=encoding==='UTF-32LE',points=Array.from(source,c=>c.codePointAt(0)!);const data=Buffer.alloc(4+points.length*4);(little?data.writeUInt32LE.bind(data):data.writeUInt32BE.bind(data))(0xfeff,0);points.forEach((p,i)=>(little?data.writeUInt32LE.bind(data):data.writeUInt32BE.bind(data))(p,4+i*4));return data;
}
it.each(['UTF-8','UTF-16LE','UTF-16BE','UTF-32LE','UTF-32BE'])('reads and restores a complete %s DOCX, then writes an independently decodable UTF-8 XML declaration',async encoding=>{
 const source=`<?xml version="1.0" encoding="${encoding}"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${token}</w:t></w:r></w:p></w:body></w:document>`;
 const base=await officeFixture('docx',{'word/document.xml':'placeholder'}),parts=await readZip(base);parts.set('word/document.xml',encode(source,encoding));const input=await writeZip(parts),before=Buffer.from(input);
 expect((await parseOffice(input,'docx')).text).toContain(token);const result=await restoreDocx(input,parseRestorationMapping({mappings:{[token]:'合成甲'}}));expect((await parseOffice(result.output,'docx')).text).toContain('合成甲');
 const body=(await readZip(result.output)).get('word/document.xml')!;expect(new TextDecoder('utf-8',{fatal:true}).decode(body)).toContain('encoding="UTF-8"');expect(input).toEqual(before);
});
it('permits DTD-looking text in XML comments, CDATA and PI but rejects actual declarations, malformed bytes and BOM declaration conflicts',()=>{
 const valid=Buffer.from('<?xml version="1.0"?><!-- <!DOCTYPE harmless> --><?note <!ENTITY ignored>?><r><![CDATA[<!DOCTYPE literal>]]></r>');expect(xmlBytes(xml(valid)).toString()).toContain('DOCTYPE literal');
 for(const source of ['<!DOCTYPE r [<!ENTITY x "private">]><r>&x;</r>','<!ENTITY x "private"><r/>'])expect(()=>xml(Buffer.from(source))).toThrow('UNSAFE_XML');
 expect(()=>xml(Buffer.concat([Buffer.from('fffe','hex'),Buffer.from('<?xml version="1.0" encoding="UTF-8"?><r/>','utf16le')]))).toThrow('INVALID_OFFICE');
 expect(()=>xml(Buffer.from([0x3c,0x72,0x3e,0xff,0x3c,0x2f,0x72,0x3e]))).toThrow('INVALID_OFFICE');
});
