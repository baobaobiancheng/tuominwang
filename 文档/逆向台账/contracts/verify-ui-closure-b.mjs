import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base='文档/逆向台账/contracts/';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
execFileSync(process.execPath,[base+'scan-ui-closure-b.mjs','--check']);
execFileSync('python3',[base+'build-ui-closure-b.py','--check']);
const report=JSON.parse(fs.readFileSync(base+'ui-closure-b.json'));
let refs=0;
const seen=new Set();
function walk(o){
 if(!o||typeof o!=='object')return;
 if(o.path&&o.sliceSha256&&o.start===undefined){const s=fs.readFileSync(o.path,'utf8'),lines=s.split(/(?<=\n)/);if(!Number.isInteger(o.startLine)||!Number.isInteger(o.endLine)||o.startLine<1||o.endLine<o.startLine||o.endLine>lines.length||hash(lines.slice(o.startLine-1,o.endLine).join(''))!==o.sliceSha256||hash(s)!==o.fileSha256)throw Error('Camel line range mismatch');refs++;seen.add(o.path+':L'+o.startLine+':'+o.endLine);}
 if(o.path&&o.sliceSha256&&o.start!==undefined){const s=fs.readFileSync(o.path,'utf8');if(!Number.isInteger(o.start)||!Number.isInteger(o.end)||o.start<0||o.end<=o.start||o.end>s.length||hash(s.slice(o.start,o.end))!==o.sliceSha256)throw Error('Offset range mismatch '+o.path);refs++;seen.add(o.path+':'+o.start+':'+o.end);}
 if(o.path&&o.slice_sha256){const s=fs.readFileSync(o.path,'utf8'),lines=s.split(/(?<=\n)/);if(!Number.isInteger(o.start_line)||!Number.isInteger(o.end_line)||o.start_line<1||o.end_line<o.start_line||o.end_line>lines.length||hash(lines.slice(o.start_line-1,o.end_line).join(''))!==o.slice_sha256)throw Error('Line range mismatch '+o.path+':'+o.start_line);refs++;seen.add(o.path+':L'+o.start_line+':'+o.end_line);}
 for(const v of Object.values(o))if(v&&typeof v==='object')walk(v);
}
for(const s of report.sourceFiles)if(hash(fs.readFileSync(s.path))!==s.sha256)throw Error('Source drift '+s.path);
walk(report);
console.log(JSON.stringify({ok:true,channels:report.contracts.length,rangeReferences:refs,uniqueRanges:seen.size,rendererLocated:report.summary.rendererLocated,noPublishedRendererCaller:report.summary.noPublishedRendererCaller}));
