import{describe,it,expect}from'vitest';
import{restoreMarkdown,restoreDocx,parseRestorationMapping}from'../packages/core/restoration-files.ts';
import{restoreBatch}from'../packages/core/restoration-batch.ts';
import{officeFixture}from'./office-fixtures.ts';
import{readZip}from'../packages/core/office-zip.ts';
const token='【姓名001】',unknown='【姓名999】',plan=parseRestorationMapping({mappings:{[token]:'合成甲'}}),external={allowNoMatches:true,preserveUnknownTokens:true};
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const file=(body:string,extra:Record<string,string>={})=>officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,...extra});
const paragraph=(value:string)=>`<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`;
describe('external partial restoration with explicit unmatched-label reporting',()=>{
 it('replaces known Markdown once, keeps unknown labels and BOM/CRLF, and counts distinct unmatched labels',()=>{
  const bytes=Buffer.from(`\uFEFF${token} ${unknown} ${unknown}\r\n`),result=restoreMarkdown(bytes,plan,external);
  expect(result.output).toEqual(Buffer.from(`\uFEFF合成甲 ${unknown} ${unknown}\r\n`));
  expect(result.stats.totalReplacements).toBe(1);expect(result.stats.unknownTokens).toEqual([unknown]);
 });
 it('keeps an unknown-only external file byte-for-byte',()=>{
  const bytes=Buffer.from(`\uFEFF${unknown}\r\n`),result=restoreMarkdown(bytes,plan,external);expect(result.output).toEqual(bytes);expect(result.stats.totalReplacements).toBe(0);expect(result.stats.unknownTokens).toEqual([unknown]);
 });
 it('keeps strict Markdown and no-match defaults independently enabled',()=>{
  expect(()=>restoreMarkdown(Buffer.from(`${token} ${unknown}`),plan)).toThrow('RESTORE_UNKNOWN_TOKEN');
  expect(()=>restoreMarkdown(Buffer.from(unknown),plan,{allowNoMatches:true})).toThrow('RESTORE_UNKNOWN_TOKEN');
  expect(()=>restoreMarkdown(Buffer.from(unknown),plan,{preserveUnknownTokens:true})).toThrow('RESTORE_NO_TOKENS');
 });
 it('does not misclassify labels appearing only inside a restored original value',()=>{
  const result=restoreMarkdown(Buffer.from(token),parseRestorationMapping({mappings:{[token]:`原文${unknown}`}}),external);expect(result.output.toString()).toBe(`原文${unknown}`);expect(result.stats.unknownTokens).toEqual([]);
 });
 it('restores Word split runs and metadata while retaining their unmatched labels',async()=>{
  const bytes=await file(`<w:p><w:r><w:t>【姓名</w:t></w:r><w:r><w:t>001】 ${unknown}</w:t></w:r></w:p>`,{'docProps/core.xml':`<root author="【机构999】"><title>${token}</title></root>`});
  const result=await restoreDocx(bytes,plan,external),parts=await readZip(result.output);expect(parts.get('word/document.xml')!.toString()).toContain(unknown);expect(parts.get('word/document.xml')!.toString()).toContain('合成甲');expect(parts.get('docProps/core.xml')!.toString()).toContain('【机构999】');expect(parts.get('docProps/core.xml')!.toString()).toContain('合成甲');expect(result.stats.totalReplacements).toBe(2);expect(new Set(result.stats.unknownTokens)).toEqual(new Set([unknown,'【机构999】']));expect(result.stats.crossRunReplacements).toBe(1);
 });
 it('keeps unknown-only Word byte-for-byte and preserves strict Word default',async()=>{
  const bytes=await file(paragraph(unknown)),result=await restoreDocx(bytes,plan,external);expect(result.output).toEqual(bytes);expect(result.stats.unknownTokens).toEqual([unknown]);await expect(restoreDocx(bytes,plan,{allowNoMatches:true})).rejects.toThrow('RESTORE_UNKNOWN_TOKEN');
 });
 it('retains ambiguity and invalid XML-value rejection for external callers',async()=>{
  const ambiguous=parseRestorationMapping({mappings:{[token]:'甲'},occurrences:[{token,original:'乙'}]});expect(()=>restoreMarkdown(Buffer.from(token),ambiguous,external)).toThrow('RESTORE_AMBIGUOUS_MAPPING');
  await expect(restoreDocx(await file(paragraph(token)),parseRestorationMapping({mappings:{[token]:'\u0000'}}),external)).rejects.toThrow('RESTORE_XML_VALUE_INVALID');
 });
 it('applies the same policy to mixed external batch files',async()=>{
  const md=Buffer.from(`${token} ${unknown}`),docx=await file(paragraph(`${token} ${unknown}`)),result=await restoreBatch([{id:'md',name:'one.md',format:'md',bytes:md},{id:'docx',name:'two.docx',format:'docx',bytes:docx}],plan);expect(result.success).toBe(true);expect(result.stats.successful_files).toBe(2);for(const row of result.results){expect(row.stats?.totalReplacements).toBe(1);expect(row.stats?.unknownTokens).toEqual([unknown]);}expect(result.results[0].output?.toString()).toBe(`合成甲 ${unknown}`);
 });
 it('preserves source plain-key substring semantics even inside an unmatched label',async()=>{
  const plain=parseRestorationMapping({mappings:{'姓名':'张三'}}),md=restoreMarkdown(Buffer.from(unknown),plain,external);
  expect(md.output.toString()).toBe('【张三999】');expect(md.stats.totalReplacements).toBe(1);expect(md.stats.unknownTokens).toEqual([unknown]);
  const word=await restoreDocx(await file(paragraph(unknown)),plain,external),parts=await readZip(word.output);
  expect(parts.get('word/document.xml')!.toString()).toContain('【张三999】');expect(word.stats.totalReplacements).toBe(1);expect(word.stats.unknownTokens).toEqual([unknown]);
 });
});
