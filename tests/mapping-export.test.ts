import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mappingExportData,exportMappingWorkbook} from '../packages/core/mapping-export.ts';
import {parseRestorationMapping,restoreMarkdown} from '../packages/core/restoration-files.ts';
import {parseOffice} from '../packages/core/office.ts';
test('mapping export is a real restoration deliverable and spreadsheet values remain literal',async()=>{
 const mappings=[{id:'d',token:'【姓名_000001】',value:'=张三<&',kind:'姓名' as const,version:1 as const}];
 const data=mappingExportData(mappings,[{token:mappings[0].token,original:mappings[0].value,entityType:'姓名',documentId:'d',start:0,end:5}]);
 assert.equal(restoreMarkdown(Buffer.from('正文【姓名_000001】'),parseRestorationMapping(data)).output.toString(),'正文=张三<&');
 const parsed=await parseOffice(await exportMappingWorkbook(mappings),'xlsx');assert.ok(parsed.text.includes('=张三<&'));assert.equal(parsed.coverage.some(c=>c.status!=='complete'),false);
 assert.throws(()=>mappingExportData([],[]),/MAPPING_NOT_FOUND/);
 assert.throws(()=>mappingExportData([...mappings,{...mappings[0],id:'e',value:'李四'}],[]),/AMBIGUOUS_MAPPING/);
});
