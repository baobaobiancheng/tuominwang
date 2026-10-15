import {test,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {parseOffice,exportOffice} from '../packages/core/office.ts';
import {detectComplete} from '../packages/core/recognition-pipeline.ts';
import {detect} from '../packages/core/redaction.ts';
import {officeFixture} from './office-fixtures.ts';
test('LibreOffice compatibility namespace identifiers stay out of automatic URL candidates without weakening manual residue checks',async()=>{
 const source=await readFile('tests/fixtures/legacy-office/imported.docx'),parsed=await parseOffice(source,'docx');
 const uri='http://schemas.microsoft.com/office/word',anchor=parsed.anchors.find(a=>a.part==='word/settings.xml'&&parsed.text.slice(a.start,a.end)===uri)!;expect(anchor).toBeTruthy();
 for(const marks of [detect(parsed.text,parsed.anchors),detectComplete(parsed.text,parsed.anchors).marks])expect(marks.some(m=>m.start===anchor.start&&m.end===anchor.end)).toBe(false);
 const sourceNoImages=await officeFixture('docx',{'word/settings.xml':`<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="${uri}" w:val="11"/></w:compat></w:settings>`}),p=await parseOffice(sourceNoImages,'docx'),a=p.anchors.find(a=>a.part==='word/settings.xml'&&p.text.slice(a.start,a.end)===uri)!;
 // A user may explicitly select the identifier; a conflicting remaining format
 // namespace is still caught by the same full output verification gate.
 const withNamespace=await officeFixture('docx',{'word/settings.xml':`<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:word="${uri}"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="${uri}" w:val="11"/></w:compat></w:settings>`}),p2=await parseOffice(withNamespace,'docx'),a2=p2.anchors.find(a=>a.part==='word/settings.xml'&&p2.text.slice(a.start,a.end)===uri)!;
 await expect(exportOffice(withNamespace,'docx',p2.text,p2.anchors,p2.coverage,[{start:a2.start,end:a2.end,kind:'网址',decision:'redact'}])).rejects.toThrow('RESIDUE_FOUND');expect(a).toBeTruthy();
});
test('the same published identifier in visible text and private compatibility URIs remain detectable',async()=>{
 for(const uri of ['http://schemas.microsoft.com/office/word','https://private.example.invalid/schema']){
  const source=await officeFixture('docx',{'word/settings.xml':`<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat><w:compatSetting w:name="custom" w:uri="${uri}" w:val="1"/></w:compat></w:settings>`,'word/document.xml':`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${uri}</w:t></w:r></w:p></w:body></w:document>`}),p=await parseOffice(source,'docx'),marks=detectComplete(p.text,p.anchors).marks.filter(m=>m.kind==='网址');
  expect(marks.some(m=>p.anchors.some(a=>a.part==='word/document.xml'&&a.start<=m.start&&a.end>=m.end))).toBe(true);
  expect(marks.some(m=>p.anchors.some(a=>a.part==='word/settings.xml'&&a.start<=m.start&&a.end>=m.end))).toBe(uri.startsWith('https://private.'));
 }
});
