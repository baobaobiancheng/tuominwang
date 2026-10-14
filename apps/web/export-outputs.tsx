import React,{useEffect,useState} from 'react';
import type {DocumentView} from '../../packages/contracts/index.ts';
import {appUrl} from './urls.ts';
export function ExportOutputs({doc,api,run,disabled}:{doc:DocumentView;api:<T>(path:string,method?:string,body?:unknown)=>Promise<T>;run:(fn:()=>Promise<void>)=>Promise<void>;disabled:boolean}){
  const [outputs,setOutputs]=useState<{role:string;format:string}[]>([]);
  useEffect(()=>{let active=true;setOutputs([]);if(doc.job?.kind==='export'&&doc.job.status==='succeeded')void api<typeof outputs>(`/documents/${doc.id}/outputs?revision=${doc.revision}`).then(v=>{if(active)setOutputs(v.filter(a=>a.role!=='primary'));}).catch(()=>{});return()=>{active=false;};},[doc.id,doc.revision,doc.job?.status]);
  return <>{outputs.map(output=><button key={output.role} disabled={disabled} className="secondary" onClick={()=>void run(async()=>{const link=await api<{url:string}>(`/documents/${doc.id}/download-link`,'POST',{revision:doc.revision,role:output.role});const a=document.createElement('a');a.href=appUrl(link.url);a.click();})}>{output.role==='markdown'?'核验并下载 Markdown':'核验并下载 Word 副本'}</button>)}</>;
}
