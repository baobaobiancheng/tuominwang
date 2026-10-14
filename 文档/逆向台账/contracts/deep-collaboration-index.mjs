import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
// Parse published source as text only; no vendor module is executed.
const base='.data/research/lawbot-2026-10-13';
const paths=[`${base}/readable/main.js`,...['gatewayClient','tools','server','batchDelivery','aiDiagnostics'].map(x=>`${base}/extracted/lawbot-mcp/${x}.js`),...['bridge','schema','index'].map(x=>`${base}/extracted/lawbot-dsh/${x}.js`),`${base}/website/home-1.js`,...['MacUpdater','providers/Provider','providers/GenericProvider'].map(x=>`${base}/static-updater/node_modules/electron-updater/out/${x}.js`)];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const selectedClasses=new Set(['qw','ax','cx','dx','px','kw','df','mf','dp']);
const selectedFns=new Set(['lx','ux','mx','ge','Pw','Dw','Rw','Cw','Iw','Lw','Ww','Hw','Kw','Yw','Gw','Vw','Uw','Zw','Qw','ex','tx','nx','rx']);
const methods=[],sources=[];
for(const path of paths){
 const text=fs.readFileSync(path,'utf8'),sf=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 if(sf.parseDiagnostics.length) throw Error(`Parse error ${path}`);
 sources.push({path,sha256:sha(text),bytes:Buffer.byteLength(text)});
 const ref=n=>{const a=n.getStart(sf),b=n.end;return {path,start:a,end:b,start_line:sf.getLineAndCharacterOfPosition(a).line+1,end_line:sf.getLineAndCharacterOfPosition(b-1).line+1,slice_sha256:sha(text.slice(a,b)),offset_unit:'UTF-16'};};
 function walk(n){
  const cls=ts.isMethodDeclaration(n)&&n.parent.name?.text;
  const name=ts.isFunctionDeclaration(n)?n.name?.text:ts.isMethodDeclaration(n)?n.name.getText(sf):null;
  if(name&&(!path.endsWith('/readable/main.js')||selectedClasses.has(cls)||selectedFns.has(name))){
   const calls=[],throws=[];
   function inside(x){if(ts.isCallExpression(x)) calls.push({callee:x.expression.getText(sf),evidence:ref(x)});if(ts.isThrowStatement(x))throws.push({expression:x.expression.getText(sf),evidence:ref(x)});ts.forEachChild(x,inside);}
   inside(n);
   methods.push({key:`${path}#${cls?cls+'.':''}${name}`,class:cls||null,name,parameters:n.parameters.map(p=>p.getText(sf)),evidence:ref(n),calls,throws});
  }
  ts.forEachChild(n,walk);
 }
 walk(sf);
}
const result={schemaVersion:1,method:'TypeScript AST static parse, no vendor execution. Calls are syntactic inventory, not full interprocedural proof.',sources,methods};
const dest='文档/逆向台账/contracts/deep-collaboration-source-index.json';
const bytes=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(dest,'utf8')!==bytes) throw Error('source index drift');console.log(`PASS: ${sources.length} sources, ${methods.length} callable ranges`);}else{fs.writeFileSync(dest,bytes);console.log(`Wrote ${methods.length} callable ranges`);}
