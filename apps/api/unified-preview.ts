import type { FastifyInstance } from 'fastify';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { id, markSchema, MAX_MARKS, REVIEW_BODY_BYTES } from '../../packages/contracts/index.ts';
import { rows, sql } from '../../packages/adapters/db.ts';
import { seal, unseal } from '../../packages/adapters/storage.ts';
import { documentAliasEntities, prepareUnifiedAliasState, readUnifiedAliasState, writeUnifiedAliasState, aliasFail } from '../../packages/adapters/unified-aliases.ts';
import { activeDraftHash, currentOrImportedDraft, draftSourceHash, originalDraftEntityKey, projectDraftEditToMarks, withActiveDraft, type ActivePseudonymDraft } from '../../packages/core/original-pseudonym-draft.ts';
import { mergeUnifiedPreviewEntries, unifiedPreviewEntriesChanged } from '../../packages/core/reference/unified-preview-source.js';
import { profileForFormat, defaultProfile } from '../../packages/core/presets.ts';
import { resolveDocumentPolicy } from '../../packages/adapters/document-policy.ts';
import { getProjectPresetPolicy } from './presets.ts';
import { verifiedPdfOcrPartialPreview } from './pdf-ocr-draft.ts';
import { projectScope } from './access.ts';
import { ReferenceUnifiedAliases } from '../../packages/core/reference-unified-aliases.ts';
import { InheritedAliasRegistry } from '../../packages/core/reference-alias-lifecycle.ts';
import { openEntityCorrections } from '../../packages/adapters/entity-corrections.ts';
import { entitySpanKey } from '../../packages/core/entity-identity.ts';

const revision = z.number().int().nonnegative();
function localReviewEntities(document: any, marks: z.infer<typeof markSchema>[], text: string) {
  const frame = openEntityCorrections(document);
  const entries = frame?.entries.flatMap(entry => {
    if (entry.active === false) return [entry];
    const key = entitySpanKey(entry);
    if (entry.markIndex !== undefined) {
      const saved = document.marks[entry.markIndex];
      if (!saved || entitySpanKey(saved) !== key) aliasFail('ENTITY_CORRECTION_STALE');
    }
    const slots = marks.flatMap((mark, index) => entitySpanKey(mark) === key ? [index] : []);
    if (slots.length > 1) aliasFail('ENTITY_CORRECTION_AMBIGUOUS');
    return slots.length ? [{ ...entry, markIndex: slots[0] }] : [];
  });
  // documentAliasEntities uses the hydrated frame supplied here; giving it the
  // sealed saved slot numbers would attach a correction to a newly inserted mark.
  const { entity_corrections: _saved, ...local } = document;
  return documentAliasEntities({ ...local, marks, entityCorrections: frame ? { ...frame, entries } : null }, text);
}
const request = z.object({
  revision,
  documents: z.array(z.object({ id, revision, contentHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict()),
  active: z.object({ id, revision, contentHash: z.string().regex(/^[a-f0-9]{64}$/u), localReviewDirty: z.boolean(),
    marks: z.array(markSchema).max(MAX_MARKS),
    jobId: id.optional(), pageIndex: z.number().int().nonnegative().optional() }).strict(),
}).strict();

/** Source Qo2 -> Um2 -> Vm2. The cloud's active draft lives in portable_state;
 * ordinary saved review marks and already issued output remain separate. */
export function registerUnifiedPreviewRoutes(app: FastifyInstance) {
  app.post('/api/projects/:id/unified-aliases/prepare-preview', { bodyLimit: REVIEW_BODY_BYTES }, async req => {
    const project = id.parse((req.params as any).id), input = request.parse(req.body);
    return projectScope(req, { project }, ['view_original', 'view_mapping', 'review'], async db => {
      const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project} FOR UPDATE`);
      if (!p) aliasFail('NOT_FOUND', 404);
      const ready = await rows(db, sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id FOR UPDATE`);
      const [active] = await rows(db, sql`SELECT * FROM documents WHERE project_id=${project} AND id=${input.active.id} FOR UPDATE`);
      if (!active || active.revision !== input.active.revision || active.content_hash !== input.active.contentHash) aliasFail('VERSION_CONFLICT');
      if (active.state === 'queued') {
        if (input.active.jobId === undefined || input.active.pageIndex === undefined) aliasFail('DETECTION_INCOMPLETE');
        const partial = await verifiedPdfOcrPartialPreview(db,input.active.jobId,req.user.id,req.user.tenant_id,project,input.active.pageIndex);
        if (partial.documentId !== active.id || partial.revision !== active.revision || partial.contentHash !== active.content_hash) aliasFail('VERSION_CONFLICT');
      } else if (active.state !== 'review') aliasFail('DETECTION_INCOMPLETE');
      const before = await readUnifiedAliasState(db, req.user.tenant_id, project);
      if (input.revision !== before.revision) aliasFail('VERSION_CONFLICT');
      if (input.documents.length !== ready.length || new Set(input.documents.map(item => item.id)).size !== ready.length ||
          ready.some(d => !input.documents.some(item => item.id === d.id && item.revision === d.revision && item.contentHash === d.content_hash))) aliasFail('VERSION_CONFLICT');
      if (!before.frame?.enabled) return { enabled: false, revision: before.revision, changedDocuments: {}, documents: input.documents, previewMarks: input.active.marks };

      // Vm2 rebuilds draft entries; it does not save review marks. Do not call
      // alias materialization or activate a manually masked/ignored mark here.
      const { state, contexts } = await prepareUnifiedAliasState(db, req.user.tenant_id, project, ready, before.frame);
      let portable: Record<string, unknown> = p.portable_state ? JSON.parse(unseal(p.portable_state, `${p.tenant_id}:${project}:portable-state`)) : {};
      let changed = false;
      let activeDraft: ActivePseudonymDraft | undefined;
      const policy = getProjectPresetPolicy(p);
      for (const context of contexts) {
        const d = context.document, sourceHash = draftSourceHash(context.text);
        // The browser still owns unsaved marks on the active child. Rebuild
        // the other ready children without replacing that local draft.
        if (d.id === input.active.id && input.active.localReviewDirty) continue;
        const prior = currentOrImportedDraft(portable, d.id, sourceHash, d.revision);
        const built = state.buildPseudonymEntriesForFile(d.id, context.entities);
        // Original Jh2 keeps the old action, but fullRebuild takes rebuilt
        // token/lock values. Qh2 skips unchanged non-active children.
        const entries = mergeUnifiedPreviewEntries(prior?.entries, built, { preferRebuiltCurrentValue: true });
        if (d.id !== input.active.id && !unifiedPreviewEntriesChanged(prior?.entries, entries)) continue;
        const resolved = resolveDocumentPolicy(d, policy), profile = resolved.presetPolicy.profile?.settings ?? defaultProfile();
        const mode = resolved.documentPolicy?.configuration.exportMode ?? profileForFormat(profile, d.source_format, resolved.batchMode).defaultMode;
        const draft: ActivePseudonymDraft = { schemaVersion: 1, sourceHash, revision: d.revision, hasVisitedPreview: true,
          style: prior?.style ?? (mode === 'selective_pseudonym' ? 'selective' : 'custom'),
          typeActions: prior?.typeActions ?? profile.pseudonymTypeActions,
          entries };
        if (d.id === input.active.id) activeDraft = draft;
        if (activeDraftHash(prior) === activeDraftHash(draft)) continue;
        portable = withActiveDraft(portable, d.id, draft);
        changed = true;
      }
      // Unsaved browser marks belong to the active child. Rebuild its draft in
      // a detached alias snapshot and keep it in the same sealed draft store.
      // Only its mark projection is temporary; saveReview is not called.
      // Other ready children have already been rebuilt from sealed sources.
      const activeContext = contexts.find(context => context.document.id === active.id);
      if (input.active.localReviewDirty && activeContext) {
        const registry = new InheritedAliasRegistry();
        registry.set(before.frame.inheritance);
        const temporary = new ReferenceUnifiedAliases(registry);
        temporary.applySnapshot(state.toSnapshot());
        temporary.isUnifiedMode = true;
        const localEntities = localReviewEntities(active, input.active.marks, activeContext.text);
        temporary.registerFileEntities(active.id, activeContext.name, localEntities);
        const sourceHash = draftSourceHash(activeContext.text);
        const prior = currentOrImportedDraft(portable, active.id, sourceHash, active.revision);
        const built = temporary.buildPseudonymEntriesForFile(active.id, localEntities);
        const resolved = resolveDocumentPolicy(active, policy), profile = resolved.presetPolicy.profile?.settings ?? defaultProfile();
        const mode = resolved.documentPolicy?.configuration.exportMode ?? profileForFormat(profile, active.source_format, resolved.batchMode).defaultMode;
        activeDraft = { schemaVersion: 1, sourceHash, revision: active.revision, hasVisitedPreview: true,
          style: prior?.style ?? (mode === 'selective_pseudonym' ? 'selective' : 'custom'),
          typeActions: prior?.typeActions ?? profile.pseudonymTypeActions,
          entries: mergeUnifiedPreviewEntries(prior?.entries, built, { preferRebuiltCurrentValue: true }) };
        if (activeDraftHash(prior) !== activeDraftHash(activeDraft)) {
          portable = withActiveDraft(portable, active.id, activeDraft);
          changed = true;
        }
      }
      let previewMarks = input.active.marks;
      if (activeDraft && activeContext) {
        const entities = input.active.localReviewDirty
          ? localReviewEntities(active, input.active.marks, activeContext.text)
          : documentAliasEntities(active, activeContext.text);
        const previewEntities = entities.map(entity => {
          if (typeof entity.text !== 'string' || !entity.text ||
              !Number.isInteger(entity.startOffset) || !Number.isInteger(entity.endOffset)) aliasFail('SOURCE_MISMATCH');
          return { ...entity, text: entity.text, startOffset: entity.startOffset as number, endOffset: entity.endOffset as number };
        });
        const targetKeys = new Set(previewEntities.flatMap((entity, index) => {
          const mark = input.active.marks[index];
          return mark.decision === 'ignore' || mark.replacementOrigin === 'manual' ? [] : [originalDraftEntityKey(entity.type, entity.text)];
        }));
        previewMarks = projectDraftEditToMarks({ draft: activeDraft, entities: previewEntities, marks: input.active.marks, targetKeys });
      }
      if (changed) await rows(db, sql`UPDATE projects SET portable_state=${seal(JSON.stringify(portable), `${p.tenant_id}:${project}:portable-state`)} WHERE id=${project}`);
      const aliasRevision = !isDeepStrictEqual(before.frame.state, state.toSnapshot())
        ? await writeUnifiedAliasState(db, req.user.tenant_id, project, before.revision, state) : before.revision;
      return { enabled: true, revision: aliasRevision, changedDocuments: {}, previewMarks,
        documents: ready.map(d => ({ id: d.id, revision: d.revision, contentHash: d.content_hash })) };
    });
  });
}
