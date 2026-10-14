// Static parsing only. Never imports or executes the inspected application.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const base = path.resolve(import.meta.dirname, '../../..');
const read = p => fs.readFileSync(path.join(base,p),'utf8');
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const ledger=JSON.parse(read('文档/逆向台账/ledger.json'));
// Immutable original first-58 scope; never derive expected scope from the report under validation.
const ids=["IPC-0dcec6bac9d5", "IPC-0f2d4d6b6262", "IPC-14a3820628e8", "IPC-196efa6b695b", "IPC-1a2923d565e2", "IPC-1abcdf6d1a56", "IPC-1c4d31759888", "IPC-1e8858b1ed43", "IPC-1e94f610b0e1", "IPC-22c459a29cd7", "IPC-243bf096202b", "IPC-251d99e85000", "IPC-25271d44841c", "IPC-27dd16394cd6", "IPC-28d93302bd32", "IPC-2a09a00cba17", "IPC-2c55a1969fb8", "IPC-2e9ce1df9fec", "IPC-3211d99d0f20", "IPC-3484537f3350", "IPC-34a47a0ff8e1", "IPC-37a279488720", "IPC-3a73e0100026", "IPC-3b4c9f7c2b97", "IPC-3f0d71fadee4", "IPC-429f13ae0835", "IPC-43e13058e656", "IPC-4567d2cc2f1d", "IPC-47ecc7525dfe", "IPC-499bd8d4596b", "IPC-4e269deca69e", "IPC-50d02c91469e", "IPC-523337153cab", "IPC-527f74c7a029", "IPC-539465a49a9b", "IPC-540edc231d28", "IPC-5634886c31f2", "IPC-5d7065a40d45", "IPC-5f5d0e7e7171", "IPC-6099fda9db85", "IPC-611ab311c5f6", "IPC-629ace0aecd1", "IPC-65f32fe31f76", "IPC-67a324d00c09", "IPC-69f3f32b9683", "IPC-6cb1afcdadfc", "IPC-6dcdb71fa095", "IPC-6f5f29f520a1", "IPC-72093dfff7bf", "IPC-73870d051b3f", "IPC-765d8b00f827", "IPC-77baf8b1932c", "IPC-7a1832cb9fe9", "IPC-7b3e67a5a715", "IPC-7c61ecffef61", "IPC-7d7beed074d0", "IPC-7de3f60b8ed5", "IPC-7f4cfe68e159"];
const selected=ledger.interfaces.filter(x=>ids.includes(x.id)).sort((a,b)=>a.id.localeCompare(b.id));
if(selected.length!==58) throw Error('Scope must remain 58');
const idx=JSON.parse(read('文档/逆向台账/contracts/ipc-contract-index.json')).channels;
const channels=selected.map(x=>({id:x.id,channel:x.name,apiPaths:[...new Set(idx.find(y=>y.channel===x.name).preloadExposures.map(x=>x.apiPath).filter(Boolean))],references:[]}));
const root='.data/research/lawbot-2026-10-13/extracted/dist/renderer';
const files=[];
function inventory(dir){for(const e of fs.readdirSync(path.join(base,dir),{withFileTypes:true})){const p=dir+'/'+e.name;e.isDirectory()?inventory(p):files.push(p)}}inventory(root);
const sources=[];
for(const p of files.filter(p=>/\.(?:m?js|html)$/.test(p)).sort()){
 const raw=fs.readFileSync(path.join(base,p)), source=raw.toString();sources.push({path:p,bytes:raw.length,sha256:hash(raw)});
 if(!/\.m?js$/.test(p))continue;
 const sf=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS); if(sf.parseDiagnostics.length)throw Error('Parse errors '+p);
 function visit(n){
  let value;
  if(ts.isIdentifier(n)||ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))value=n.text;
  if(value)for(const c of channels){
   const matching=c.apiPaths.filter(v=>v.split('.').at(-1)===value);
   if(value!==c.channel&&!matching.length)continue;
   const par=n.parent;let context=par;
   if(ts.isPropertyAccessExpression(par))context=par.parent;
   const pos=sf.getLineAndCharacterOfPosition(n.getStart(sf));
   c.references.push({path:p,line:pos.line+1,column:pos.character+1,start:n.getStart(sf),end:n.end,token:value,nodeKind:ts.SyntaxKind[n.kind],parentKind:ts.SyntaxKind[par.kind],context:context.getText(sf).slice(0,420),sliceSha256:hash(n.getText(sf))});
  }
  ts.forEachChild(n,visit);
 }visit(sf);
}
const out={scopeIds:selected.map(x=>x.id),sources,channels,note:'Token/property/string census is candidate evidence only. Receiver and alias semantic decisions are in ui-closure-a.json. Generic invoke bridge reachability is handled by the separate dynamic-closure review.'};
const target=path.join(import.meta.dirname,'ui-closure-a-census.json');const data=JSON.stringify(out,null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==data)throw Error('Census drift');console.log('58 channels; source inventory and static reference census unchanged');}else {fs.writeFileSync(target,data);console.log('wrote census for 58 channels');}
