import {test,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {visualReplacementPlan,renderVisualReplacement} from '../packages/core/visual-replacement.ts';
import {officeFixture} from './office-fixtures.ts';
import {parseOffice,exportOffice} from '../packages/core/office.ts';
import type {Mark} from '../packages/contracts/index.ts';
const text='13800138000',page={index:0,width:600,height:200},anchor={kind:'page'as const,page:0,start:0,end:11},glyphs=Array.from(text,(_,i)=>[i,i+1,40+i*32,50,32,50])as [number,number,number,number,number,number][],policy={mode:'raster'as const,regions:[],deletedPages:[]};
const mark=(value:string):Mark=>({start:0,end:11,kind:'手机号',decision:'redact',replacement:{mode:'custom',value},replacementOrigin:'manual',rasterReplacement:true});
test('empty and all-whitespace raster replacements only clear glyphs, including whitespace-only fragments of multiline geometry',{timeout:30000},async()=>{
 const source=await readFile('tests/fixtures/image-utilities-synthetic.png'),saved=Buffer.from(source);
 for(const value of ['', ' ', '    ', '\n', '\t', ' \n\t ', '\u00a0\u3000', '\u200b', '\u200d\u2060']){const plan=visualReplacementPlan(text,[mark(value)],[anchor],page,glyphs,policy);expect(plan.draws).toEqual([]);const output=await renderVisualReplacement(source,page,plan);const rows:Buffer[]=[];for(const g of glyphs)for(let y=g[3];y<g[3]+g[5];y++)rows.push(output.rgb.subarray((y*output.width+g[2])*3,(y*output.width+g[2]+g[4])*3));const everySelectedByte=Buffer.concat(rows);expect(everySelectedByte).toEqual(Buffer.alloc(everySelectedByte.length));}
 const twoLines=glyphs.map((g,i)=>[g[0],g[1],40+(i%6)*32,i<6?40:120,g[4],30]as typeof g),plan=visualReplacementPlan(text,[mark('      后续文字')],[anchor],page,twoLines,policy);expect(plan.draws.every(d=>d.text.trim().length>0)).toBe(true);await expect(renderVisualReplacement(source,page,plan)).resolves.toHaveProperty('png');expect(source).toEqual(saved);
});
test('multiline and XML/markup-looking or long custom values are actual escaped raster text; Word controls fail instead of writing invalid XML',async()=>{
 const source=await readFile('tests/fixtures/image-utilities-synthetic.png'),raw=await officeFixture('docx',{'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>13800138000</w:t></w:r></w:p></w:body></w:document>'}),parsed=await parseOffice(raw,'docx');
 for(const value of ['替换\n标签','<>【】 & " \'','<>【合成】 & '.repeat(40)]){const plan=visualReplacementPlan(text,[mark(value)],[anchor],page,glyphs,policy);expect(plan.draws.map(d=>d.text).join('')).toBe(value);await expect(renderVisualReplacement(source,page,plan)).resolves.toHaveProperty('png');const output=await exportOffice(raw,'docx',parsed.text,parsed.anchors,parsed.coverage,[mark(value)]),again=await parseOffice(output,'docx');expect(again.text.startsWith(value)).toBe(true);}
 for(const value of ['a\x01b','a\uFFFEb','a\uFFFFb'])await expect(exportOffice(raw,'docx',parsed.text,parsed.anchors,parsed.coverage,[mark(value)])).rejects.toThrow('OFFICE_XML_VALUE_INVALID');await expect(exportOffice(raw,'docx',parsed.text,parsed.anchors,parsed.coverage,[mark('a\0b')])).rejects.toThrow('INVALID_REPLACEMENT');
});
