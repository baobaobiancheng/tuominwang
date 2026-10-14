import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
const base='.data/research/lawbot-2026-10-13/extracted/dist/renderer';
const files=fs.readdirSync(base,{recursive:true}).filter(p=>/\.(js|mjs|html)$/.test(p)).map(p=>path.join(base,p)).sort();
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const ledger=JSON.parse(fs.readFileSync('文档/逆向台账/ledger.json'));
const output='文档/逆向台账/contracts/ui-closure-b-scan.json';
const prior=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):null;
// Fixed original 115-pending snapshot positions 58..114; independent of mutable output.
const ids=["IPC-7fb83198252b", "IPC-80e954e3a669", "IPC-82ace6842a00", "IPC-85f474cad97a", "IPC-8a12674fee54", "IPC-8f0322abb8b8", "IPC-93ba5dca8357", "IPC-9577d3a9d6d0", "IPC-978012face0b", "IPC-9a7ac510f8c7", "IPC-9ac7b5cfa48e", "IPC-9b9d5a0f489e", "IPC-9bb6c463b31f", "IPC-9dbd84b9715b", "IPC-a05e3b6af8e1", "IPC-a07c3fdcbe45", "IPC-a09f09579955", "IPC-a11af873aa1a", "IPC-a26e3c125cb6", "IPC-a70191351664", "IPC-a73b27802b39", "IPC-a982d6d137ce", "IPC-acbca2a96370", "IPC-b148b8418b82", "IPC-b199b300f630", "IPC-b2c075e4afde", "IPC-b3931f25eb79", "IPC-b67938c0cb2f", "IPC-b828b79da058", "IPC-ba48a535d0b1", "IPC-bb6001e11068", "IPC-c19a241811ac", "IPC-c1cec3199992", "IPC-ca4c19558c55", "IPC-caef950fe9a5", "IPC-ce03744a77ef", "IPC-cfbe72c62d81", "IPC-d0b393b9e93d", "IPC-d3e5e1de12d2", "IPC-d78ef82e46d5", "IPC-d79e3892b954", "IPC-d874c25112ba", "IPC-e024a8242875", "IPC-e25810712ab1", "IPC-e436786bb1f7", "IPC-e6a8f1b41825", "IPC-eceef0e6cff3", "IPC-ed495037f8dc", "IPC-efc77b9d6c1d", "IPC-f1f713df2b98", "IPC-f417c3628886", "IPC-f5725b5e0d8a", "IPC-f69ef883aa33", "IPC-f8d8e4c7c379", "IPC-f96c39b98bc8", "IPC-feab6613b5ed", "IPC-ff1d1193dc22"];
if(ids.length!==57)throw Error('Scope must be exactly57');
const all=JSON.parse(fs.readFileSync('文档/逆向台账/contracts/ipc-contract-index.json')).channels;
const channels=ids.map(id=>all.find(x=>x.id===id));
const program=ts.createProgram(files.filter(p=>!p.endsWith('.html')),{allowJs:true,noResolve:true,noLib:true,target:ts.ScriptTarget.Latest});
const checker=program.getTypeChecker();
function chain(n,seen=new Set()){
 if(!n)return'';
 if(ts.isParenthesizedExpression(n))return chain(n.expression,seen);
 if(ts.isPropertyAccessExpression(n))return chain(n.expression,seen)+'.'+n.name.text;
 if(ts.isElementAccessExpression(n)&&ts.isStringLiteralLike(n.argumentExpression))return chain(n.expression,seen)+'.'+n.argumentExpression.text;
 if(ts.isIdentifier(n)){
  const sym=checker.getSymbolAtLocation(n);if(sym&&!seen.has(sym)){seen.add(sym);const d=sym.valueDeclaration;if(d&&ts.isVariableDeclaration(d)&&d.initializer)return chain(d.initializer,seen);}
  return n.text;
 }
 return n.getText().slice(0,100);
}
const observations=[];
for(const file of files.filter(p=>!p.endsWith('.html'))){
 const sf=program.getSourceFile(file); if(sf.parseDiagnostics.length)throw Error('Parse failure '+file);
 const txt=sf.text;
 function range(n){const start=n.getStart(sf),end=n.getEnd(),a=sf.getLineAndCharacterOfPosition(start),b=sf.getLineAndCharacterOfPosition(end);return{path:file,start,end,startLine:a.line+1,startColumn:a.character+1,endLine:b.line+1,endColumn:b.character+1,sliceSha256:hash(txt.slice(start,end)),expression:n.getText()};}
 function visit(n){
  if(ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n)&&ts.isStringLiteralLike(n.argumentExpression)){
   const leaf=ts.isPropertyAccessExpression(n)?n.name.text:n.argumentExpression.text;
   for(const c of channels)if(c.preloadExposures.some(p=>p.apiPath.split('.').at(-1)===leaf))observations.push({id:c.id,channel:c.channel,type:'property',resolved:chain(n),evidence:range(n)});
  }
  if(ts.isStringLiteralLike(n))for(const c of channels)if(n.text===c.channel)observations.push({id:c.id,channel:c.channel,type:'channel-literal',evidence:range(n)});
  ts.forEachChild(n,visit);
 }
 visit(sf);
}
const report={schemaVersion:1,scopeIds:ids,method:'TypeScript AST property/literal inventory with lexical variable initializer alias expansion; no target execution. Scanner is evidence only; manual classification is separate.',files:files.map(p=>({path:p,bytes:fs.statSync(p).size,sha256:hash(fs.readFileSync(p))})),observations};
if(process.argv.includes('--check')){if(JSON.stringify(report)!==JSON.stringify(prior))throw Error('Scan drift');}else fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({channels:channels.length,files:files.length,observations:observations.length}));
