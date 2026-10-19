import {encodeXlsxString} from "./ooxml-string.ts";
import {entityLabel} from './entity-identity.ts';
import { writeZip } from './office-zip.ts';
import { parseOffice } from './office.ts';
import { parseRestorationMapping } from './restoration-files.ts';
import type { Mapping } from './mappings.ts';
import { validAliasToken } from '../contracts/alias-token.ts';

export function mappingExportData(mappings:Mapping[],occurrences:{token:string;original:string;entityType:string;documentId:string;start:number;end:number}[]) {
 const tokens=new Map<string,string>();
 for(const m of mappings){const previous=tokens.get(m.token);if(previous!==undefined&&previous!==m.value)throw new Error('AMBIGUOUS_MAPPING');tokens.set(m.token,m.value);}
 if(!tokens.size)throw new Error('MAPPING_NOT_FOUND');
 const data={_meta:{version:'0.6',product:'脱敏汪'},mappings:Object.fromEntries(tokens),details:mappings.map(m=>({pseudonym:m.token,normalized:m.value,entityType:entityLabel(m),entityTypes:[...new Set([m,...m.identities??[]].map(entityLabel))],forms:[...new Set([m.value,...m.forms??[]])].map(original=>({original})),scope:m.scope??null})),occurrences};
 const plan=parseRestorationMapping(data,{choices:Object.fromEntries(mappings.map(m=>[m.token,m.value])),allowCanonicalSelection:true});if(plan.ambiguities.length||Object.keys(plan.mappings).length!==tokens.size)throw new Error('ARTIFACT_MISMATCH');
 return data;
}
/** A single reviewed document may intentionally use one local pseudonym for
 * two originals. Keep both forms and let the existing restoration flow ask
 * for a single explicit choice. The project-wide ambiguity gate is unchanged. */
export function singleDocumentDraftMappingData(
 mappings:Mapping[],
 local:{token:string;original:string;entityType:string;documentId:string;start:number;end:number}[],
 occurrences:{token:string;original:string;entityType:string;documentId:string;start:number;end:number}[],
){
 const base=local.length?null:mappingExportData(mappings,occurrences);
 if(base)return base;
 const details=[...mappings.map(m=>({pseudonym:m.token,normalized:m.value,entityType:entityLabel(m),entityTypes:[...new Set([m,...m.identities??[]].map(entityLabel))],forms:[...new Set([m.value,...m.forms??[]])].map(original=>({original})),scope:m.scope??null})),...local.map(item=>({pseudonym:item.token,normalized:item.original,entityType:item.entityType,entityTypes:[item.entityType],forms:[{original:item.original}],scope:'document'}))];
 const fallback=Object.create(null) as Record<string,string>;
 for(const detail of details){if(!validAliasToken(detail.pseudonym)||!detail.normalized.trim())throw new Error('RESTORE_MAPPING_INVALID');fallback[detail.pseudonym]??=detail.normalized;}
 if(!Object.keys(fallback).length)throw new Error('MAPPING_NOT_FOUND');
 const data={_meta:{version:'0.6',product:'脱敏汪'},mappings:fallback,details,occurrences:occurrences.sort((a,b)=>a.start-b.start||a.end-b.end)};
 const plan=parseRestorationMapping(data);
 if(Object.keys(plan.mappings).length!==Object.keys(fallback).length)throw new Error('ARTIFACT_MISMATCH');
 return data;
}
export async function exportMappingWorkbook(mappings:Mapping[]) {
 const escape=encodeXlsxString;
 const table=[['假名','原文','信息类型','材料范围'],...mappings.map(m=>[m.token,m.value,[...new Set([m,...m.identities??[]].map(entityLabel))].join(" / "),m.scope??'项目统一'])];
 const parts=new Map<string,Buffer>(Object.entries({
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="假名表" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${table.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>`<c r="${'ABCD'[c]}${r+1}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
 }).map(([name,body])=>[name,Buffer.from(body)]));
 const bytes=await writeZip(parts),parsed=await parseOffice(bytes,'xlsx');
 const cells=parsed.anchors.filter(a=>a.object?.startsWith('cell:'));
 if(parsed.coverage.some(c=>c.status!=='complete')||cells.length!==table.length*4||cells.some(a=>parsed.text.slice(a.start,a.end)!==table[a.row!-1][a.column!-1]))throw new Error('ARTIFACT_MISMATCH');
 return bytes;
}
