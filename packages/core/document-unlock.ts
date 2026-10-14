import {init} from '@embedpdf/pdfium';
import {createHash} from 'node:crypto';
import {FILE_MAX_BYTES} from '../contracts/index.ts';
import {PDF_MAX_PAGES,checkPixels} from './pdf-reader.ts';
export type UnlockedDocument={format:'pdf';bytes:Buffer;sourceHash:string;derivedHash:string;pages:number};
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function fail(code:string):never{throw new Error(code);}
/** A provided password opens a new, hash-bound copy. This helper never writes or changes the encrypted original. */
export async function unlockPdfDocument(original:Buffer,password:string):Promise<UnlockedDocument>{
 if(typeof password!=='string'||!password.length||password.length>4096||!password.isWellFormed()||password.includes('\0'))fail('DOCUMENT_PASSWORD_INVALID');
 if(!original.length||original.length>FILE_MAX_BYTES)fail('FILE_SIZE_LIMIT');
 if(!original.subarray(0,1024).includes(Buffer.from('%PDF-')))fail('INVALID_PDF');
 const sourceHash=hash(original),p=await init({thisProgram:'tuominwang-document-unlock'} as Parameters<typeof init>[0]);p.PDFiumExt_Init();
 const heap=()=>(p.pdfium as typeof p.pdfium&{HEAPU8:Uint8Array<ArrayBuffer>}).HEAPU8,alloc=(n:number)=>p.pdfium.wasmExports.malloc(n),free=(ptr:number)=>p.pdfium.wasmExports.free(ptr);
 const source=alloc(original.length);let document=0,writer=0,copy=0,reopened=0,output=0;
 try{
  heap().set(original,source);document=p.FPDF_LoadMemDocument(source,original.length,password);
  if(!document){const error=p.FPDF_GetLastError();fail(error===4?'DOCUMENT_PASSWORD_INVALID':error===5?'DOCUMENT_ENCRYPTION_UNSUPPORTED':'DOCUMENT_UNLOCK_FAILED');}
  const pages=p.FPDF_GetPageCount(document);if(pages<1||pages>PDF_MAX_PAGES)fail('PAGE_LIMIT');
  function geometryAndText(doc:number){const results=[];for(let index=0;index<pages;index++){const page=p.FPDF_LoadPage(doc,index);if(!page)fail('DOCUMENT_UNLOCK_FAILED');let textPage=0;try{const width=p.FPDF_GetPageWidthF(page),height=p.FPDF_GetPageHeightF(page);checkPixels(Math.ceil(width),Math.ceil(height));textPage=p.FPDFText_LoadPage(page);if(!textPage)fail('DOCUMENT_UNLOCK_FAILED');const count=p.FPDFText_CountChars(textPage);if(count<0||count>100000)fail('PDF_TEXT_LIMIT');let text='';for(let n=0;n<count;n++){const cp=p.FPDFText_GetUnicode(textPage,n);if(cp===0)continue;if(cp>0x10ffff||cp>=0xd800&&cp<=0xdfff)fail('INVALID_PDF_TEXT');text+=String.fromCodePoint(cp);}results.push({width,height,rotation:p.FPDFPage_GetRotation(page),text});}finally{if(textPage)p.FPDFText_ClosePage(textPage);p.FPDF_ClosePage(page);}}return results;}
  const expected=geometryAndText(document),attachments=p.FPDFDoc_GetAttachmentCount(document),scripts=p.FPDFDoc_GetJavaScriptActionCount(document);
  writer=p.PDFiumExt_OpenFileWriter();if(!writer)fail('DOCUMENT_UNLOCK_FAILED');
  // The installed PDFium supports the long-standing remove-security flag 3; validate password-free reopening below.
  if(!p.FPDF_SaveAsCopy(document,writer,3))fail('DOCUMENT_UNLOCK_FAILED');
  const size=p.PDFiumExt_GetFileWriterSize(writer);if(!Number.isSafeInteger(size)||size<4||size>FILE_MAX_BYTES)fail('FILE_SIZE_LIMIT');
  output=alloc(size);const copied=p.PDFiumExt_GetFileWriterData(writer,output,size);if(copied!==size)fail('DOCUMENT_UNLOCK_FAILED');
  const bytes=Buffer.from(heap().slice(output,output+size));copy=alloc(bytes.length);heap().set(bytes,copy);reopened=p.FPDF_LoadMemDocument(copy,bytes.length,'');
  if(!reopened||p.FPDF_GetPageCount(reopened)!==pages||p.FPDFDoc_GetAttachmentCount(reopened)!==attachments||p.FPDFDoc_GetJavaScriptActionCount(reopened)!==scripts||JSON.stringify(geometryAndText(reopened))!==JSON.stringify(expected))fail('DOCUMENT_UNLOCK_VERIFICATION_FAILED');
  if(hash(original)!==sourceHash)fail('SOURCE_MISMATCH');
  return {format:'pdf',bytes,sourceHash,derivedHash:hash(bytes),pages};
 }finally{if(reopened)p.FPDF_CloseDocument(reopened);if(copy)free(copy);if(output)free(output);if(writer)p.PDFiumExt_CloseFileWriter(writer);if(document)p.FPDF_CloseDocument(document);free(source);p.FPDF_DestroyLibrary();}
}
