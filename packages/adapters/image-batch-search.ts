import {verifiedDocumentSource} from './document-source.ts';
import {readOcrText} from './ocr-correction.ts';
import {imageSearchPage,searchImagePages} from '../core/image-batch-search.ts';
export async function imageBatchSearch(doc:any,query:string,pageIndex?:number){await verifiedDocumentSource(doc);const selected=(doc.page_data??[]).filter((p:any)=>pageIndex===undefined||p.index===pageIndex),pages=[];for(const page of selected)pages.push(imageSearchPage(await readOcrText(doc,page.index)));return {...searchImagePages(pages,query,pageIndex),revision:doc.revision,geometryBasis:'authenticated-canonical-glyphs',query};}
