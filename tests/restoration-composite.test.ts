import {test,expect} from 'vitest';
import {safeBatchName} from '../packages/core/restoration-batch.ts';
import {randomUUID} from 'node:crypto';
import {validAliasToken} from '../packages/contracts/alias-token.ts';
import {parseRestorationMapping,restoreMarkdown,restoreDocx,inspectRestorationTokens} from '../packages/core/restoration-files.ts';
import {restoreText,type Mapping} from '../packages/core/mappings.ts';
import {officeFixture} from './office-fixtures.ts';
import {readZip} from '../packages/core/office-zip.ts';
const token='【姓名001】【机构002】',original='甲乙丙';
test('source overlap composite wrapper is one full alias; components do not acquire separate known status',()=>{
 expect(validAliasToken(token)).toBe(true);for(const bad of ['【姓名001】机构002】','【姓名001】【','x【姓名【001】'])expect(validAliasToken(bad)).toBe(false);
 const plan=parseRestorationMapping({mappings:{[token]:original}});expect(restoreMarkdown(Buffer.from('公开'+token+' '+token),plan).output.toString()).toBe('公开甲乙丙 甲乙丙');
 const mapping:Mapping={id:randomUUID(),token,version:1,value:original,kind:'姓名'};expect(restoreText(token,[mapping],true,true)).toBe(original);for(const text of ['【姓名001】','【机构002】',token+'【机构003】']){expect(()=>restoreMarkdown(Buffer.from(text),plan)).toThrow('RESTORE_UNKNOWN_TOKEN');expect(()=>restoreText(text,[mapping],true,true)).toThrow('UNKNOWN_ALIAS');}expect(()=>restoreText(token,[mapping],false,true)).toThrow('MAPPING_ACCESS_DENIED');expect(()=>restoreText(token,[mapping],true,false)).toThrow('VERSION_CONFLICT');
 expect(inspectRestorationTokens('【 姓名001 】 \u200b【机构002】',[token])).toEqual([]);expect(inspectRestorationTokens('【姓名001】',[token])).toEqual(['【姓名001】']);
});
test('Word composite spans runs with normalized within/between whitespace and keeps Unicode UTF16 source spans',async()=>{
 const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',plan=parseRestorationMapping({mappings:{[token]:original}}),bytes=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>公开😀【 姓</w:t></w:r><w:r><w:t>名001 】 &#x200B;【机构</w:t></w:r><w:r><w:t>002】 末尾</w:t></w:r></w:p></w:body></w:document>`}),before=Buffer.from(bytes),result=await restoreDocx(bytes,plan),parts=await readZip(result.output),body=parts.get('word/document.xml')!.toString();expect(body).toContain('公开😀甲乙丙');expect(body).toContain(' 末尾');expect(body).not.toContain('机构002');expect(result.stats.totalReplacements).toBe(1);expect(result.stats.crossRunReplacements).toBe(1);expect(result.stats.normalizedMatches).toBe(1);expect(bytes).toEqual(before);
});
test('composite longest wins over registered component and inserted originals are never recursively restored',async()=>{
 const plan=parseRestorationMapping({mappings:{[token]:'合成'+token,'【姓名001】':'姓名独立','【机构002】':'机构独立'}});expect(restoreMarkdown(Buffer.from(token),plan).output.toString()).toBe('合成'+token);
 const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',bytes=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${token}</w:t></w:r></w:p></w:body></w:document>`}),result=await restoreDocx(bytes,plan);expect(result.stats.totalReplacements).toBe(1);expect((await readZip(result.output)).get('word/document.xml')!.toString()).toContain('合成'+token);
});
test('normalized composite ambiguity and differing occurrence queues fail before either original is chosen',()=>{
 const alt='【姓 名001】【机构002】';expect(()=>parseRestorationMapping({mappings:{[token]:'甲',[alt]:'乙'}})).toThrow('RESTORE_NORMALIZED_TOKEN_COLLISION');expect(()=>parseRestorationMapping({mappings:{[token]:'甲',[alt]:'甲'},occurrences:[{token,original:'甲'},{token,original:'乙'},{token:alt,original:'甲'}]},{strategy:'occurrence'})).toThrow('RESTORE_NORMALIZED_TOKEN_COLLISION');
});

test('source mixed plain/wrapper overlaps preserve exact literal spaces while repairing wrapper interiors',async()=>{
 const mixed='CLIENT A【机构002】',plan=parseRestorationMapping({mappings:{[mixed]:'甲乙丙','【姓名001】CLIENT B':'乙丙丁'}});expect(validAliasToken(mixed)).toBe(true);expect(restoreMarkdown(Buffer.from(mixed),plan).output.toString()).toBe('甲乙丙');
 const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',bytes=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>CLIENT A【机</w:t></w:r><w:r><w:t> 构002】</w:t></w:r></w:p></w:body></w:document>`});expect((await restoreDocx(bytes,plan)).stats.totalReplacements).toBe(1);expect(()=>restoreMarkdown(Buffer.from('CLIENTA【机构002】'),plan)).toThrow('RESTORE_UNKNOWN_TOKEN');expect(()=>restoreText('CLIENTA【机构002】',[{id:randomUUID(),token:mixed,version:1,value:'甲乙丙',kind:'姓名'}],true,true)).toThrow('UNKNOWN_ALIAS');
 expect(()=>parseRestorationMapping({mappings:{'CLIENT A【机 构002】':'甲', [mixed]:'乙'}})).toThrow('RESTORE_NORMALIZED_TOKEN_COLLISION');expect(parseRestorationMapping({mappings:{'CLIENT A【机构002】':'甲','CLIENTA【机构002】':'乙'}}).mappings['CLIENTA【机构002】']).toBe('乙');
});

test('source-valid240 character names survive while unsafe paths and final ZIP65535byte overflow reject',()=>{
 const name='a'.repeat(235)+'.docx',used=new Set<string>();expect(safeBatchName(name,used)).toBe('a'.repeat(235)+'_已回填.docx');expect(safeBatchName(name,used)).toBe('a'.repeat(235)+'_已回填_2.docx');
 for(const invalid of ['../x.docx','x\\y.md','a\0b.md','x'.repeat(65535)+'.md'])expect(()=>safeBatchName(invalid,new Set())).toThrow('RESTORE_FILE_NAME_INVALID');
});

test('source Ad preserves raw leading/trailing whitespace plus trimmed canonical spelling without changing literal inner spaces',async()=>{
 const values=[' CLIENT A ',' 【姓名001】 ',' CLIENT A【机构002】 '],W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
 for(const raw of values){expect(validAliasToken(raw)).toBe(true);const plan=parseRestorationMapping({mappings:{[raw]:'合成甲'}});expect(Object.keys(plan.mappings)).toEqual([raw,raw.trim()]);
  for(const token of[raw,raw.trim()]){expect(restoreMarkdown(Buffer.from(token),plan).output.toString()).toBe('合成甲');const cut=Math.floor(token.length/2),doc=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t xml:space="preserve">${token.slice(0,cut)}</w:t></w:r><w:r><w:t xml:space="preserve">${token.slice(cut)}</w:t></w:r></w:p></w:body></w:document>`}),result=await restoreDocx(doc,plan),body=(await readZip(result.output)).get('word/document.xml')!.toString();expect(body).toContain('>合成甲<');expect(result.stats.totalReplacements).toBe(1);expect(result.stats.crossRunReplacements).toBe(1);}
 }
 expect(validAliasToken(' \n\t')).toBe(false);expect(validAliasToken(' A\u0000 ')).toBe(false);expect(validAliasToken(' \ud800 ')).toBe(false);
 expect(()=>parseRestorationMapping({mappings:{' CLIENT A ':'甲','CLIENT A':'乙'}})).toThrow('RESTORE_NORMALIZED_TOKEN_COLLISION');
 expect(()=>parseRestorationMapping({mappings:{' CLIENT A ':'甲','CLIENT A':'甲'},occurrences:[{token:' CLIENT A ',original:'甲'},{token:' CLIENT A ',original:'乙'},{token:'CLIENT A',original:'甲'}]},{strategy:'occurrence'})).toThrow('RESTORE_NORMALIZED_TOKEN_COLLISION');
 const queue=parseRestorationMapping({mappings:{' CLIENT A ':'甲'},occurrences:[{token:' CLIENT A ',original:'甲'},{token:' CLIENT A ',original:'乙'}]},{strategy:'occurrence'});expect(restoreMarkdown(Buffer.from(' CLIENT A / CLIENT A '),queue).output.toString()).toBe('甲/乙');expect(restoreMarkdown(Buffer.from(' CLIENT A /CLIENT A'),queue).output.toString()).toBe('甲/乙');
});
