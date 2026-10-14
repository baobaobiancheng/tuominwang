import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id,type Mark} from '../../packages/contracts/index.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {runProcessing} from '../../packages/adapters/processing.ts';
import type {KnownEntityCheck,KnownEntitySeed} from '../../packages/core/review-tools.ts';
import {projectScope,requirePermission} from './access.ts';
import {mappingsForMarks} from './mappings.ts';
import {saveReview} from './reviews.ts';
const inputSchema=z.object({documents:z.array(z.object({id,revision:z.number().int().nonnegative()}).strict()).min(1).max(1000)}).strict();
function fail(message:string,statusCode=409):never{throw Object.assign(new Error(message),{statusCode});}
export function registerProjectEntities(app:FastifyInstance){
  for(const operation of ['preview','apply'] as const) app.post(`/api/projects/:id/known-entities/${operation}`,async req=>{
    const project=id.parse((req.params as any).id),input=inputSchema.parse(req.body);
    if(new Set(input.documents.map(d=>d.id)).size!==input.documents.length)fail('INVALID_INPUT',400);
    return projectScope(req,{project},['view_original','review'],async db=>{
      const metadata=await rows(db,sql`SELECT id,revision,state,length(content)+length(marks::text) AS size FROM documents WHERE project_id=${project} ORDER BY id FOR UPDATE`);
      if(metadata.length!==input.documents.length||metadata.some(d=>input.documents.find(v=>v.id===d.id)?.revision!==d.revision))fail('VERSION_CONFLICT');
      if(metadata.some(d=>d.state!=='review'))fail('DETECTION_INCOMPLETE');
      if(metadata.reduce((n,d)=>n+d.size,0)>80*1024*1024)fail('BULK_REVIEW_LIMIT',400);
      const docs=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} ORDER BY id`),all=new Map<string,KnownEntitySeed>(),results=[];
      const deadline=Date.now()+120000;
      try{
        for(const d of docs){if(Date.now()>deadline)fail('PROCESSING_TIMEOUT',400);const seeds=await runProcessing<KnownEntitySeed[]>({kind:'entity-seeds',doc:d});for(const seed of seeds)all.set(JSON.stringify(seed),seed);}
        for(const d of docs){
          if(Date.now()>deadline)fail('PROCESSING_TIMEOUT',400);
          const mappings=await mappingsForMarks(db,d,d.marks,req.user.id);
          const check=await runProcessing<KnownEntityCheck>({kind:'known-entities',doc:d,marks:d.marks,entitySeeds:[...all.values()],mappings});
          if(operation==='apply'&&check.additions.some(m=>m.replacement?.mode==='alias'))await requirePermission(db,project,['view_mapping']);
          let revision=d.revision;
          if(operation==='apply'&&check.additions.length){const next:Mark[]=[...d.marks,...check.additions];revision=(await saveReview(db,req.user.id,d,next,Math.max(1,Math.min(15000,deadline-Date.now())))).revision;}
          results.push({id:d.id,revision,check});
        }
        return {documents:results,entityCount:all.size};
      }catch(e){if((e as any).statusCode)throw e;fail((e as Error).message,400);}
    });
  });
}
