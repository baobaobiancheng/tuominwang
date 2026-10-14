import type { FastifyInstance } from 'fastify';
import { id, REVIEW_BODY_BYTES, type Mark } from '../../packages/contracts/index.ts';
import { policyRequestSchema } from '../../packages/contracts/policies.ts';
import { rows, sql } from '../../packages/adapters/db.ts';
import { runProcessing } from '../../packages/adapters/processing.ts';
import { projectScope, requirePermission } from './access.ts';
import { resolvePolicyMappings } from './mappings.ts';
import type { PolicyAliasRequest } from '../../packages/core/replacement-policies.ts';
function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
export function registerReplacementPolicies(app: FastifyInstance) {
  app.post('/api/documents/:id/replacement-policies', {bodyLimit: REVIEW_BODY_BYTES}, async req => {
    const doc = id.parse((req.params as any).id), input = policyRequestSchema.parse(req.body);
    return projectScope(req, {document: doc}, ['view_original', 'review'], async (db, project) => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc} FOR SHARE`);
      if (!d) fail('NOT_FOUND', 404);
      if (d.revision !== input.revision) fail('VERSION_CONFLICT');
      if (d.state !== 'review') fail(d.state === 'outdated' ? 'POLICY_CHANGED' : 'DETECTION_INCOMPLETE');
      try {
        const first = await runProcessing<{marks: Mark[]; aliasRequests: PolicyAliasRequest[]}>({kind:'replacement-policies', doc:d, marks:input.marks, replacementPolicies:input.policies});
        if (!first.aliasRequests.length) return {revision:d.revision, marks:first.marks};
        await requirePermission(db, project, ['view_mapping']);
        const mappings = await resolvePolicyMappings(db, d, req.user.id, first.aliasRequests);
        const result = await runProcessing<typeof first>({kind:'replacement-policies', doc:d, marks:input.marks, replacementPolicies:input.policies, mappings});
        if (result.aliasRequests.length) fail('MAPPING_MISMATCH', 400);
        return {revision:d.revision, marks:result.marks};
      } catch (e) {
        if ((e as any).statusCode) throw e;
        fail((e as Error).message, 400);
      }
    });
  });
}
