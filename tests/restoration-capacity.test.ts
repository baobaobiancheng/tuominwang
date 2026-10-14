import {it,expect} from 'vitest';
import {parseRestorationMapping,restoreMarkdown,restoreDocx} from '../packages/core/restoration-files.ts';
import {MAX_MAPPING_ENTRIES} from '../packages/contracts/mapping-limits.ts';
import {officeFixture} from './office-fixtures.ts';
import {parseOffice} from '../packages/core/office.ts';
import {largePlainMappings} from './restoration-large-fixture.ts';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
it('all100000 source-permitted mappings restore the last token in actual Markdown and cross-run Word;5001 works and100001 is rejected',async()=>{
 const mappings=Object.fromEntries(Array.from({length:MAX_MAPPING_ENTRIES},(_,i)=>[`【姓名${String(i+1).padStart(6,'0')}】`,`合成原文${i+1}`])),first5001=Object.fromEntries(Object.entries(mappings).slice(0,5001));
 expect(Object.keys(parseRestorationMapping({mappings:first5001}).mappings)).toHaveLength(5001);
 const plan=parseRestorationMapping({mappings});expect(Object.keys(plan.mappings)).toHaveLength(MAX_MAPPING_ENTRIES);expect(restoreMarkdown(Buffer.from('公开【重要】 【姓名100000】'),plan).output.toString()).toBe('公开【重要】 合成原文100000');
 const source=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>【姓名10</w:t></w:r><w:r><w:t>0000】</w:t></w:r></w:p></w:body></w:document>`}),saved=Buffer.from(source),out=await restoreDocx(source,plan),parsed=await parseOffice(out.output,'docx');expect(out.stats.totalReplacements).toBe(1);expect(out.stats.crossRunReplacements).toBe(1);const body=parsed.anchors.find(a=>a.part==='word/document.xml'&&a.object==='paragraph:1')!;expect(parsed.text.slice(body.start,body.end)).toBe('合成原文100000');expect(parsed.text).not.toContain('【姓名100000】');expect(source).toEqual(saved);
 mappings['【姓名100001】']='合成原文100001';expect(()=>parseRestorationMapping({mappings})).toThrow('RESTORE_MAPPING_INVALID');
});
it('100000 plain user aliases also restore the final literal in Markdown and Word without substituting a shorter prefix',async()=>{
 const mappings=Object.fromEntries(Array.from({length:MAX_MAPPING_ENTRIES},(_,i)=>[`CLIENT-${String(i+1).padStart(6,'0')}`,`合成客户${i+1}`])),plan=parseRestorationMapping({mappings});expect(restoreMarkdown(Buffer.from('CLIENT-100000'),plan).output.toString()).toBe('合成客户100000');const source=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>CLIENT-10</w:t></w:r><w:r><w:t>0000</w:t></w:r></w:p></w:body></w:document>`}),output=await restoreDocx(source,plan),parsed=await parseOffice(output.output,'docx'),body=parsed.anchors.find(a=>a.part==='word/document.xml'&&a.object==='paragraph:1')!;expect(parsed.text.slice(body.start,body.end)).toBe('合成客户100000');expect(output.stats.totalReplacements).toBe(1);expect(output.stats.crossRunReplacements).toBe(1);
});
it('mixed wrappers and exact overlapping plain aliases use the same original leftmost-longest matches and never rescan restored values',async()=>{
 const mappings={'A':'原甲','AB':'原乙','A B':'原丙','客户A':'原丁','【姓名001】':'A B','【编号_002】':'原戊'},plan=parseRestorationMapping({mappings}),text='AB A B A 【姓\u200b名 0 0 1】 客户A 【编号_002】',expected='原乙 原丙 原甲 A B 原丁 原戊',source=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`}),output=await restoreDocx(source,plan),parsed=await parseOffice(output.output,'docx'),body=parsed.anchors.find(a=>a.part==='word/document.xml'&&a.object==='paragraph:1')!;expect(parsed.text.slice(body.start,body.end)).toBe(expected);expect(output.stats.totalReplacements).toBe(6);
});

it('all100000 valid diverse205-character aliases below the actual50MiB input budget restore literal MD and cross-run Word without native regex compilation',async()=>{
 const{mappings,bytes,lastToken}=largePlainMappings();expect(bytes.length).toBeLessThan(50*1024*1024);expect(Object.keys(mappings)).toHaveLength(100000);const plan=parseRestorationMapping({mappings});expect(restoreMarkdown(Buffer.from(lastToken),plan).output.toString()).toBe('合成客户100000');const source=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${lastToken.slice(0,100)}</w:t></w:r><w:r><w:t>${lastToken.slice(100)}</w:t></w:r></w:p></w:body></w:document>`}),out=await restoreDocx(source,plan),parsed=await parseOffice(out.output,'docx'),body=parsed.anchors.find(a=>a.part==='word/document.xml'&&a.object==='paragraph:1')!;expect(parsed.text.slice(body.start,body.end)).toBe('合成客户100000');expect(out.stats.totalReplacements).toBe(1);expect(out.stats.crossRunReplacements).toBe(1);
});

it('Markdown escaped/HTML variant collisions fail independently of mapping order while exact Word aliases and constant identical originals remain valid',async()=>{
 for(const mappings of [{'A&B':'甲','A&amp;B':'乙'},{'A&amp;B':'乙','A&B':'甲'},{'A-B':'甲','A\\-B':'乙'},{'A\\-B':'乙','A-B':'甲'}])expect(()=>restoreMarkdown(Buffer.from('A&amp;B A\\-B'),parseRestorationMapping({mappings}))).toThrow('RESTORE_NORMALIZED_TOKEN_COLLISION');
 expect(restoreMarkdown(Buffer.from('A&amp;B'),parseRestorationMapping({mappings:{'A&B':'甲','A&amp;B':'甲'}})).output.toString()).toBe('甲');
 const queue=parseRestorationMapping({mappings:{'A&B':'甲','A&amp;B':'甲'},occurrences:[{token:'A&B',original:'乙'},{token:'A&amp;B',original:'乙'}]},{strategy:'occurrence'});expect(()=>restoreMarkdown(Buffer.from('A&B A&amp;B'),queue)).toThrow('RESTORE_NORMALIZED_TOKEN_COLLISION');
 const plan=parseRestorationMapping({mappings:{'A&B':'甲','A&amp;B':'乙'}}),source=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>A&amp;B A&amp;amp;B</w:t></w:r></w:p></w:body></w:document>`}),out=await restoreDocx(source,plan),parsed=await parseOffice(out.output,'docx'),body=parsed.anchors.find(a=>a.part==='word/document.xml'&&a.object==='paragraph:1')!;expect(parsed.text.slice(body.start,body.end)).toBe('甲 乙');
});
