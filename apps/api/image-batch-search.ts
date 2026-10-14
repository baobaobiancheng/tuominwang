import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id,FILE_MAX_BYTES} from '../../packages/contracts/index.ts';
import {projectScope,denied} from './access.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {runProcessing} from '../../packages/adapters/processing.ts';
export function registerImageBatchSearchRoutes(app:FastifyInstance){app.post('/api/documents/:id/image-search',{bodyLimit:FILE_MAX_BYTES},async req=>{const doc=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),query:z.string().min(1).refine(v=>v.isWellFormed()&&!v.includes('\0')),pageIndex:z.number().int().nonnegative().optional()}).strict().parse(req.body);return projectScope(req,{document:doc},['view_original'],async db=>{const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc}`);if(!d)denied('NOT_FOUND',404);if(d.revision!==input.revision)denied('VERSION_CONFLICT',409);if(!d.page_data?.length)denied('PAGE_NOT_READY',409);if(input.pageIndex!==undefined&&!d.page_data.some((p:any)=>p.index===input.pageIndex))denied('INVALID_PDF_PAGE',400);try{return await runProcessing({kind:'image-batch-search',doc:d,query:input.query,pageIndex:input.pageIndex});}catch(e){denied((e as Error).message,(e as Error).message==='IMAGE_SEARCH_INVALID'?400:409);}});});}
