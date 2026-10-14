import React,{useEffect,useRef,useState} from 'react';
import {appUrl} from './urls.ts';
import {downloadResponse} from './workspace-portable.tsx';
export function MappingExport({projectId,enabled}:{projectId:string;enabled:boolean}){
 const [mode,setMode]=useState<'unifiedBatch'|'independentBatch'>('unifiedBatch'),[format,setFormat]=useState<'lpm'|'xlsx'>('lpm'),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),generation=useRef(0);
 useEffect(()=>{generation.current++;setPassword('');setNotice('');setBusy(false);return()=>{generation.current++;};},[projectId]);
 async function download(){const current=generation.current;setBusy(true);setNotice('');try{
  const documents=[];for(let offset=0;;offset+=100){const response=await fetch(appUrl(`/api/projects/${projectId}/documents?limit=100&offset=${offset}`));if(!response.ok)throw new Error('无法读取材料列表');const page=await response.json();documents.push(...page.map((d:any)=>({id:d.id,revision:d.revision})));if(page.length<100)break;}
  if(current!==generation.current)return;
  const response=await fetch(appUrl(`/api/projects/${projectId}/mapping-export`),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documents,mode:documents.length===1?'singleDocument':mode,format,...format==='lpm'&&password?{password}:{}})});
  if(current!==generation.current)return;if(response.status===401)window.dispatchEvent(new Event('session-expired'));
  if(!response.ok)throw new Error((await response.json()).error);
  await downloadResponse(response,documents.length>1&&mode==='independentBatch'?'假名表.zip':`假名表.${format}`);setPassword('');setNotice('假名表已下载。');
 }catch(e){if(current===generation.current)setNotice((e as Error).message);}finally{if(current===generation.current)setBusy(false);}}
 return <details><summary>导出假名表</summary><fieldset disabled={!enabled||busy}><legend>导出已确认假名的还原关系</legend><p className="muted">假名表包含原文。仅导出各材料当前已确认替换的假名，供核对或还原使用。</p><label>组织方式<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="unifiedBatch">项目统一假名表</option><option value="independentBatch">每份材料独立假名表</option></select></label><label>文件格式<select value={format} onChange={e=>{setFormat(e.target.value as typeof format);setPassword('');}}><option value="lpm">LPM 还原映射</option><option value="xlsx">Excel 核对表</option></select></label>{format==='lpm'&&<label>文件密码（可选，至少 4 字）<input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}/></label>}<button className="secondary" disabled={!!password&&password.length<4} onClick={()=>void download()}>下载假名表</button></fieldset>{notice&&<p role="status">{notice}</p>}</details>;
}
