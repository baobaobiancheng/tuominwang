// Independent cross-review: no competitor execution, no artifact mutation probes on disk.
import fs from 'node:fs';import ts from 'typescript';import crypto from 'node:crypto';
const dir='文档/逆向台账/contracts/',hash=x=>crypto.createHash('sha256').update(x).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
const A=read(dir+'ui-closure-a.json'),B=read(dir+'ui-closure-b.json'),D=read(dir+'dynamic-closure.json'),I=read(dir+'ipc-contract-index.json').channels;
const ledger=read('文档/逆向台账/ledger.json');
const pending=ledger.interfaces.filter(x=>x.flow_mapping==='保留局部服务证据，UI入口待核').map(x=>x.id).sort();
const baselinePath=dir+'entry-closure-review-baseline.json';
// Baseline saved once while ledger still has the original pending set, then read without rewriting.
if(!fs.existsSync(baselinePath)){if(pending.length!==115)throw Error('Need original pending set');fs.writeFileSync(baselinePath,JSON.stringify({ids:pending},null,2)+'\n');}
const baseline=read(baselinePath).ids;
const base='.data/research/lawbot-2026-10-13/extracted/dist/renderer';
const files=fs.readdirSync(base,{recursive:true}).filter(x=>/\.(m?js|html)$/.test(x)).map(x=>base+'/'+x).sort();
const prog=ts.createProgram(files.filter(x=>!x.endsWith('.html')),{allowJs:true,noResolve:true,noLib:true,target:ts.ScriptTarget.Latest}), checker=prog.getTypeChecker();
function roots(n,seen=new Set()){
 if(!n)return[];if(ts.isParenthesizedExpression(n))return roots(n.expression,seen);
 if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.BarBarToken].includes(n.operatorToken.kind))return [...roots(n.left,new Set(seen)),...roots(n.right,new Set(seen))];
 if(ts.isPropertyAccessExpression(n))return roots(n.expression,seen).map(r=>r+'.'+n.name.text);
 if(ts.isElementAccessExpression(n)&&ts.isStringLiteralLike(n.argumentExpression))return roots(n.expression,seen).map(r=>r+'.'+n.argumentExpression.text);
 if(ts.isIdentifier(n)){const s=checker.getSymbolAtLocation(n);if(s&&!seen.has(s)){seen.add(s);const d=s.valueDeclaration;if(d&&ts.isVariableDeclaration(d)&&d.initializer)return roots(d.initializer,seen);}return[n.text];}return[];
}
const members=[],calls=[];for(const p of files.filter(x=>!x.endsWith('.html'))){const sf=prog.getSourceFile(p);if(sf.parseDiagnostics.length)throw Error('parse');function visit(n){if(ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n))for(const root of roots(n))members.push({root,path:p,start:n.getStart(sf),end:n.end});if(ts.isCallExpression(n)){const rs=roots(n.expression),arg=n.arguments[0];if(rs.some(x=>['window.ipc.invoke','window.electron.ipcRenderer.invoke'].includes(x))){if(!ts.isStringLiteralLike(arg))throw Error('unresolved dynamic argument');calls.push({channel:arg.text,path:p,start:n.getStart(sf)});}}ts.forEachChild(n,visit);}visit(sf);}
const compareSet=(a,b,label)=>{if(a.length!==new Set(a).size||a.length!==b.length||JSON.stringify([...a].sort())!==JSON.stringify([...b].sort()))throw Error(label);};
function validate(a,b,d){
 const rows=[...a.interfaces,...b.contracts];compareSet(rows.map(x=>x.id),baseline,'115 exact IDs');compareSet(a.interfaces.map(x=>x.id),baseline.slice(0,58),'A scope');compareSet(b.contracts.map(x=>x.id),baseline.slice(58),'B scope');
 for(const r of rows){const i=I.find(x=>x.id===r.id);if(!i||i.channel!==r.channel)throw Error('canonical identity');if(r.completeBusinessContract!==false||r.runtime!=='R0')throw Error('unsupported completion');const present=i.preloadExposures.some(x=>members.some(m=>m.root==='window.anbao.'+x.apiPath||m.root==='window.electron.'+x.apiPath))||calls.some(x=>x.channel===r.channel);const declared=r.entryResolution? r.entryResolution!=='no_renderer_reference':r.uiLocated;if(present!==declared)throw Error('classification mismatch '+r.channel);}
 const absent=rows.filter(r=>r.entryResolution==='no_renderer_reference'||r.uiLocated===false);
 if(absent.some(r=>calls.some(c=>c.channel===r.channel)))throw Error('unused covered by dynamic channel');
 const actualChannels=[...new Set(calls.map(x=>x.channel))];compareSet(d.channels.map(x=>x.channel),actualChannels,'dynamic exact channels');if(d.summary.rendererInvokeCallsites!==calls.length)throw Error('dynamic call count');
 const actualFiles=files.map(p=>({path:p,sha256:hash(fs.readFileSync(p))}));const declaredFiles=a.sourceInventory.filter(x=>x.path.includes('/renderer/'));compareSet(declaredFiles.map(x=>x.path),files,'A source inventory');for(const x of actualFiles){if(declaredFiles.find(y=>y.path===x.path).sha256!==x.sha256)throw Error('A source hash');const ds=d.sourceFiles.find(y=>y.path===x.path);if(!ds||ds.sha256!==x.sha256)throw Error('D source hash');}
 return {interfaces:rows.length,positive:rows.length-absent.length,absent:absent.length,dynamicOverlapWithAbsent:0,rendererFiles:files.length,invokeCalls:calls.length,literalChannels:actualChannels.length};
}
const result=validate(A,B,D), negative=[];const clone=x=>JSON.parse(JSON.stringify(x));
for(const [name,mut] of [
 ['remove-one-interface',(a,b)=>b.contracts.pop()],['duplicate-interface',(a,b)=>b.contracts[0]=clone(b.contracts[1])],['forge-ui-classification',(a)=>a.interfaces.find(r=>r.entryResolution==='no_renderer_reference').entryResolution='reachable_static'],['drop-dynamic-channel',(a,b,d)=>d.channels.pop()],['forge-source-hash',(a)=>a.sourceInventory[0].sha256='0'.repeat(64)],['upgrade-runtime',(a)=>a.interfaces[0].runtime='R2'],['omit-fallback-source',(a)=>a.sourceInventory=a.sourceInventory.filter(x=>!x.path.includes('openjpeg_nowasm'))]]){
 const aa=clone(A),bb=clone(B),dd=clone(D);mut(aa,bb,dd);let rejected=false;try{validate(aa,bb,dd);}catch{rejected=true;}if(!rejected)throw Error('Probe escaped '+name);negative.push({name,rejected});
}
const out={date:'2026-10-13',status:'passed',method:'Independent TS receiver/lexical-alias traversal; original pending set comparison; cross-artifact inventory and hash verification; in-memory mutation probes.',result,negative,artifactHashes:Object.fromEntries(['ui-closure-a.json','ui-closure-b.json','dynamic-closure.json'].map(x=>[x,hash(fs.readFileSync(dir+x))]))};fs.writeFileSync(dir+'entry-closure-cross-review.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
