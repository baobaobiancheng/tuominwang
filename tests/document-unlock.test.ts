import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unlockPdfDocument} from '../packages/core/document-unlock.ts';
import {openPdf} from '../packages/core/pdf-reader.ts';
import {pdfFixture} from './pdf-fixtures.ts';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
describe('user-provided PDF password, immutable encrypted original and verified plaintext derived copy',()=>{
 for(const [name,password] of [['rc4','synthetic-password'],['aes256','演示-synthetic-password']] as const)it(name+' decrypts only the provided password, verifies source geometry/text and reloads without a password',async()=>{
  const encrypted=await readFile(new URL('./fixtures/document-unlock/'+name+'.pdf',import.meta.url)),before=Buffer.from(encrypted);
  await expect(openPdf(encrypted)).rejects.toThrow('ENCRYPTED_PDF');
  await expect(unlockPdfDocument(encrypted,'wrong-synthetic-password')).rejects.toThrow('DOCUMENT_PASSWORD_INVALID');
  const result=await unlockPdfDocument(encrypted,password);expect(encrypted).toEqual(before);expect(result.sourceHash).toBe(hash(before));expect(result.derivedHash).toBe(hash(result.bytes));expect(result.pages).toBe(2);
  const parsed=await openPdf(result.bytes);try{expect(parsed.count).toBe(2);for(let i=0;i<2;i++)expect((await parsed.page(i)).text).toContain('13800138000');}finally{parsed.close();}
 });
 it('rejects invalid password inputs and malformed originals without producing success copies',async()=>{for(const password of ['', 'x'.repeat(4097),'abc\0secret','\ud800'])await expect(unlockPdfDocument(pdfFixture(),password)).rejects.toThrow('DOCUMENT_PASSWORD_INVALID');await expect(unlockPdfDocument(Buffer.from('invalid'),'valid-synthetic')).rejects.toThrow('INVALID_PDF');});
});
