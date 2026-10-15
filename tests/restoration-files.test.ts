import { expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { parseRestorationMapping, emittedRestorationTokens, readRestorationMapping, restoreDocx, restoreMarkdown } from "../packages/core/restoration-files.ts";
import { writeProtectedPortable } from "../packages/core/workspace-portable.ts";
import { officeFixture } from "./office-fixtures.ts";
import { elements, readZip, xml } from "../packages/core/office-zip.ts";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
it("parses all legacy/0.5/0.6 mapping inputs without choosing conflicting originals silently", () => {
  const data = { _meta: { version: "0.6", restoreStrategy: "token-canonical" }, mappings: { "【姓名001】": "合成甲" }, details: [{ pseudonym: "【姓名002】", normalized: "合成乙", entityType: "name_cn", forms: [{ original: "合成乙" }] }], occurrences: [{ token: "【姓名003】", original: "合成丙", entityType: "name_cn" }], entityMap: { "【邮箱001】": { canonical: "demo@example.com", forms: [{ original: "demo@example.com" }], entityType: "email", restoreChoice: "demo@example.com" } } };
  const plan = parseRestorationMapping(data); expect(Object.keys(plan.mappings)).toHaveLength(4); expect(plan.entityTypes["【邮箱001】"]).toBe("email");
  expect(parseRestorationMapping([{ pseudonym: "【姓名001】", normalized: "合成甲", entityType: "name_cn" }]).sourceVersion).toBe("legacy-array");
  const conflict = parseRestorationMapping({ mappings: { "【姓名001】": "合成甲" }, occurrences: [{ token: "【姓名001】", original: "合成乙" }] }); expect(conflict.ambiguities).toHaveLength(1); expect(() => restoreMarkdown(Buffer.from("【姓名001】"), conflict)).toThrow("RESTORE_AMBIGUOUS_MAPPING");
  expect(parseRestorationMapping({ mappings: { "【姓名001】": "合成甲" }, occurrences: [{ token: "【姓名001】", original: "合成乙" }] }, { choices: { "【姓名001】": "合成乙" } }).ambiguities).toEqual([]);
});
it("authenticates protected LPM bytes with caller-owned key and never guesses a local CMK", async () => {
  const data = { _meta: { version: "0.6" }, mappings: { "【姓名001】": "合成甲" } }, dek = randomBytes(32), file = await writeProtectedPortable(Buffer.from(JSON.stringify(data)), "pseudonym-mapping", "synthetic", { dek });
  expect((await readRestorationMapping(file, { dek })).data).toEqual(data); await expect(readRestorationMapping(file, { password: "unused-password" })).rejects.toThrow("PORTABLE_LOCAL_KEY_REQUIRED");
  const corrupted = Buffer.from(file); corrupted[corrupted.length - 1] ^= 1; await expect(readRestorationMapping(corrupted, { dek })).rejects.toThrow("PORTABLE_AUTH_FAILED");
});
it("restores Markdown raw/escaped/entity spellings once, honors occurrence order and rejects unknown tokens", () => {
  const plan = parseRestorationMapping({ mappings: { "【甲*1】": "原文【乙001】", "【乙001】": "合成乙" } });
  expect(restoreMarkdown(Buffer.from("【甲*1】 【甲\\*1】 【乙001】"), plan).output.toString()).toBe("原文【乙001】 原文【乙001】 合成乙");
  const ordered = parseRestorationMapping({ mappings: { "【姓名001】": "甲" }, occurrences: [{ token: "【姓名001】", original: "乙" }, { token: "【姓名001】", original: "丙" }] }, { strategy: "occurrence" }); expect(restoreMarkdown(Buffer.from("【姓名001】【姓名001】【姓名001】"), ordered).output.toString()).toBe("乙丙甲");
  expect(() => restoreMarkdown(Buffer.from("【未知001】"), plan)).toThrow("RESTORE_UNKNOWN_TOKEN"); expect(() => restoreMarkdown(Buffer.from("公开正文"), plan)).toThrow("RESTORE_NO_TOKENS");
});
it("restores cross-run/table/textbox/header/footer/footnote/endnote/comment/deletion stories with styles and real stats", async () => {
  const token = "【姓名001】", story = (root: string) => `<w:${root} xmlns:w="${W}"><w:p><w:r><w:t>${token}</w:t></w:r></w:p></w:${root}>`;
  const input = await officeFixture("docx", { "word/document.xml": `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>前缀【姓</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>名001】后缀</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>${token}</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>【 姓名 001 】</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p><w:p><w:del><w:r><w:delText>${token}</w:delText></w:r></w:del></w:p></w:body></w:document>`, "word/header1.xml": story("hdr"), "word/footer1.xml": story("ftr"), "word/comments.xml": story("comments"), "word/footnotes.xml": story("footnotes"), "word/endnotes.xml": story("endnotes") });
  const result = await restoreDocx(input, parseRestorationMapping({ mappings: { [token]: "合成甲" } })), parts = await readZip(result.output), body = xml(parts.get("word/document.xml")!);
  expect(result.stats.totalReplacements).toBe(9); expect(result.stats.crossRunReplacements).toBe(1); expect(result.stats.normalizedMatches).toBe(1); expect(elements(body, W, "t").map(n => n.textContent).join("")).toContain("前缀合成甲后缀"); expect(elements(body, W, "b")).toHaveLength(1); expect(elements(body, W, "i")).toHaveLength(1); expect(elements(body, W, "delText")[0].textContent).toBe("合成甲");
  for (const [name, bytes] of parts) if (/word\/(header|footer|comments|footnotes|endnotes)/.test(name)) expect(bytes.toString()).not.toContain(token);
  expect((await readZip(input)).get("word/document.xml")!.toString()).toContain("名001】后缀");
});
it("rebuilds restored email/URL hyperlinks preserving prefix/suffix and first-run formatting", async () => {
  const input = await officeFixture("docx", { "word/document.xml": `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>前缀【邮</w:t></w:r><w:r><w:t>箱001】后缀</w:t></w:r></w:p><w:p><w:r><w:t>【网址001】</w:t></w:r></w:p></w:body></w:document>` });
  const plan = parseRestorationMapping({ mappings: { "【邮箱001】": "demo@example.com", "【网址001】": "example.com/path" }, entityMap: { "【邮箱001】": { canonical: "demo@example.com", entityType: "email" }, "【网址001】": { canonical: "example.com/path", entityType: "website_url" } } }), result = await restoreDocx(input, plan), parts = await readZip(result.output), doc = xml(parts.get("word/document.xml")!);
  expect(result.stats.hyperlinkReplacements).toBe(2); expect(elements(doc, W, "t").map(e => e.textContent).join("")).toBe("前缀demo@example.com后缀example.com/path"); expect(elements(doc, W, "hyperlink")).toHaveLength(2); expect(parts.get("word/_rels/document.xml.rels")!.toString()).toContain("mailto:demo@example.com"); expect(parts.get("word/_rels/document.xml.rels")!.toString()).toContain("https://example.com/path");
});

it("processes multiple text nodes in one hyperlink-bearing run without detached-node false completion", async () => {
  const plan = parseRestorationMapping({ mappings: { "【邮箱001】": "demo@example.com", "【姓名001】": "合成甲" }, entityMap: { "【邮箱001】": { canonical: "demo@example.com", entityType: "email" } } });
  for (const tail of ["【姓名001】", "【邮箱001】"]) {
    const input = await officeFixture("docx", { "word/document.xml": `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>【邮箱001】</w:t><w:tab/><w:t>${tail}</w:t></w:r></w:p></w:body></w:document>` }), result = await restoreDocx(input, plan), parts = await readZip(result.output), doc = xml(parts.get("word/document.xml")!);
    expect(result.stats.totalReplacements).toBe(2); expect(elements(doc, W, "t").map(n => n.textContent).join("")).toBe(`demo@example.com${tail === "【姓名001】" ? "合成甲" : "demo@example.com"}`); expect(elements(doc, W, "tab")).toHaveLength(1); expect(parts.get("word/document.xml")!.toString()).not.toContain("001】");
  }
});

it("normalizes zero-width token separators consistently before matching and rejects normalized conflicting keys", async () => {
  const input = await officeFixture("docx", { "word/document.xml": `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>【姓\u200b名001】</w:t></w:r></w:p></w:body></w:document>` }), plan = parseRestorationMapping({ mappings: { "【姓名001】": "合成甲" } }), result = await restoreDocx(input, plan), parts = await readZip(result.output);
  expect(result.stats.totalReplacements).toBe(1); expect(parts.get("word/document.xml")!.toString()).toContain("合成甲");
  expect(() => parseRestorationMapping({ mappings: { "【姓名001】": "甲", "【姓\u200b名001】": "乙" } })).toThrow("RESTORE_NORMALIZED_TOKEN_COLLISION");
  expect(() => restoreMarkdown(Buffer.from("【姓名001】 【姓\u200b名001】"), plan)).toThrow("RESTORE_UNKNOWN_TOKEN");
});

it("keeps ordinary bracket labels while rejecting unknown numbered aliases and damaged wrappers in Markdown and Word", async () => {
  const plan = parseRestorationMapping({ mappings: { "【姓名001】": "合成甲" } }), content = "公开说明【重要】 与【姓名001】";
  expect(restoreMarkdown(Buffer.from(content), plan).output.toString()).toBe("公开说明【重要】 与合成甲");
  const docx = (text: string) => officeFixture("docx", { "word/document.xml": `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>` });
  const restored = await restoreDocx(await docx(content), plan); expect((await readZip(restored.output)).get("word/document.xml")!.toString()).toContain("公开说明【重要】 与合成甲");
  for (const unknown of ["【姓名999】", "【未知001】", "【姓名00A】", "【姓名】", "【姓名001", "姓名001】", "【【姓名001】"]) {
    expect(() => restoreMarkdown(Buffer.from(`${content} ${unknown}`), plan), unknown).toThrow("RESTORE_UNKNOWN_TOKEN"); await expect(restoreDocx(await docx(`${content} ${unknown}`), plan), unknown).rejects.toThrow("RESTORE_UNKNOWN_TOKEN");
  }
});

it('restores every inventoried metadata attribute/text, docProps and nonstandard Word XML without recursive replacement or overwritten hyperlink relationships',async()=>{
 const token='【姓名001】',input=await officeFixture('docx',{
  'word/document.xml':`<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p><w:r><w:rPr><w:rStyle w:val="${token}"/></w:rPr><w:t>【邮箱001】 ${token}</w:t></w:r></w:p></w:body></w:document>`,
  'docProps/core.xml':`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${token}</dc:title><dc:creator>${token}</dc:creator></cp:coreProperties>`,
  'word/comments.xml':`<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="${token}" w:initials="${token}"><w:p><w:r><w:t>${token}</w:t></w:r></w:p></w:comment></w:comments>`,
  'customXml/item1.xml':`<custom title="${token}"><value>${token}</value></custom>`,
  'word/_rels/document.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="source1" Type="${R}/hyperlink" Target="https://example.com/${token}" TargetMode="External"/></Relationships>`
 }),saved=Buffer.from(input),plan=parseRestorationMapping({mappings:{[token]:'合成甲 & 原文【姓名001】','【邮箱001】':'demo@example.com'},entityMap:{'【邮箱001】':{canonical:'demo@example.com',entityType:'email'}}}),result=await restoreDocx(input,plan),parts=await readZip(result.output);
 expect(result.stats.totalReplacements).toBe(11);expect(result.stats.hyperlinkReplacements).toBe(1);expect(result.stats.storyReplacements['docProps/core.xml']).toBe(2);expect(result.stats.storyReplacements['customXml/item1.xml']).toBe(2);
 expect(xml(parts.get('docProps/core.xml')!).getElementsByTagNameNS('http://purl.org/dc/elements/1.1/','title')[0].textContent).toBe('合成甲 & 原文【姓名001】');
 const body=xml(parts.get('word/document.xml')!);expect(elements(body,W,'t').map(n=>n.textContent).join('')).toBe('demo@example.com 合成甲 & 原文【姓名001】');expect(elements(body,W,'rStyle').every(e=>e.getAttributeNS(W,'val')==='合成甲 & 原文【姓名001】')).toBe(true);
 const rels=parts.get('word/_rels/document.xml.rels')!.toString();expect(rels).toContain('mailto:demo@example.com');expect(rels).toContain('https://example.com/合成甲 &amp; 原文【姓名001】');expect(input).toEqual(saved);
});
it('occurrence strategy retains body-before-metadata canonical order and unknown metadata tokens fail without a misleading success',async()=>{
 const token='【姓名001】',file=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${token}</w:t></w:r></w:p></w:body></w:document>`,'docProps/core.xml':`<p><title>${token}</title></p>`}),plan=parseRestorationMapping({mappings:{[token]:'fallback'},occurrences:[{token,original:'正文甲'},{token,original:'属性乙'}]},{strategy:'occurrence'}),parts=await readZip((await restoreDocx(file,plan)).output);
 expect(elements(xml(parts.get('word/document.xml')!),W,'t')[0].textContent).toBe('正文甲');expect(xml(parts.get('docProps/core.xml')!).getElementsByTagName('title')[0].textContent).toBe('属性乙');
 const unknown=await officeFixture('docx',{'docProps/core.xml':'<p author="【未知999】">公开【重要】</p>'});await expect(restoreDocx(unknown,parseRestorationMapping({mappings:{[token]:'合成甲'}}))).rejects.toThrow('RESTORE_UNKNOWN_TOKEN');
});

it('keeps distinct user-defined plain aliases literal instead of normalizing them into another occurrence queue',async()=>{
 const plan=parseRestorationMapping({mappings:{'AB':'甲','A B':'甲'},occurrences:[{token:'AB',original:'乙'},{token:'A B',original:'丙'}]},{strategy:'occurrence'}),file=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>A B|AB</w:t></w:r></w:p></w:body></w:document>`}),parts=await readZip((await restoreDocx(file,plan)).output);expect(elements(xml(parts.get('word/document.xml')!),W,'t')[0].textContent).toBe('丙|乙');
 expect(()=>parseRestorationMapping({mappings:{'【姓名001】':'甲','【姓 名001】':'甲'},occurrences:[{token:'【姓名001】',original:'乙'},{token:'【姓 名001】',original:'丙'}]},{strategy:'occurrence'})).toThrow('RESTORE_NORMALIZED_TOKEN_COLLISION');
 const separate=parseRestorationMapping({mappings:{'CLIENT A':'合成甲','CLIENTA':'合成乙'}}),doc=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>CLIENT A CLIENTA</w:t></w:r></w:p></w:body></w:document>`});expect(elements(xml((await readZip((await restoreDocx(doc,separate)).output)).get('word/document.xml')!),W,'t')[0].textContent).toBe('合成甲 合成乙');
});

it('rejects XML1.0-invalid original values instead of calling a corrupt Word package restored, while Markdown stays a literal text path',async()=>{
 const token='【姓名001】',input=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${token}</w:t></w:r></w:p></w:body></w:document>`});for(const invalid of ['\u0000','\u0001','\uFFFE','\uFFFF']){const plan=parseRestorationMapping({mappings:{[token]:'合成'+invalid+'原文'}});await expect(restoreDocx(input,plan)).rejects.toThrow('RESTORE_XML_VALUE_INVALID');const invalidInput=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${token}${invalid}</w:t></w:r></w:p></w:body></w:document>`});await expect(restoreDocx(invalidInput,plan)).rejects.toThrow('RESTORE_XML_VALUE_INVALID');expect(restoreMarkdown(Buffer.from(token),plan).output.toString()).toBe('合成'+invalid+'原文');}
});

it("emitted-token discovery retains complete plain and composite keys without granting a component alias",()=>{
 const known=['联系代号','【姓名001】【机构001】','前【邮箱001】后','  raw label  '];
 expect(emittedRestorationTokens('联系代号；【姓名001】【机构001】；前【邮箱001】后；  raw label  ',known)).toEqual(known);
 expect(emittedRestorationTokens('【姓名001】',known,true)).toEqual([]);
 expect(emittedRestorationTokens('联系代号；【姓 名001】 \u200b【机构001】；前【邮 箱001】后',known,true)).toEqual(known.slice(0,3));
});
