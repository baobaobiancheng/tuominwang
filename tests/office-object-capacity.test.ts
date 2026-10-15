import {test,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {parseOffice,exportOffice,verifyOffice} from '../packages/core/office.ts';
import {officeFixture} from './office-fixtures.ts';
import {readZip} from '../packages/core/office-zip.ts';
import {FILE_MAX_BYTES} from '../packages/contracts/index.ts';
test('a standard Python-docx template retains every object beyond the former 20000 count boundary',async()=>{
 const source=await readFile('tests/fixtures/legacy-office/simple.docx'),parsed=await parseOffice(source,'docx');
 expect(parsed.anchors.length).toBeGreaterThan(20000);
 expect(parsed.anchors.at(-1)!.end).toBe(parsed.text.length);
 expect(parsed.text).toContain('13800138000');
});
test('late hidden attributes beyond 20000 objects are reviewed, redacted and verified without sampling',async()=>{
 const styles=Array.from({length:7000},(_,i)=>`<w:style w:type="paragraph" w:styleId="Style${i}"><w:name w:val="${i===6999?'18898765432':'Style'+i}"/></w:style>`).join('');
 const source=await officeFixture('docx',{'word/styles.xml':`<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${styles}</w:styles>`}),parsed=await parseOffice(source,'docx');
 const anchor=parsed.anchors.find(a=>a.part==='word/styles.xml'&&parsed.text.slice(a.start,a.end)==='18898765432')!;
 expect(parsed.anchors.indexOf(anchor)).toBeGreaterThan(20000);expect(parsed.coverage.every(c=>c.status==='complete')).toBe(true);
 const marks=[{start:anchor.start,end:anchor.end,kind:'手机号' as const,decision:'redact' as const}],output=await exportOffice(source,'docx',parsed.text,parsed.anchors,parsed.coverage,marks);
 await expect(verifyOffice(source,'docx',output,parsed.text,marks)).resolves.toBeUndefined();
 const out=await parseOffice(output,'docx');expect(out.anchors.filter(a=>a.part==='word/styles.xml')).toHaveLength(parsed.anchors.filter(a=>a.part==='word/styles.xml').length);expect(out.text).not.toContain('18898765432');expect((await readZip(output)).get('word/styles.xml')!.toString()).toContain('【手机号】');
});
test('canonical embedded image OCR still obeys the complete document byte budget',async()=>{
 const source=await officeFixture('docx',{'word/media/image.png':Buffer.from('synthetic-image')});
 await expect(parseOffice(source,'docx',{'word/media/image.png':'x'.repeat(FILE_MAX_BYTES)})).rejects.toThrow('OFFICE_TEXT_LIMIT');
});
