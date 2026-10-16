import {test} from 'vitest';
import assert from 'node:assert/strict';
import {folderOutputRelativePath,folderRelativePath} from '../packages/core/reference-folder.ts';

test('folder default name follows the verified primary format and preserves the relative directory',()=>{
 const source='批次/甲.doc',output=folderOutputRelativePath(source,'docx');
 assert.equal(source,'批次/甲.doc');
 assert.equal(output,'批次/甲.docx');
 assert.equal(folderOutputRelativePath('批次/甲.docx','docx'),output,'the manifest collision guard must reject this pair');
 assert.equal(folderOutputRelativePath('批次/乙.TXT','txt'),'批次/乙.txt');
 assert.throws(()=>folderOutputRelativePath('批次/乙.doc','../docx'),/FOLDER_FORMAT_INVALID/);
});

test('browser-safe folder path validation preserves every existing rejected shape',()=>{
 assert.equal(folderRelativePath('批次\\甲.doc'),'批次/甲.doc');
 for(const invalid of ['/absolute.doc','C:/drive.doc','../parent.doc','./dot.doc','batch//empty.doc','batch/','batch/CON.doc','batch/a\u0000.doc','//server/share.doc'])
  assert.throws(()=>folderRelativePath(invalid),/FOLDER_PATH_INVALID/,invalid);
});
