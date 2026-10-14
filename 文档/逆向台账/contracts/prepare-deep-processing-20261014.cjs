// Parse and pretty print only: never require/evaluate competitor modules.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..');
const rawPath='.data/research/lawbot-2026-10-13/extracted/dist/main/chunks/D9V2C_Ir.js';
const outputPath='.data/research/lawbot-2026-10-14/deep-processing/D9V2C_Ir.readable.js';
const raw=fs.readFileSync(path.join(root,rawPath),'utf8');
const src=ts.createSourceFile(rawPath,raw,ts.ScriptTarget.Latest,true);
const printed=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(src);
if(process.argv.includes('--check')) {
 if(fs.readFileSync(path.join(root,outputPath),'utf8')!==printed)throw new Error('Readable transform mismatch');
 console.log(JSON.stringify({ok:true,typescriptVersion:ts.version,rawSha256:crypto.createHash('sha256').update(raw).digest('hex'),readableSha256:crypto.createHash('sha256').update(printed).digest('hex')}));
} else {fs.mkdirSync(path.dirname(path.join(root,outputPath)),{recursive:true});fs.writeFileSync(path.join(root,outputPath),printed);}
