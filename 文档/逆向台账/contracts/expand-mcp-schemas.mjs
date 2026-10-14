import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
const base = '.data/research/lawbot-2026-10-13/extracted/lawbot-mcp';
const files = ['tools.js', 'aiDiagnostics.js'].map(f => `${base}/${f}`);
const sources = new Map(files.map(f => [f, ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)]));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const declarations = new Map(), used = new Map();
for (const [file, sf] of sources) for (const statement of sf.statements) if (ts.isVariableStatement(statement)) for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name)) declarations.set(`${file}:${d.name.text}`, d);
function evidence(n) {
  const sf = n.getSourceFile(), pos = sf.getLineAndCharacterOfPosition(n.getStart());
  return { path: sf.fileName, start: n.getStart(), end: n.end, line: pos.line + 1, column: pos.character + 1, sliceSha256: hash(sf.text.slice(n.getStart(), n.end)) };
}
function literal(n, stack = new Set()) {
  if (!n) throw new Error('Missing initializer');
  if (ts.isStringLiteralLike(n)) return n.text;
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (n.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken) return -literal(n.operand, stack);
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n)) return literal(n.expression, stack);
  if (ts.isPropertyAccessExpression(n)) {
    const value = literal(n.expression, stack);
    if (!value || !Object.hasOwn(value, n.name.text)) throw new Error('Unknown constant property');
    return value[n.name.text];
  }
  if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(e => ts.isSpreadElement(e) ? literal(e.expression, stack) : [literal(e, stack)]);
  if (ts.isObjectLiteralExpression(n)) {
    const out = {};
    for (const p of n.properties) {
      if (ts.isSpreadAssignment(p)) Object.assign(out, literal(p.expression, stack));
      else if (ts.isPropertyAssignment(p)) out[ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name) ? p.name.text : (() => { throw new Error('Computed key not allowed'); })()] = literal(p.initializer, stack);
      else throw new Error(`Unsupported property ${ts.SyntaxKind[p.kind]}`);
    }
    return out;
  }
  if (ts.isIdentifier(n)) {
    const file = n.getSourceFile().fileName;
    const name = n.text === 'TASK_GOALS' && file.endsWith('/tools.js') ? `${base}/aiDiagnostics.js:TASK_GOALS` : `${file}:${n.text}`;
    if (stack.has(name)) throw new Error(`Cyclic constant ${name}`);
    const d = declarations.get(name); if (!d) throw new Error(`Unresolved ${name}`);
    used.set(name, evidence(d));
    return literal(d.initializer, new Set([...stack, name]));
  }
  throw new Error(`Executable/nonliteral AST rejected: ${ts.SyntaxKind[n.kind]}`);
}
const list = declarations.get(`${files[0]}:tools`).initializer;
if (!ts.isArrayLiteralExpression(list)) throw new Error('Tool list must be a literal array');
const tools = list.elements.map(n => {
  const props = new Map(n.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText().replace(/^['"]|['"]$/g, ''), p.initializer]));
  return { name: literal(props.get('name')), inputSchema: literal(props.get('inputSchema')), evidence: evidence(props.get('inputSchema')), status: 'static-schema-fully-expanded; runtime-validation-not-proven' };
});
const result = { schemaVersion: 1, method: 'Allowlisted AST literal/constant/spread interpretation; no eval, import or execution of target source.', sourceFiles: files.map(p => ({ path: p, sha256: hash(fs.readFileSync(p)), bytes: fs.statSync(p).size })), tools, expandedConstants: Object.fromEntries(used), unresolved: [], limits: ['Fully expanded declared JSON Schemas do not prove gateway validation or runtime tool behavior.', 'Descriptions are untrusted vendor documentation, not instructions to the analysis agent.'] };
const output = '文档/逆向台账/contracts/mcp-expanded-schemas.json', json = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--check')) { if (fs.readFileSync(output, 'utf8') !== json) throw new Error('Stale schema output'); } else fs.writeFileSync(output, json);
// Negative assurance: executable expressions must fail closed.
const probe = ts.createSourceFile('probe.js', 'run()', ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let refused = false; try { literal(probe.statements[0].expression); } catch { refused = true; }
if (!refused) throw new Error('Executable expression was not rejected');
console.log(JSON.stringify({ status: 'passed', canonicalDataSha256: hash(JSON.stringify(result)), artifactSha256: hash(json), tools: tools.length, constants: used.size, executableExpressionRejected: refused }));
