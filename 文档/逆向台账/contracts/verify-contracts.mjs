import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const paths = ['.data/research/lawbot-2026-10-13/ipc-static-contracts.json', '文档/逆向台账/contracts/mcp-expanded-schemas.json'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const here = '文档/逆向台账/contracts/';
// Check existing artifacts against source-derived output before any report write.
// --check never regenerates a target artifact, so missing/deleted rows fail closed.
function check(command, args) {
  return JSON.parse(execFileSync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim());
}
const canonical = [check(process.execPath, [here + 'extract-ipc.mjs', '--check']), check(process.execPath, [here + 'expand-mcp-schemas.mjs', '--check'])];
const derivedCheck = check('python3', [here + 'summarize-contracts.py', '--check']);
function assertCanonical(data, expected, label) {
  if (hash(JSON.stringify(data)) !== expected.canonicalDataSha256) throw new Error(`${label}: data differs from authoritative source extraction`);
}
const sourceCache = new Map(), uniqueRanges = new Set();
let rangeReferences = 0;
const source = p => { if (!sourceCache.has(p)) sourceCache.set(p, fs.readFileSync(p, 'utf8')); return sourceCache.get(p); };
function range(ref) {
  if (!Number.isInteger(ref.start) || !Number.isInteger(ref.end) || ref.start < 0 || ref.end <= ref.start) throw new Error('Invalid source range');
  const text = source(ref.path);
  if (ref.end > text.length || hash(text.slice(ref.start, ref.end)) !== ref.sliceSha256) throw new Error('Source range hash mismatch');
}
function walk(value) {
  if (!value || typeof value !== 'object') return;
  if (value.path && value.sliceSha256) { range(value); rangeReferences++; uniqueRanges.add(`${value.path}:${value.start}:${value.end}`); }
  for (const child of Object.values(value)) if (typeof child === 'object') walk(child);
}
const artifacts = paths.map(p => ({ path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')), sha256: hash(fs.readFileSync(p)) }));
for (let i = 0; i < artifacts.length; i++) {
  assertCanonical(artifacts[i].data, canonical[i], artifacts[i].path);
  if (artifacts[i].sha256 !== canonical[i].artifactSha256) throw new Error('Artifact bytes differ from checked source output');
}
for (const [p, expected] of Object.entries(derivedCheck.artifactHashes)) if (hash(fs.readFileSync(p)) !== expected) throw new Error(`Derived artifact content drift: ${p}`);
for (const item of artifacts) {
  for (const s of item.data.sourceFiles) if (hash(fs.readFileSync(s.path)) !== s.sha256) throw new Error('Source file hash mismatch');
  walk(item.data);
}
const ipc = artifacts[0].data, functions = new Set(ipc.functions.map(f => f.id));
for (const c of ipc.channels) {
  if (!c.operations.length) throw new Error(`Historical channel has no source observations: ${c.channel}`);
  for (const h of c.handlers) if (!functions.has(h.functionId)) throw new Error(`Missing function: ${h.functionId}`);
  if (c.staticAssessment.complete !== false || c.staticAssessment.runtime !== 'R0') throw new Error('Unexpected unreviewed completeness/runtime upgrade');
}
for (const f of ipc.functions) for (const c of f.calls) if (c.resolvedFunctionId && !functions.has(c.resolvedFunctionId)) throw new Error('Unresolved declared graph edge');
if (new Set(ipc.channels.map(c => c.channel)).size !== ipc.channels.length) throw new Error('Duplicate channels');
const ledger = JSON.parse(fs.readFileSync('文档/逆向台账/ledger.json', 'utf8'));
function exactSet(actual, expected, label) {
  if (actual.length !== new Set(actual).size || actual.length !== expected.length || [...actual].sort().some((v, i) => v !== [...expected].sort()[i])) throw new Error(`${label}: missing/extra/duplicate set member`);
}
function assertLedger(candidate) {
  const channels = candidate.interfaces.filter(i => i.kind === 'IPC');
  exactSet(channels.map(i => i.name), ipc.channels.map(c => c.channel), 'ledger IPC names');
  exactSet(channels.map(i => i.id), ipc.channels.map(c => c.id), 'ledger IPC stable IDs');
  for (const row of channels) {
    const expected = ipc.channels.find(c => c.id === row.id);
    if (row.name !== expected.channel || row.contract_ref?.path !== here + 'ipc-contract-index.json' || row.contract_ref?.channel !== expected.channel) throw new Error(`ledger contract_ref mismatch: ${row.id}`);
  }
  const refs = candidate.interfaces.filter(i => i.contract_ref?.path === here + 'ipc-contract-index.json');
  exactSet(refs.map(i => i.contract_ref.channel), ipc.channels.map(c => c.channel), 'ledger IPC contract_ref set');
  exactSet(candidate.interfaces.filter(i => i.kind === 'MCP').map(i => i.name), artifacts[1].data.tools.map(t => t.name), 'ledger MCP names');
  const methodMap = { gateway_ping: null, start_secure_review: 'startSecureReview', start_local_restore: 'startLocalRestore', get_review_status: 'getReviewStatus', resume_secure_review: 'requestSessionResume', get_configuration_catalog: 'getConfigurationCatalog', wait_review_delivery: 'waitForReviewDelivery', get_sanitized_artifact: 'getArtifact', allocate_result_slot: 'allocateSlot', submit_pseudonymized_result: 'submitResult', request_local_restore: 'requestRestore', continue_review: 'continueReview', get_completion_status: 'completion', wait_restore_completion: 'waitForRestoreCompletion' };
  exactSet(candidate.interfaces.filter(i => i.kind === 'GATEWAY').map(i => i.name), Object.keys(methodMap), 'ledger gateway names');
  exactSet(ipc.gatewayServiceMethods.map(m => m.method), Object.values(methodMap).filter(Boolean), 'gateway service methods');
}
assertLedger(ledger);
const sample = ipc.channels[0].operations[0].evidence;
const negative = [];
for (const [name, altered] of [['range-content-hash', { ...sample, sliceSha256: '0'.repeat(64) }], ['range-offset', { ...sample, start: sample.start + 1 }]]) {
  let rejected = false; try { range(altered); } catch { rejected = true; }
  if (!rejected) throw new Error('Negative probe accepted'); negative.push({ name, rejected, mode: 'in-memory-only; no-source-mutation' });
}
const mutationCases = [
  ['deleted-ipc-channel', { ...ipc, channels: ipc.channels.slice(1) }, canonical[0]],
  ['deleted-mcp-tool', { ...artifacts[1].data, tools: artifacts[1].data.tools.slice(1) }, canonical[1]],
  ['changed-mcp-input-schema', { ...artifacts[1].data, tools: artifacts[1].data.tools.map((t, i) => i ? t : { ...t, inputSchema: { type: 'string' } }) }, canonical[1]],
];
for (const [name, altered, expected] of mutationCases) {
  let rejected = false; try { assertCanonical(altered, expected, name); } catch { rejected = true; }
  if (!rejected) throw new Error(`Structural negative probe accepted: ${name}`);
  negative.push({ name, rejected, mode: 'in-memory-only; authoritative source comparison; no-file-mutation' });
}
const alteredLedger = { ...ledger, interfaces: ledger.interfaces.map(i => i.kind === 'IPC' ? { ...i, contract_ref: undefined } : i) };
let badRefRejected = false; try { assertLedger(alteredLedger); } catch { badRefRejected = true; }
if (!badRefRejected) throw new Error('Missing contract_ref accepted');
negative.push({ name: 'missing-ledger-contract-ref', rejected: badRefRejected, mode: 'in-memory-only; no-file-mutation' });
const report = { status: 'passed', sourceFiles: sourceCache.size, rangeReferences, uniqueRanges: uniqueRanges.size, channels: ipc.channels.length, handlers: ipc.summary.handlers, functionContracts: ipc.functions.length, fullyExpandedMcpSchemas: artifacts[1].data.tools.length, sourceDeterminismChecks: ['extract-ipc --check', 'expand-mcp-schemas --check'], derivedDeterminismCheck: 'summarize-contracts --check', ledgerContractRefsChecked: ipc.channels.length, ledgerKindsMatched: ['IPC', 'MCP', 'GATEWAY'], artifactHashes: [...artifacts.map(({ path, sha256 }) => ({ path, sha256 })), ...Object.entries(derivedCheck.artifactHashes).map(([path, sha256]) => ({ path, sha256 }))], negativeProbes: negative, limits: 'Verifies source-derived artifact structure/content, derived files, ledger contract_ref sets, provenance and graph consistency; does not verify semantic completeness or execute proprietary code.' };
fs.writeFileSync('文档/逆向台账/contracts/verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
