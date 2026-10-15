import { expect, it } from 'vitest';
import { parseRestorationMapping, restoreDocx } from '../packages/core/restoration-files.ts';
import { parseOffice } from '../packages/core/office.ts';
import { readZip, writeZip, xml, elements } from '../packages/core/office-zip.ts';
import { officeFixture } from './office-fixtures.ts';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
async function minimal(changes:Record<string,string>){const parts=await readZip(await officeFixture('docx',changes));for(const name of [...parts.keys()])if(!['[Content_Types].xml','_rels/.rels','word/document.xml',...Object.keys(changes)].includes(name))parts.delete(name);return writeZip(parts);}

it('restores plain xml in body while keeping OPC content types and internal relationships intact',async()=>{
 const input=await minimal({'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>xml</w:t></w:r></w:p></w:body></w:document>`}),before=await readZip(input),result=await restoreDocx(input,parseRestorationMapping({mappings:{xml:'合成甲'}})),after=await readZip(result.output);
 expect(result.stats.totalReplacements).toBe(1);expect(result.stats.storyReplacements['word/document.xml']).toBe(1);
 expect(after.get('[Content_Types].xml')).toEqual(before.get('[Content_Types].xml'));expect(after.get('_rels/.rels')).toEqual(before.get('_rels/.rels'));
 expect((await parseOffice(result.output,'docx')).text).toContain('合成甲');
});

it('keeps Word numeric, extended namespace and field-code values when a plain alias matches their substrings',async()=>{
 const W14='http://schemas.microsoft.com/office/word/2010/wordml',A14='http://schemas.microsoft.com/office/drawing/2010/main';
 const input=await minimal({'word/document.xml':`<w:document xmlns:w="${W}" xmlns:w14="${W14}" xmlns:a14="${A14}"><w:body><w:tbl><w:tblGrid><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="1"/></w:tcPr><w:p w14:paraId="1231" a14:syntheticId="1231"><w:r><w:instrText>MERGEFIELD 1</w:instrText><w:t>1</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`}),result=await restoreDocx(input,parseRestorationMapping({mappings:{'1':'合成甲'}})),document=xml((await readZip(result.output)).get('word/document.xml')!);
 expect(elements(document,W,'gridSpan')[0].getAttributeNS(W,'val')).toBe('1');expect(elements(document,W,'gridCol')[0].getAttributeNS(W,'w')).toBe('1000');expect(elements(document,W,'p')[0].getAttributeNS(W14,'paraId')).toBe('1231');expect(elements(document,W,'p')[0].getAttributeNS(A14,'syntheticId')).toBe('1231');
 expect(elements(document,W,'instrText')[0].textContent).toBe('MERGEFIELD 1');expect(elements(document,W,'t')[0].textContent).toBe('合成甲');expect(result.stats.storyReplacements['word/document.xml']).toBe(1);
});

it('separates typed app/core/custom XML/chart fields from natural metadata, labels and external hyperlink targets',async()=>{
 const EP='http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',VT='http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes',CP='http://schemas.openxmlformats.org/package/2006/metadata/core-properties',DC='http://purl.org/dc/elements/1.1/',DT='http://purl.org/dc/terms/',DS='http://schemas.openxmlformats.org/officeDocument/2006/customXml',C='http://schemas.openxmlformats.org/drawingml/2006/chart',WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
 const input=await minimal({
  'word/document.xml':`<w:document xmlns:w="${W}" xmlns:wp="${WP}"><w:body><w:p><w:r><w:t>1</w:t><w:drawing><wp:docPr id="1" descr="签章【姓名001】" title="1"/></w:drawing></w:r></w:p></w:body></w:document>`,
  'docProps/app.xml':`<Properties xmlns="${EP}" xmlns:vt="${VT}"><Pages>1</Pages><Words>1</Words><AppVersion>1.0</AppVersion><Company>1</Company><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>1</vt:lpstr></vt:vector></TitlesOfParts></Properties>`,
  'docProps/core.xml':`<cp:coreProperties xmlns:cp="${CP}" xmlns:dc="${DC}" xmlns:dcterms="${DT}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><cp:revision>1</cp:revision><dc:creator>1</dc:creator><dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-15T00:00:01Z</dcterms:modified></cp:coreProperties>`,
  'customXml/itemProps1.xml':`<ds:datastoreItem xmlns:ds="${DS}" ds:itemID="{11111111-1111-1111-1111-111111111111}"><ds:schemaRefs><ds:schemaRef ds:uri="urn:1"/></ds:schemaRefs></ds:datastoreItem>`,
  'customXml/item1.xml':'<custom title="1"><value>1</value></custom>',
  'word/charts/chart1.xml':`<c:chartSpace xmlns:c="${C}"><c:numCache><c:pt idx="0"><c:v>1</c:v></c:pt></c:numCache><c:strCache><c:pt idx="0"><c:v>1</c:v></c:pt></c:strCache><c:f>Sheet1!A1</c:f></c:chartSpace>`,
  'word/_rels/document.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="link1" Type="${R}/hyperlink" Target="https://example.com/【姓名001】" TargetMode="External"/></Relationships>`
 }),result=await restoreDocx(input,parseRestorationMapping({mappings:{'1':'合成甲','【姓名001】':'合成乙'}})),parts=await readZip(result.output),part=(name:string)=>parts.get(name)!.toString();
 expect(part('docProps/app.xml')).toContain('<Pages>1</Pages><Words>1</Words><AppVersion>1.0</AppVersion><Company>合成甲</Company>');expect(part('docProps/app.xml')).toContain('<vt:lpstr>合成甲</vt:lpstr>');
 expect(part('docProps/core.xml')).toContain('<cp:revision>1</cp:revision><dc:creator>合成甲</dc:creator>');expect(part('docProps/core.xml')).toContain('2026-10-15T00:00:01Z');
 expect(part('customXml/itemProps1.xml')).toContain('ds:itemID="{11111111-1111-1111-1111-111111111111}"');expect(part('customXml/itemProps1.xml')).toContain('ds:uri="urn:1"');expect(part('customXml/item1.xml')).toContain('title="合成甲"');expect(part('customXml/item1.xml')).toContain('<value>合成甲</value>');
 expect(part('word/charts/chart1.xml')).toContain('<c:numCache><c:pt idx="0"><c:v>1</c:v>');expect(part('word/charts/chart1.xml')).toContain('<c:strCache><c:pt idx="0"><c:v>合成甲</c:v>');expect(part('word/charts/chart1.xml')).toContain('<c:f>Sheet1!A1</c:f>');
 expect(part('word/document.xml')).toContain('id="1" descr="签章合成乙" title="合成甲"');expect(part('word/_rels/document.xml.rels')).toContain('Target="https://example.com/合成乙"');
 expect(result.stats.storyReplacements['word/document.xml']).toBe(3);expect(result.stats.storyReplacements['customXml/itemProps1.xml']).toBeUndefined();
});

it('rejects a ZIP with Word XML but no OPC control parts, and repairs a whole known wrapped typed value',async()=>{
 const valid=await minimal({'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>【姓名001】</w:t></w:r></w:p></w:body></w:document>`}),broken=await readZip(valid);broken.delete('[Content_Types].xml');broken.delete('_rels/.rels');const invalid=await writeZip(broken);
 await expect(restoreDocx(invalid,parseRestorationMapping({mappings:{'【姓名001】':'合成甲'}}))).rejects.toThrow('INVALID_OFFICE');
 const input=await minimal({'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:tbl><w:tblGrid><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="【跨度001】"/></w:tcPr><w:p><w:r><w:t>【姓名001】</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`}),result=await restoreDocx(input,parseRestorationMapping({mappings:{'【跨度001】':'1','【姓名001】':'合成甲'}})),document=xml((await readZip(result.output)).get('word/document.xml')!);
 expect(elements(document,W,'gridSpan')[0].getAttributeNS(W,'val')).toBe('1');expect(elements(document,W,'t')[0].textContent).toBe('合成甲');expect(result.stats.storyReplacements['word/document.xml']).toBe(2);
});

it('accepts a valid Content Types Default for the main XML part when no Override exists',async()=>{
 const CT='http://schemas.openxmlformats.org/package/2006/content-types',mainType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
 const input=await minimal({'[Content_Types].xml':`<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="${mainType}"/></Types>`,'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>【姓名001】</w:t></w:r></w:p></w:body></w:document>`}),result=await restoreDocx(input,parseRestorationMapping({mappings:{'【姓名001】':'合成甲'}}));
 expect((await parseOffice(result.output,'docx')).text).toContain('合成甲');expect((await readZip(result.output)).get('[Content_Types].xml')).toEqual((await readZip(input)).get('[Content_Types].xml'));
});

it('resolves a package-root absolute internal target without treating it as a host path',async()=>{
 const input=await minimal({'word/document.xml':'<w:document xmlns:w="'+W+'"><w:body><w:p><w:r><w:t>xml</w:t></w:r></w:p></w:body></w:document>'}),parts=await readZip(input);
 const rels=parts.get('_rels/.rels')!.toString();expect(rels).toContain('Target="word/document.xml"');parts.set('_rels/.rels',Buffer.from(rels.replace('Target="word/document.xml"','Target="/word/document.xml"')));
 const result=await restoreDocx(await writeZip(parts),parseRestorationMapping({mappings:{xml:'合成甲'}})),out=await readZip(result.output);expect(result.stats.totalReplacements).toBe(1);expect(out.get('word/document.xml')!.toString()).toContain('合成甲');expect(out.get('_rels/.rels')).toEqual(parts.get('_rels/.rels'));
 parts.set('_rels/.rels',Buffer.from(rels.replace('Target="word/document.xml"','Target="//outside.invalid/word/document.xml"')));await expect(restoreDocx(await writeZip(parts),parseRestorationMapping({mappings:{xml:'合成甲'}}))).rejects.toThrow('INVALID_OFFICE');
});
