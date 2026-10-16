import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { id } from "../../packages/contracts/index.ts";
import { projectScope, denied as fail } from "./access.ts";
import { rows, sql } from "../../packages/adapters/db.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
export function registerVisualRoutes(app: FastifyInstance) {
  const active = new Map<string,{user:string;tenant:string;doc:string;seal?:AbortController;paused:boolean}>();
  app.post("/api/documents/:id/visual-requests/:requestId/pause-seals", async req => {
    const doc=id.parse((req.params as any).id),requestId=id.parse((req.params as any).requestId),current=active.get(requestId);
    if(!current||current.doc!==doc||current.user!==req.user.id||current.tenant!==req.user.tenant_id)fail("VISUAL_REQUEST_NOT_ACTIVE",409);
    current.paused=true;current.seal?.abort();return {success:true,requestId,paused:true};
  });
  app.post("/api/documents/:id/pages/:page/visual-candidates", async req => {
    const doc = id.parse((req.params as any).id), page = z.coerce.number().int().nonnegative().parse((req.params as any).page);
    const input = z.object({ revision: z.number().int().nonnegative(), requestId:id.optional(), detectors: z.array(z.enum(["face", "seal", "signature"])).min(1).max(3).refine(values => new Set(values).size === values.length, "duplicate detector") }).strict().parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "review"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT", 409);
      if (d.state !== "review") fail("DETECTION_INCOMPLETE", 409);
      const requestId=input.requestId??randomUUID();if(active.has(requestId))fail("VISUAL_REQUEST_CONFLICT",409);
      const current={user:req.user.id,tenant:req.user.tenant_id,doc,paused:false,seal:undefined as AbortController|undefined};active.set(requestId,current);
      const candidates:any[]=[],excludedCandidates:any[]=[],metadata:Record<string,unknown>={};
      try { for(const detector of input.detectors){if(detector==="seal"&&current.paused)continue;const controller=detector==="seal"?new AbortController():undefined;current.seal=controller;try{const result=await runProcessing<any>({kind:"visual-detect",doc:d,page,detectors:[detector]},{signal:controller?.signal});for(const [key,value]of Object.entries(result))if(value!==undefined&&!["candidates","excludedCandidates","warnings","complete"].includes(key))metadata[key]=value;metadata.warnings=[...new Set([...(metadata.warnings as string[]??[]),...result.warnings??[]])];metadata.complete=metadata.complete!==false&&result.complete!==false;candidates.push(...result.candidates);excludedCandidates.push(...result.excludedCandidates??[]);}catch(error){if(detector!=="seal"||!current.paused||(error as Error).message!=="PROCESSING_CANCELLED")throw error;}finally{current.seal=undefined;}}return {...metadata,revision:d.revision,page,requestId,candidates,excludedCandidates,sealsPaused:current.paused,complete:metadata.complete!==false&&!current.paused}; }
      catch (error) { fail((error as Error).message, 409); }finally{active.delete(requestId);}
    });
  });
}
