import type {FastifyInstance} from 'fastify';
import {id,revisionSchema} from '../../packages/contracts/index.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {runProcessing} from '../../packages/adapters/processing.ts';
import {projectScope,denied as fail} from './access.ts';
export function registerOfficeVisualRoutes(app:FastifyInstance){
  app.post('/api/documents/:id/office-face-candidates',async req=>{
    const doc=id.parse((req.params as any).id),input=revisionSchema.parse(req.body);
    return projectScope(req,{document:doc},['view_original','review'],async db=>{
      const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc}`);
      if(!d)fail('NOT_FOUND',404);if(d.revision!==input.revision)fail('VERSION_CONFLICT',409);if(d.state!=='review')fail('DETECTION_INCOMPLETE',409);
      try{return {revision:d.revision,...await runProcessing<object>({kind:'office-faces',doc:d})};}catch(e){fail((e as Error).message,409);}
    });
  });
}
