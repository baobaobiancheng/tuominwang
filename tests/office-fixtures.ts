import { writeZip } from "../packages/core/office-zip.ts";
import { readZip } from "../packages/core/office-zip.ts";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R = "http://schemas.openxmlformats.org/package/2006/relationships";
const C = "http://schemas.openxmlformats.org/package/2006/content-types";
export async function officeImageFixture(bytes: Buffer) {
  const files = await readZip(await officeFixture("docx"));
  const path = "word/media/customer-13800138000.jpg";
  files.set(path, bytes);
  const contentTypes = files.get("[Content_Types].xml")!.toString().replace("</Types>", `<Override PartName="/${path}" ContentType="image/jpeg"/></Types>`);
  files.set("[Content_Types].xml", Buffer.from(contentTypes));
  files.set("word/_rels/document.xml.rels", Buffer.from(`<Relationships xmlns="${R}"><Relationship Id="img1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/customer-13800138000.jpg"/></Relationships>`));
  files.set("word/document.xml", Buffer.from(`<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:t>Public image fixture, email demo@example.com</w:t></w:r></w:p><w:p><w:r><w:drawing><wp:inline><wp:extent cx="3810000" cy="4930000"/><wp:docPr id="1" name="Picture"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="Picture"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="img1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3810000" cy="4930000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`));
  return writeZip(files);
}
export async function officeFixture(format: "docx" | "xlsx", changes: Record<string, string | Buffer> = {}) {
  const main = format === "docx" ? "word/document.xml" : "xl/workbook.xml";
  const type = format === "docx" ? "wordprocessingml.document" : "spreadsheetml.sheet";
  const files: Record<string, string | Buffer> = {
    "[Content_Types].xml": `<Types xmlns="${C}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${type}.main+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="${R}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/></Relationships>`,
  };
  if (format === "docx") Object.assign(files, {
    "word/document.xml": `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>合成客户电话13800</w:t></w:r><w:r><w:t>138000</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>邮箱 demo@example.com</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:del w:author="13900139000"><w:r><w:delText>修订 13600136000</w:delText></w:r></w:del><w:r><w:instrText>HYPERLINK "https://example.com"</w:instrText></w:r></w:p><w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>文本框 13700137000</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p></w:body></w:document>`,
    "word/header1.xml": `<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>页眉 13500135000</w:t></w:r></w:p></w:hdr>`,
    "word/footer1.xml": `<w:ftr xmlns:w="${W}"><w:p><w:r><w:t>页脚 13400134000</w:t></w:r></w:p></w:ftr>`,
    "word/comments.xml": `<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="评论人"><w:p><w:r><w:t>批注 13300133000</w:t></w:r></w:p></w:comment></w:comments>`,
    "docProps/core.xml": `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>13200132000</dc:creator></cp:coreProperties>`,
  });
  else Object.assign(files, {
    "xl/workbook.xml": `<workbook xmlns="${S}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="公开页" sheetId="1" r:id="rId1"/><sheet name="隐藏页" sheetId="2" state="veryHidden" r:id="rId2"/></sheets><definedNames><definedName name="external">https://example.com</definedName></definedNames></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${R}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst xmlns="${S}" count="2" uniqueCount="2"><si><t>13800138000</t></si><si><t>13300133000</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>=HYPERLINK("https://example.com")</t></is></c><c r="C1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><f>13900139000</f><v>13900139000</v></c></row></sheetData></worksheet>`,
    "xl/comments1.xml": `<comments xmlns="${S}"><authors><author>13200132000</author></authors><commentList><comment ref="A1" authorId="0"><text><r><t>13100131000</t></r></text></comment></commentList></comments>`,
  });
  Object.assign(files, changes);
  return writeZip(new Map(Object.entries(files).map(([name, data]) => [name, Buffer.isBuffer(data) ? data : Buffer.from(data)])));
}
