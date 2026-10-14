import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

// Static parser only. No published JavaScript is imported, evaluated or executed.
const base = '.data/research/lawbot-2026-10-13';
const target = '文档/逆向台账/contracts/dynamic-closure.json';
const archive = `${base}/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/app.asar`;
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const fd = fs.openSync(archive, 'r');
function read(at, length) { const b = Buffer.alloc(length); if (fs.readSync(fd, b, 0, length, at) !== length) throw Error('Truncated ASAR'); return b; }
const headerPrefix = read(0, 16), headerSize = headerPrefix.readUInt32LE(4), headerBytes = read(16, headerPrefix.readUInt32LE(12));
const header = JSON.parse(headerBytes.toString('utf8')), archiveEntries = [];
function list(tree, prefix = '') { for (const [name, data] of Object.entries(tree.files ?? {})) { const p = prefix + name; if (data.files) list(data, p + '/'); else archiveEntries.push({ path: p, ...data }); } }
list(header);
const published = archiveEntries.filter(e => e.path.startsWith('dist/') && /\.(?:js|mjs|cjs|html)$/.test(e.path)).sort((a,b) => a.path.localeCompare(b.path));
const inventory = JSON.parse(fs.readFileSync(`${base}/asar-files.json`, 'utf8')).filter(p => p.startsWith('dist/') && /\.(?:js|mjs|cjs|html)$/.test(p)).sort();
if (JSON.stringify(inventory) !== JSON.stringify(published.map(p => p.path).sort())) throw Error('ASAR inventory drift');
const sourceFiles = [], sources = [];
for (const entry of published) {
  if (entry.unpacked || entry.link || !entry.offset) throw Error(`Unsupported source entry: ${entry.path}`);
  const bytes = read(8 + headerSize + Number(entry.offset), entry.size);
  const p = `${base}/extracted/${entry.path}`;
  // Retain missing public decoder source as data for reproducible evidence ranges.
  if (!fs.existsSync(p)) { if (process.argv.includes('--check')) throw Error(`Missing source ${p}`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); }
  if (sha(fs.readFileSync(p)) !== sha(bytes)) throw Error(`Extracted source differs from published archive: ${p}`);
  sourceFiles.push({ path: p, archiveMember: entry.path, size: bytes.length, sha256: sha(bytes) });
  if (!p.endsWith('.html')) sources.push(p);
}
const dependencySources=archiveEntries.filter(e=>!e.path.startsWith('dist/') && /\.(?:js|mjs|cjs)$/.test(e.path)).sort((a,b)=>a.path.localeCompare(b.path));
const dependencyManifest=[],dependencyBridgeMentions=[];
for(const entry of dependencySources) {
 const bytes=entry.unpacked ? fs.readFileSync(archive+'.unpacked/'+entry.path) : read(8+headerSize+Number(entry.offset),entry.size);
 dependencyManifest.push({path:entry.path,size:bytes.length,sha256:sha(bytes)});
 if(/\bipcRenderer\b|\bipcMain\b|\b(?:window|globalThis|self)\s*(?:\.|\[\s*["'])\s*(?:ipc|electron)\b/.test(bytes.toString('utf8'))) dependencyBridgeMentions.push(entry.path);
}
if(dependencyBridgeMentions.length) throw Error('Additional dependency bridge mentions need inspection');
fs.closeSync(fd);
const program = ts.createProgram(sources, { allowJs: true, noResolve: true, noLib: true, target: ts.ScriptTarget.Latest });
const checker = program.getTypeChecker();
const sfList = sources.map(p => program.getSourceFile(p));
const walk = (n, fn) => { fn(n); ts.forEachChild(n, c => walk(c, fn)); };
const fnLike = n => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);
function ref(n) { const s=n.getSourceFile(), start=n.getStart(s), end=n.end, a=s.getLineAndCharacterOfPosition(start); return { path:s.fileName, start,end,startLine:a.line+1,startColumn:a.character+1,sliceSha256:sha(s.text.slice(start,end)) }; }
const member = n => ts.isPropertyAccessExpression(n) ? n.name.text : ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : null;
const normalized = n => n.getText().replace(/\?\./g,'.').replace(/\s+/g,'');
function origin(n, seen=new Set()) {
  if (!n || seen.has(n)) return []; seen.add(n);
  if (ts.isParenthesizedExpression(n)) return origin(n.expression, seen);
  if (ts.isBinaryExpression(n) && [ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.BarBarToken].includes(n.operatorToken.kind)) return [...origin(n.left,new Set(seen)),...origin(n.right,new Set(seen))];
  const text=normalized(n);
  if (['window.ipc','window.electron.ipcRenderer','window.anbao'].includes(text)) return [{ name:text,evidence:ref(n) }];
  if (ts.isIdentifier(n)) {
    const ds=checker.getSymbolAtLocation(n)?.declarations??[];
    return ds.flatMap(d=>ts.isVariableDeclaration(d)&&d.initializer ? origin(d.initializer,new Set(seen)) : []);
  }
  return [];
}
const invokeCalls=[], bridgeReferences=[], computedCandidates=[], codeLoading=[], registrationCalls=[], wrappers=[], dynPreload=[], aliasNodes=[], preloadSends=[];
for (const s of sfList) {
  if(s.parseDiagnostics.length) throw Error(`Parse diagnostics in ${s.fileName}`);
  walk(s,n=>{
    if(ts.isVariableDeclaration(n) && n.initializer && origin(n.initializer).some(o=>['window.ipc','window.electron.ipcRenderer'].includes(o.name))) {
      if(!ts.isIdentifier(n.name)) throw Error('Destructured bridge alias requires review');
      aliasNodes.push(n);
    }
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      const names=origin(n);
      if(names.some(x=>['window.ipc','window.electron.ipcRenderer'].includes(x.name)) && normalized(n).startsWith('window.')) bridgeReferences.push({ expression:n.getText(), parentKind:ts.SyntaxKind[n.parent.kind], evidence:ref(n) });
      if(ts.isElementAccessExpression(n) && origin(n.expression).length && !ts.isStringLiteralLike(n.argumentExpression)) computedCandidates.push({expression:n.getText(),evidence:ref(n)});
    }
    if (!ts.isCallExpression(n)) return;
    const exp=n.expression, txt=normalized(exp);
    if(['eval','Function','window.eval'].includes(txt) || exp.kind===ts.SyntaxKind.ImportKeyword || /\.(?:loadURL|loadFile|executeJavaScript)$/.test(txt)) codeLoading.push({ expression:exp.getText(), arguments:n.arguments.map(a=>a.getText().slice(0,300)),evidence:ref(n) });
    if(txt==='electron.ipcRenderer.send') preloadSends.push({channel:ts.isStringLiteralLike(n.arguments[0])?n.arguments[0].text:null,evidence:ref(n)});
    if(member(exp)==='invoke') {
      const roots=origin(exp.expression), receiver=exp.expression?.getText();
      const value=n.arguments[0];
      const item={receiver, origins:roots, channel:ts.isStringLiteralLike(value)?value.text:null,channelExpression:value?.getText(), arguments:n.arguments.slice(1).map(a=>({expression:a.getText(),evidence:ref(a)})),evidence:ref(n)};
      if(s.fileName.includes('/renderer/')) invokeCalls.push(item);
      if(txt==='electron.ipcRenderer.invoke' && !item.channel) dynPreload.push(item);
    }
    if(/\.ipcMain\.(?:handle|on|once)$/.test(txt)) {
      const value=n.arguments[0], item={operation:member(exp), channel:ts.isStringLiteralLike(value)?value.text:null, channelExpression:value?.getText(), evidence:ref(n)};
      registrationCalls.push(item);
      if(!item.channel) {
        let owner=n.parent; while(owner && !fnLike(owner)) owner=owner.parent;
        if(!owner?.name || !ts.isIdentifier(owner.name)) throw Error('Unknown dynamic main registration owner');
        wrappers.push({ owner, symbol:checker.getSymbolAtLocation(owner.name), parameter:owner.parameters.findIndex(p=>p.name.getText()===value.getText()), item });
      }
    }
  });
}
const aliasAudit=aliasNodes.map(declaration=>({declaration:ref(declaration),expression:declaration.initializer.getText(),references:[]}));
const aliasSymbols=new Map(aliasNodes.map((d,i)=>[checker.getSymbolAtLocation(d.name),i]));
const aliasNames=new Set(aliasNodes.map(d=>d.name.text));
for(const source of sfList) walk(source,n=>{
 if(!ts.isIdentifier(n)||!aliasNames.has(n.text)) return;
 const i=aliasSymbols.get(checker.getSymbolAtLocation(n));
 if(i===undefined||n===aliasNodes[i].name) return;
 if(!(ts.isPropertyAccessExpression(n.parent)||ts.isElementAccessExpression(n.parent)) || n.parent.expression!==n || member(n.parent)!=='invoke' || !ts.isCallExpression(n.parent.parent) || n.parent.parent.expression!==n.parent) throw Error('Bridge alias escapes immediate invoke call');
 aliasAudit[i].references.push(ref(n.parent.parent));
});
function booleanUse(n) {
 const p=n.parent;
 if(ts.isIfStatement(p)&&p.expression===n) return true;
 if(ts.isConditionalExpression(p)&&p.condition===n) return true;
 if(ts.isPrefixUnaryExpression(p)&&p.operator===ts.SyntaxKind.ExclamationToken) return true;
 if(ts.isParenthesizedExpression(p)) return booleanUse(p);
 if(ts.isBinaryExpression(p)&&p.operatorToken.kind===ts.SyntaxKind.CommaToken&&p.right===n) return booleanUse(p);
 if(ts.isBinaryExpression(p)&&p.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken) return p.left===n || booleanUse(p);
 return false;
}
for(const s of sfList) if(s.fileName.includes('/renderer/')) walk(s,n=>{
 if(!(ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n))) return;
 const text=normalized(n), p=n.parent;
 if(text==='window.electron') {
  if(!(ts.isPropertyAccessExpression(p)&&['ipcRenderer','savePdfToDesensitized'].includes(p.name.text)) && !ts.isPrefixUnaryExpression(p) && !ts.isBinaryExpression(p)) throw Error('Electron bridge root escape');
 }
 if(!['window.ipc','window.electron.ipcRenderer'].includes(text)) return;
 if(ts.isPropertyAccessExpression(p)||ts.isElementAccessExpression(p)) {
  if(member(p)!=='invoke'||!ts.isCallExpression(p.parent)||p.parent.expression!==p) throw Error('Bridge invoke member escapes call');
 } else if(ts.isBinaryExpression(p) && p.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken) {
  if(!ts.isVariableDeclaration(p.parent) || !aliasNodes.includes(p.parent)) throw Error('Bridge fallback alias not audited');
 } else if(ts.isPrefixUnaryExpression(p) && p.operator===ts.SyntaxKind.ExclamationToken) {
  // Presence guards do not transfer the bridge.
 } else if(ts.isIfStatement(p) && p.expression===n) {
 } else if(booleanUse(n)) {
 } else throw Error('Unclassified bridge reference '+text+' '+ts.SyntaxKind[p.kind]+' '+p.getText().slice(0,250));
});
const wrapperReferences=[];
for(const w of wrappers) for(const s of sfList) walk(s,n=>{
  if(ts.isIdentifier(n) && checker.getSymbolAtLocation(n)===w.symbol && n!==w.owner.name) {
    if(!ts.isCallExpression(n.parent)||n.parent.expression!==n) throw Error('Dynamic registration wrapper escapes');
    const call=n.parent, value=call.arguments[w.parameter];
    if(!value||!ts.isStringLiteralLike(value)) throw Error('Nonliteral registration wrapper caller');
    wrapperReferences.push({channel:value.text,operation:w.item.operation,evidence:ref(call),wrapperEvidence:ref(w.owner)});
  }
});
const registrations=[...registrationCalls.filter(c=>c.channel),...wrapperReferences];
const calls=invokeCalls.filter(c=>c.origins.some(o=>['window.ipc','window.electron.ipcRenderer'].includes(o.name)));
const unmatchedInvokes=invokeCalls.filter(c=>!calls.includes(c));
if(dynPreload.length!==2 || unmatchedInvokes.length || computedCandidates.length || calls.some(c=>!c.channel)) throw Error('Unresolved invoke or computed bridge call; scope requires manual analysis');
const groups=['window.ipc','window.electron.ipcRenderer'].map(name=>{
 const found=calls.filter(c=>c.origins.some(o=>o.name===name));
 return {bridge:name+'.invoke',staticStatus:'closed-current-published-lexical-callset',runtimeInputStatus:'unbounded-by-bridge-design',permittedChannel:'any value supplied by renderer; no bridge whitelist',permittedArguments:'rest ...args forwarded unchanged',publishedCallCount:found.length,channels:[...new Set(found.map(c=>c.channel))].sort(),calls:found};
});
const channelTable=[...new Set(calls.map(c=>c.channel))].sort().map(channel=>({channel,callCount:calls.filter(c=>c.channel===channel).length,registrations:registrations.filter(c=>c.channel===channel),invokeHandlerPresent:registrations.some(c=>c.channel===channel&&c.operation==='handle')}));
const sendDispatch=preloadSends.map(call=>({...call,listenerRegistrations:registrations.filter(r=>r.channel===call.channel&&['on','once'].includes(r.operation)),invokeRegistrations:registrations.filter(r=>r.channel===call.channel&&r.operation==='handle')}));
const report={schemaVersion:1,mode:'static-only; published bundle never executed',sourceVersion:'Lawbot 0.5.9 arm64',scope:'All ASAR dist renderer/preload/main scripts and HTML; current published lexical calls, not all possible runtime inputs or external code',archive:{path:archive,headerSha256:sha(headerBytes),distExecutableMembers:published.map(e=>e.path)},sourceFiles,dependencyLexicalAudit:{scope:'All other ASAR JavaScript including unpacked dependency scripts; lexical screening only',files:dependencyManifest.length,manifestSha256:sha(JSON.stringify(dependencyManifest)),bridgeMentions:dependencyBridgeMentions},summary:{publishedDistFiles:published.length,otherJavascriptFilesScreened:dependencyManifest.length,parsedJavascriptFiles:sources.length,preloadDynamicBridges:dynPreload.length,preloadSendCallsWithoutOnListener:sendDispatch.filter(c=>!c.listenerRegistrations.length).length,rendererInvokeCallsites:calls.length,rendererLiteralChannels:channelTable.length,unresolvedRendererInvokeCallsites:unmatchedInvokes.length,computedBridgeAccesses:computedCandidates.length,auditedFallbackAliases:aliasAudit.length,dynamicRegistrationWrappers:wrappers.length,literalWrapperCallsites:wrapperReferences.length,invokeChannelsWithHandle:channelTable.filter(c=>c.invokeHandlerPresent).length,invokeChannelsWithoutHandle:channelTable.filter(c=>!c.invokeHandlerPresent).map(c=>c.channel)},bridges:groups,preloadSites:dynPreload,preloadSendDispatch:sendDispatch,channels:channelTable,allBridgeRootReferences:bridgeReferences,aliasAudit,codeLoadingSites:codeLoading,mainDynamicRegistration:{status:'all symbol references in parsed distribution are literal calls; no alias escape',wrappers:wrappers.map(w=>({evidence:ref(w.owner),registration:w.item})),calls:wrapperReferences},remainingBoundary:['The bridge itself accepts arbitrary channel and arguments; finite caller set is not an allowlist.','Absent license: no competitor processing, authorization or UI runtime acceptance.','Runtime supplied or injected code, future updates and third-party/native internals are outside lexical caller closure.','A matching ipcMain.on listener does not satisfy ipcRenderer.invoke; handle registration is assessed separately.']};
const encoded=JSON.stringify(report,null,2)+'\n';
if(process.argv.includes('--check')) {if(fs.readFileSync(target,'utf8')!==encoded) throw Error('Dynamic closure artifact differs from source-derived canonical output');}
else fs.writeFileSync(target,encoded);
console.log(JSON.stringify({status:'passed',...report.summary,artifactSha256:sha(encoded)}));
