import{manualQueryValid}from'../../packages/contracts/manual-selection.ts';
import type{FastifyInstance}from'fastify';
import{z}from'zod';
import{id,FILE_MAX_BYTES}from'../../packages/contracts/index.ts';
import{projectScope,denied}from'./access.ts';
import{rows,sql}from'../../packages/adapters/db.ts';
import{runProcessing}from'../../packages/adapters/processing.ts';
export function registerManualOccurrenceRoutes(app:FastifyInstance){app.post('/api/documents/:id/manual-occurrences',{bodyLimit:FILE_MAX_BYTES},async req=>{const doc=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),query:z.string().min(1).refine(v=>v.isWellFormed()&&!v.includes("\0"))}).strict().parse(req.body);if(!manualQueryValid(input.query))denied('MANUAL_SELECTION_INVALID',400);return projectScope(req,{document:doc},['view_original','review'],async db=>{const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR SHARE`);if(!d)denied('NOT_FOUND',404);if(d.revision!==input.revision)denied('VERSION_CONFLICT',409);if(d.state!=='review')denied('DETECTION_INCOMPLETE',409);try{return await runProcessing({kind:'manual-occurrences',doc:d,query:input.query} as any);}catch(e){denied((e as Error).message,(e as Error).message==='MANUAL_SELECTION_INVALID'?400:409);}});});}
