// cg from readable/main.js:19294-19296; pure original V1 -> V2 migration.
function cg(e5) {
  return { ...JSON.parse(JSON.stringify(e5)), schemaVersion: 2, documents: e5.documents.map((e6) => ({ ...JSON.parse(JSON.stringify(e6)), fileKind: e6.fileKind, detection: { ...JSON.parse(JSON.stringify(e6.detection)), entities: e6.detection.entities.map((e7) => ({ ...e7, anchor: { ...e7.anchor } })) } })), reviewDecisionEvents: e5.reviewDecisionEvents.map((e6) => ({ ...JSON.parse(JSON.stringify(e6)), occurrenceAnchor: { ...e6.occurrenceAnchor } })) };
}
export {cg as migrateSourceWorkspaceV1};
