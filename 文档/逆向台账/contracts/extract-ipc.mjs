import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import { parse as parseCsv } from 'csv-parse/sync';

// Parse published JavaScript as data. Never import or evaluate the target bundle.
const root = process.cwd();
const base = '.data/research/lawbot-2026-10-13';
const paths = [`${base}/extracted/dist/main/index.js`, `${base}/extracted/dist/preload/index.js`];
const output = `${base}/ipc-static-contracts.json`;
const program = ts.createProgram(paths, { allowJs: true, checkJs: false, noResolve: true, noLib: true, target: ts.ScriptTarget.Latest });
const checker = program.getTypeChecker();
const sources = paths.map(p => program.getSourceFile(p));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const short = (node, length = 180) => node ? node.getText().replace(/\s+/g, ' ').slice(0, length) : null;
const fnLike = n => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n);
const walk = (n, action) => { action(n); ts.forEachChild(n, child => walk(child, action)); };
function ref(n) {
  const sf = n.getSourceFile(), start = n.getStart(sf), end = n.end;
  const a = sf.getLineAndCharacterOfPosition(start), b = sf.getLineAndCharacterOfPosition(end);
  return { path: path.relative(root, path.resolve(sf.fileName)), start, end, startLine: a.line + 1, startColumn: a.character + 1, endLine: b.line + 1, endColumn: b.character + 1, sliceSha256: hash(sf.text.slice(start, end)) };
}
const key = n => `${ref(n).path}:${n.getStart()}`;
const fnParent = n => { for (let p = n.parent; p; p = p.parent) if (fnLike(p)) return p; return null; };
function symbol(n) { try { return checker.getSymbolAtLocation(n); } catch { return null; } }
function resolveFn(n, seen = new Set()) {
  if (!n || seen.has(n)) return null; seen.add(n);
  if (fnLike(n)) return n;
  if (ts.isParenthesizedExpression(n)) return resolveFn(n.expression, seen);
  const decls = symbol(ts.isPropertyAccessExpression(n) ? n.name : n)?.declarations ?? [];
  for (const d of decls) {
    if (fnLike(d)) return d;
    if (d.initializer) { const f = resolveFn(d.initializer, seen); if (f) return f; }
  }
  return null;
}
function expressionShape(n) {
  if (!n) return { type: 'undefined' };
  if (ts.isParenthesizedExpression(n) || ts.isAwaitExpression(n)) return { type: ts.isAwaitExpression(n) ? 'await' : 'parenthesized', value: expressionShape(n.expression) };
  if (ts.isObjectLiteralExpression(n)) return { type: 'object', properties: n.properties.map(p => ({ key: short(p.name), shape: ts.isPropertyAssignment(p) ? expressionShape(p.initializer) : { type: ts.isSpreadAssignment(p) ? 'spread' : 'shorthand', expression: short(p) } })) };
  if (ts.isArrayLiteralExpression(n)) return { type: 'array', elements: n.elements.slice(0, 30).map(expressionShape), truncated: n.elements.length > 30 };
  if (ts.isStringLiteralLike(n)) return { type: 'string-literal', value: n.text.slice(0, 300), truncated: n.text.length > 300 };
  if (ts.isNumericLiteral(n)) return { type: 'number-literal', value: n.text };
  if (n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword) return { type: ts.SyntaxKind[n.kind] };
  if (ts.isConditionalExpression(n)) return { type: 'conditional', condition: short(n.condition), whenTrue: expressionShape(n.whenTrue), whenFalse: expressionShape(n.whenFalse) };
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.CommaToken) return expressionShape(n.right);
  return { type: ts.SyntaxKind[n.kind], expression: short(n) };
}
function conditions(n, stop) {
  const result = [];
  for (let p = n.parent; p && p !== stop; p = p.parent) {
    if (ts.isIfStatement(p)) result.push({ kind: 'if', branch: n.pos >= p.thenStatement.pos && n.end <= p.thenStatement.end ? 'then' : 'else-or-condition', expression: short(p.expression), evidence: ref(p.expression) });
    if (ts.isConditionalExpression(p)) result.push({ kind: 'conditional', branch: n.pos >= p.whenTrue.pos && n.end <= p.whenTrue.end ? 'true' : 'false-or-condition', expression: short(p.condition), evidence: ref(p.condition) });
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(p.operatorToken.kind) && n.pos >= p.right.pos) result.push({ kind: ts.tokenToString(p.operatorToken.kind), expression: short(p.left), evidence: ref(p.left) });
  }
  return result;
}
const legacy = parseCsv(fs.readFileSync('文档/脱敏猫IPC接口清单.csv', 'utf8'), { columns: true, bom: true }).map(row => ({ name: row['通道'], id: 'IPC-' + hash(row['通道']).slice(0, 12) }));
const records = new Map(legacy.map(i => [i.name, { id: i.id, channel: i.name, historical: true, operations: [], handlers: [], preloadExposures: [], eventEmissions: [] }]));
function record(channel) {
  if (!records.has(channel)) records.set(channel, { id: 'IPC-' + hash(channel).slice(0, 12), channel, historical: false, operations: [], handlers: [], preloadExposures: [], eventEmissions: [] });
  return records.get(channel);
}
const calls = [], dynamics = [], wrappers = new Map(), fnNodes = new Map(), allFunctions = new Map();
for (const sf of sources) walk(sf, n => { if (ts.isCallExpression(n)) calls.push(n); if (fnLike(n)) allFunctions.set(key(n), n); });
const ipcCall = n => {
  const match = n.expression.getText().match(/\.ipc(Main|Renderer)\.(handle|on|once|invoke|send|removeListener)$/);
  return match && { side: match[1] === 'Main' ? 'main' : 'preload', operation: match[2] };
};
for (const n of calls) {
  const op = ipcCall(n); if (!op) continue;
  const ch = n.arguments[0];
  if (!ch || !ts.isStringLiteralLike(ch)) {
    const owner = fnParent(n), d = { ...op, expression: short(ch), evidence: ref(n), owner: owner ? ref(owner) : null, status: 'runtime-string-unbounded', resolvedCallsites: [] };
    dynamics.push(d);
    if (op.side === 'main' && owner && ts.isIdentifier(ch)) {
      const index = owner.parameters.findIndex(p => p.name.getText() === ch.text);
      if (index >= 0) wrappers.set(owner, { dynamic: d, parameterIndex: index });
    }
    continue;
  }
  const r = record(ch.text); r.operations.push({ ...op, evidence: ref(n), arguments: n.arguments.slice(1).map(a => ({ expression: short(a), shape: expressionShape(a) })), registrationConditions: conditions(n, fnParent(n)) });
  if (op.side === 'main' && ['handle', 'on', 'once'].includes(op.operation)) {
    const fn = resolveFn(n.arguments[1]);
    if (fn) { r.handlers.push({ functionId: key(fn), registration: ref(n), via: 'direct' }); fnNodes.set(key(fn), fn); }
  }
  if (op.side === 'preload') {
    const names = []; for (let p = n.parent; p; p = p.parent) if (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) names.unshift(short(p.name));
    const fn = fnParent(n);
    r.preloadExposures.push({ apiPath: names.join('.'), operation: op.operation, parameterSyntax: fn?.parameters.map(p => short(p)) ?? [], evidence: ref(n), forwardedArguments: n.arguments.slice(1).map(a => short(a)) });
  }
}
for (const n of calls) {
  const target = resolveFn(n.expression), w = wrappers.get(target);
  if (!w) continue;
  const ch = n.arguments[w.parameterIndex];
  if (!ch || !ts.isStringLiteralLike(ch)) continue;
  const r = record(ch.text), fn = resolveFn(n.arguments[1]);
  const item = { channel: ch.text, evidence: ref(n), callback: fn ? ref(fn) : null };
  w.dynamic.resolvedCallsites.push(item);
  r.operations.push({ side: 'main', operation: 'handle', via: 'parameterized-registration-wrapper', wrapperEvidence: ref(target), evidence: ref(n), registrationConditions: conditions(n, fnParent(n)) });
  if (fn) { r.handlers.push({ functionId: key(fn), registration: ref(n), via: 'wrapper', wrapperFunctionId: key(target) }); fnNodes.set(key(fn), fn); fnNodes.set(key(target), target); }
}
for (const w of wrappers.values()) if (w.dynamic.resolvedCallsites.length) w.dynamic.status = 'literal-call-sites-resolved; additional-runtime-callers-not-proven-absent';
for (const n of calls) {
  if (n.getSourceFile() !== sources[0]) continue;
  if (!ts.isPropertyAccessExpression(n.expression) || !['send', 'emit'].includes(n.expression.name.text)) continue;
  const ch = n.arguments[0];
  if (ch && ts.isStringLiteralLike(ch) && records.has(ch.text)) record(ch.text).eventEmissions.push({ evidence: ref(n), receiver: short(n.expression.expression), operation: n.expression.name.text, payloadShapes: n.arguments.slice(1).map(expressionShape), transportConfirmed: /webContents|sender/.test(n.expression.expression.getText()) });
}
const functions = new Map();
const gatewayMethodNames = ['startSecureReview', 'startLocalRestore', 'getReviewStatus', 'requestSessionResume', 'getConfigurationCatalog', 'waitForReviewDelivery', 'getArtifact', 'allocateSlot', 'submitResult', 'requestRestore', 'continueReview', 'completion', 'waitForRestoreCompletion'];
const gatewayMethods = gatewayMethodNames.map(name => {
  const matches = [...allFunctions.values()].filter(f => f.name?.getText() === name);
  for (const f of matches) fnNodes.set(key(f), f);
  return { method: name, candidates: matches.map(f => ({ functionId: key(f), evidence: ref(f), enclosingClass: ts.isClassDeclaration(f.parent) || ts.isClassExpression(f.parent) ? short(f.parent.name) : null })), completeness: 'local-method-contract-only; gateway binding manually corroborated' };
});
const activationPattern = /licen[sc]e|activat|authoriz|\u6388\u6743|\u6fc0\u6d3b|\u8bb8\u53ef/i;
function analyzeFunction(fn) {
  const id = key(fn); if (functions.has(id)) return;
  const body = fn.body, info = { id, evidence: ref(fn), parameters: fn.parameters.map(p => ({ syntax: short(p), rest: !!p.dotDotDotToken, default: p.initializer ? expressionShape(p.initializer) : null })), async: !!fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword), returns: [], throws: [], catches: [], parameterAccesses: [], parameterDestructuring: [], mutations: [], calls: [], nestedFunctions: [], activationSignals: [], controlConditions: [] };
  functions.set(id, info);
  if (!body) return;
  const params = new Set(fn.parameters.flatMap(p => ts.isIdentifier(p.name) ? [symbol(p.name)] : []).filter(Boolean));
  const seenAccess = new Set();
  const visit = n => {
    if (n !== body && fnLike(n)) { info.nestedFunctions.push({ functionId: key(n), evidence: ref(n), execution: 'callback-or-nested-declaration; invocation-not-assumed' }); fnNodes.set(key(n), n); return; }
    if (ts.isReturnStatement(n)) info.returns.push({ shape: expressionShape(n.expression), evidence: ref(n), enclosingConditions: conditions(n, fn) });
    if (ts.isThrowStatement(n)) info.throws.push({ expression: short(n.expression), shape: expressionShape(n.expression), evidence: ref(n), enclosingConditions: conditions(n, fn) });
    if (ts.isCatchClause(n)) info.catches.push({ binding: short(n.variableDeclaration?.name), evidence: ref(n) });
    if (ts.isIfStatement(n)) info.controlConditions.push({ expression: short(n.expression), evidence: ref(n.expression) });
    if (ts.isVariableDeclaration(n) && (ts.isObjectBindingPattern(n.name) || ts.isArrayBindingPattern(n.name)) && n.initializer && ts.isIdentifier(n.initializer) && params.has(symbol(n.initializer))) info.parameterDestructuring.push({ parameter: short(n.initializer), bindings: n.name.elements.map(e => short(e)), evidence: ref(n), required: 'destructuring does not prove validation; null may throw before checks' });
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) info.mutations.push({ target: short(n.left), operator: ts.tokenToString(n.operatorToken.kind), evidence: ref(n), scope: 'local-or-external-state; ownership-not-inferred' });
    if (ts.isDeleteExpression(n)) info.mutations.push({ target: short(n.expression), operator: 'delete', evidence: ref(n), scope: 'local-or-external-state; ownership-not-inferred' });
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      let p = n; while (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) p = p.expression;
      if (ts.isIdentifier(p) && params.has(symbol(p))) { const text = short(n); if (!seenAccess.has(text)) { seenAccess.add(text); info.parameterAccesses.push({ expression: text, evidence: ref(n), required: 'not-inferred-from-access' }); } }
    }
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const target = resolveFn(n.expression);
      const call = { callee: short(n.expression), evidence: ref(n), arguments: n.arguments?.map(a => ({ expression: short(a), shape: expressionShape(a) })) ?? [], resolvedFunctionId: target && sources.includes(target.getSourceFile()) ? key(target) : null, resolution: target && sources.includes(target.getSourceFile()) ? 'lexical-declaration' : 'unresolved-or-external' };
      info.calls.push(call);
      if (call.resolvedFunctionId) fnNodes.set(key(target), target);
      if (activationPattern.test(n.expression.getText())) info.activationSignals.push({ kind: 'call-name-candidate', expression: short(n.expression), evidence: ref(n), dominanceProven: false });
    }
    if (ts.isStringLiteralLike(n) && activationPattern.test(n.text)) info.activationSignals.push({ kind: 'string-literal-candidate', value: n.text.slice(0, 300), evidence: ref(n), dominanceProven: false });
    ts.forEachChild(n, visit);
  };
  visit(body);
  if (!ts.isBlock(body)) info.returns.push({ shape: expressionShape(body), evidence: ref(body), implicitArrowReturn: true });
}
// Fixed point, with no silent depth truncation; unresolved dynamic dispatch stays explicit.
for (const fn of fnNodes.values()) analyzeFunction(fn);
for (const r of records.values()) for (const handler of r.handlers) {
  const fn = fnNodes.get(handler.functionId), info = functions.get(handler.functionId);
  const params = new Set(fn.parameters.filter(p => ts.isIdentifier(p.name)).map(p => symbol(p.name)).filter(Boolean));
  info.capturedParameterAccesses = [];
  const seen = new Set();
  walk(fn.body, n => {
    if (!(ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) || fnParent(n) === fn) return;
    let p = n; while (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) p = p.expression;
    if (!ts.isIdentifier(p) || !params.has(symbol(p))) return;
    const signature = short(n); if (seen.has(signature)) return; seen.add(signature);
    info.capturedParameterAccesses.push({ expression: signature, evidence: ref(n), callbackFunctionId: key(fnParent(n)), execution: 'captured access; callback reachability not assumed', required: 'not-inferred-from-access' });
  });
}
for (const r of records.values()) {
  const reachable = new Set(), queue = r.handlers.flatMap(h => [h.functionId, h.wrapperFunctionId].filter(Boolean));
  while (queue.length) { const id = queue.pop(); if (reachable.has(id)) continue; reachable.add(id); const f = functions.get(id); if (!f) continue; for (const c of f.calls) if (c.resolvedFunctionId) queue.push(c.resolvedFunctionId); }
  const unresolved = [...reachable].flatMap(id => functions.get(id)?.calls.filter(c => !c.resolvedFunctionId).map(c => ({ functionId: id, callee: c.callee, evidence: c.evidence })) ?? []);
  r.directLexicalReachableFunctions = [...reachable]; r.unresolvedCalls = unresolved;
  r.activation = { status: 'not-proven-complete', signals: [...reachable].flatMap(id => functions.get(id)?.activationSignals.map(s => ({ functionId: id, ...s })) ?? []), note: 'Signals are candidate locations, not proof of a mandatory license gate. Nested callbacks, aliases, external chunks and service state may add gates.' };
  r.staticAssessment = { level: r.handlers.length ? 'handler-contract-partially-traced' : r.eventEmissions.length ? 'event-partially-traced' : 'declaration-only', complete: false, runtime: 'R0', gaps: ['No runtime validation or license-backed processing', 'No complete type schema or interprocedural alias/data-flow proof', ...(unresolved.length ? ['Unresolved/external calls and their returns/errors/effects remain'] : []), ...(!r.handlers.length ? ['No request handler; determine event-only versus missing registration'] : []), 'Direct lexical reachability does not prove all callbacks, registration reachability, cancellation or storage recovery'] };
}
const result = { schemaVersion: 1, mode: 'static-only-never-executed-target', sourceVersion: '0.5.9', sourceFiles: paths.map(p => ({ path: p, sha256: hash(fs.readFileSync(p)), bytes: fs.statSync(p).size, parseDiagnostics: program.getSourceFile(p).parseDiagnostics.length })), limits: ['Source expressions are bounded snippets; hashes/ranges identify full evidence without copying whole functions.', 'Parameter accesses are observed fields, not required-field schemas.', 'Return/throw lists are syntax observations, not exhaustive inferred runtime types.', 'All per-channel complete flags remain false until human closure of input/handler/calls/effects/output/failure branches.', 'No private network calls, activation bypass or target-code execution.'], summary: { historicalChannels: legacy.length, channels: records.size, historicalMissing: legacy.filter(i => !records.has(i.name)).map(i => i.name), newChannels: [...records.values()].filter(r => !r.historical).map(r => r.channel), handlers: [...records.values()].reduce((a, r) => a + r.handlers.length, 0), channelsWithHandlers: [...records.values()].filter(r => r.handlers.length).length, dynamicSites: dynamics.length, wrapperResolvedCallsites: dynamics.reduce((a, d) => a + d.resolvedCallsites.length, 0), functionContracts: functions.size }, dynamicSites: dynamics, channels: [...records.values()].sort((a, b) => a.channel.localeCompare(b.channel)), functions: [...functions.values()] };
result.gatewayServiceMethods = gatewayMethods;
const json = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(output, 'utf8') !== json) throw new Error('Generated IPC contracts are stale');
  console.log(JSON.stringify({ status: 'passed', canonicalDataSha256: hash(JSON.stringify(result)), artifactSha256: hash(json), ...result.summary }));
} else { fs.writeFileSync(output, json); console.log(JSON.stringify(result.summary)); }
