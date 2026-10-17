import {rememberedWorkspaceSave,rememberWorkspaceSave,forgetWorkspaceSave,resumeWorkspaceSave} from './workspace-save-cache.ts';
import React,{useState,useRef,useEffect}from'react';
import{appUrl}from'./urls.ts';
import{writeVerifiedClipboard}from'./clipboard.ts';
export function TmmCompatibility({projectId,activeDocumentId,canExport,canApply=false,onApplied,onImported,migrationCandidate}:{projectId:string|null;activeDocumentId?:string;canExport:boolean;canApply?:boolean;onApplied?:()=>Promise<void>;onImported?:(projectId:string)=>Promise<void>;migrationCandidate?:File|null}){
 const copyEpoch=useRef(0),passwordRef=useRef(''),allowed=useRef({projectId,canExport}),saveRequest=useRef<{project:string;password:string;format:string;activeDocumentId?:string;requestId:string}|null>(null);
 allowed.current={projectId,canExport};
 const [choices,setChoices]=useState<Record<string,string>>({});
 const epoch=useRef(0),fileChoice=useRef(0),[format,setFormat]=useState('secure-v3'),[password,setPassword]=useState(''),[oldPassword,setOldPassword]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<any>(null),[offerV1Migration,setOfferV1Migration]=useState(false),[isV1Zip,setIsV1Zip]=useState(false),[downloadPath,setDownloadPath]=useState<string|null>(null);
 useEffect(()=>{epoch.current++;setProfile(null);setMessage('');setDownloadPath(null);saveRequest.current=null;setOfferV1Migration(false);return()=>{epoch.current++;};},[projectId,canExport]);
 useEffect(()=>{const generation=++epoch.current;setDownloadPath(null);setBusy(false);if(!projectId||!canExport)return;
  const project=projectId,request=rememberedWorkspaceSave(project,format),active=()=>generation===epoch.current&&allowed.current.projectId===project&&allowed.current.canExport;
  if(request){setBusy(true);void resumeWorkspaceSave(project,format,request,active).then(result=>{if(!active()||!result)return;if(result.state==='completed')setDownloadPath(`/api/projects/${project}/portable/saves/${result.receiptId}/download`);else if(result.state==='failed')setMessage(result.error??'工程保存失败，请重新保存。');}).catch(error=>{if(active())setMessage(error.message);}).finally(()=>{if(active())setBusy(false);});}
  return()=>{epoch.current++;};
 },[projectId,canExport,format]);
 useEffect(()=>{if(migrationCandidate)void selectFile(migrationCandidate);},[migrationCandidate]);
 async function selectFile(selected:File|null){const choice=++fileChoice.current;setFile(selected);setProfile(null);setOfferV1Migration(false);setIsV1Zip(false);if(!selected)return;const header=new Uint8Array(await selected.slice(0,4).arrayBuffer());if(choice!==fileChoice.current)return;const legacy=header[0]===80&&header[1]===75&&header[2]===3&&header[3]===4;setIsV1Zip(legacy);setOfferV1Migration(legacy&&(selected.size>50*1024*1024||selected===migrationCandidate));}
 function changePassword(value:string){copyEpoch.current++;passwordRef.current=value;setPassword(value);setDownloadPath(null);setMessage('');}
 async function copyPassword(){const generation=epoch.current,request=++copyEpoch.current,value=passwordRef.current;setMessage('');const result=await writeVerifiedClipboard(value);if(generation===epoch.current&&request===copyEpoch.current&&passwordRef.current===value)setMessage(result.success?'传输密码已复制到系统剪贴板':result.error);}
 async function run(fn:(generation:number)=>Promise<void>){const generation=epoch.current;setBusy(true);setMessage('');try{await fn(generation);}catch(e){if(generation===epoch.current){const code=(e as Error).message;if(isV1Zip&&['FILE_SIZE_LIMIT','TMM_V1_LIMIT_EXCEEDED','TMM_V1_ENTRY_LIMIT','PORTABLE_ARCHIVE_LIMIT','WORKSPACE_ENTRY_LIMIT','WORKSPACE_ENTRY_TOO_LARGE','WORKSPACE_TOTAL_SIZE_LIMIT'].includes(code))setOfferV1Migration(true);setMessage(code);}}finally{if(generation===epoch.current)setBusy(false);}}
 async function request(path:string,body:unknown){const response=await fetch(appUrl('/api'+path),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(response.status===401)window.dispatchEvent(new Event('session-expired'));if(!response.ok){const data=await response.json();throw Error(data.error??`HTTP ${response.status}`);}return response;}
 function fileBody(selected:File,fields:Record<string,string|undefined>){const body=new FormData();body.append('file',selected);for(const[key,value]of Object.entries(fields))if(value!==undefined)body.append(key,value);return body;}
 async function requestFile(path:string,body:FormData){const response=await fetch(appUrl('/api'+path),{method:'POST',body});if(response.status===401)window.dispatchEvent(new Event('session-expired'));if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error??`HTTP ${response.status}`);}return response;}
 async function saveConverted(generation:number){
  if(!file)throw Error('请先选择工程文件');
  const selected=file,choice=fileChoice.current,picker=(window as Window & {showSaveFilePicker?: (options:{suggestedName:string;types:{description:string;accept:Record<string,string[]>}[]})=>Promise<{createWritable:()=>Promise<{write:(chunk:Uint8Array)=>Promise<void>;close:()=>Promise<void>;abort:()=>Promise<void>}>;getFile:()=>Promise<File>}>}).showSaveFilePicker;
  if(!picker)throw Error('当前浏览器无法直接另存工程，请使用支持文件保存的浏览器。');
  const handle=await picker({suggestedName:'转换后审查.tmm',types:[{description:'TMM 工程',accept:{'application/octet-stream':['.tmm']}}]});
  if(generation!==epoch.current||choice!==fileChoice.current)return;
  const target=await handle.getFile();
  if(generation!==epoch.current||choice!==fileChoice.current)return;
  if(target.name.normalize('NFC').toLowerCase()===selected.name.normalize('NFC').toLowerCase())throw Error('请选择不同的文件名另存，原工程文件会保留。');
  const response=await requestFile('/portable/migrate-file',fileBody(selected,{format,newPassword:password,password:oldPassword||undefined}));
  if(!response.body)throw Error('工程文件下载中断');
  if(generation!==epoch.current||choice!==fileChoice.current){await response.body.cancel().catch(()=>{});return;}
  const writable=await handle.createWritable(),reader=response.body.getReader();
  try{for(;;){const next=await reader.read();if(next.done)break;if(generation!==epoch.current||choice!==fileChoice.current)throw Error('PORTABLE_ABORTED');await writable.write(next.value);}await writable.close();}
  catch(error){await reader.cancel().catch(()=>{});await writable.abort().catch(()=>{});throw error;}
  if(generation===epoch.current&&choice===fileChoice.current)setMessage('已转换并核对全部原件及完整审查记录，请核对浏览器保存的文件。');
 }
 async function exportProject(generation:number){
  if(!projectId||!canExport)return;
  const project=projectId,active=()=>generation===epoch.current&&allowed.current.projectId===project&&allowed.current.canExport;
  if(saveRequest.current?.project!==project||saveRequest.current.password!==password||saveRequest.current.format!==format||saveRequest.current.activeDocumentId!==activeDocumentId)saveRequest.current={project,password,format,activeDocumentId,requestId:crypto.randomUUID()};
  const current=saveRequest.current;
  const send=async(path:string,body:unknown)=>{const response=await request(path,body);return response.json();};
  let result=await send(`/projects/${project}/portable/save`,{requestId:current.requestId,password:current.password,format:current.format,activeDocumentId:current.activeDocumentId});
  rememberWorkspaceSave(project,current.format,current.requestId);
  while(active()&&result.state==='running'){await new Promise(resolve=>setTimeout(resolve,2000));if(!active())return;result=await send(`/projects/${project}/portable/save-result`,{requestId:current.requestId});}
  if(!active())return;
  if(result.state!=='completed'){forgetWorkspaceSave(project,current.format,current.requestId);saveRequest.current=null;throw Error(result.error??'工程保存回执已失效，请重新保存。');}
  setDownloadPath(`/api/projects/${project}/portable/saves/${result.receiptId}/download`);saveRequest.current=null;setMessage('工程传输副本已保存，请点击下载链接并核对浏览器下载结果，妥善保存文件密码。');
 }
 async function migrateV1AndOpen(generation:number){
  if(!file||!isV1Zip)throw Error('请选择旧版 TMM V1 工程文件');
  const choice=fileChoice.current;
  const picker=(window as Window & {showSaveFilePicker?: (options:{suggestedName:string;types:{description:string;accept:Record<string,string[]>}[]})=>Promise<{createWritable:()=>Promise<{write:(chunk:Uint8Array)=>Promise<void>;close:()=>Promise<void>;abort:()=>Promise<void>}>;getFile:()=>Promise<File>}>}).showSaveFilePicker;
  if(!picker)throw Error('当前浏览器无法直接另存并打开工程，请使用支持文件保存的浏览器。');
  const stem=file.name.replace(/\.tmm$/i,''),handle=await picker({suggestedName:`${stem}_V2.tmm`,types:[{description:'TMM 工程',accept:{'application/octet-stream':['.tmm']}}]});
  if(generation!==epoch.current||choice!==fileChoice.current)return;
  const target=await handle.getFile();
  if(generation!==epoch.current||choice!==fileChoice.current)return;
  if(target.name.normalize('NFC').toLowerCase()===file.name.normalize('NFC').toLowerCase())throw Error('请选择不同的文件名另存，原工程文件会保留。');
  const body=new FormData();body.append('file',file);body.append('newPassword',password);
  const response=await fetch(appUrl('/api/portable/migrate-v1-file'),{method:'POST',body});
  if(response.status===401)window.dispatchEvent(new Event('session-expired'));
  if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(result.error??`HTTP ${response.status}`);}
  if(!response.body)throw Error('工程文件下载中断');
  if(generation!==epoch.current||choice!==fileChoice.current){await response.body.cancel().catch(()=>{});return;}
  const writable=await handle.createWritable(),reader=response.body.getReader();
  try{for(;;){const next=await reader.read();if(next.done)break;if(generation!==epoch.current||choice!==fileChoice.current)throw Error('PORTABLE_ABORTED');await writable.write(next.value);}await writable.close();}
  catch(error){await reader.cancel().catch(()=>{});await writable.abort().catch(()=>{});throw error;}
  if(generation!==epoch.current||choice!==fileChoice.current)return;
  const converted=await handle.getFile(),importBody=new FormData();
  importBody.append('name',`${stem}_V2`);importBody.append('password',password);importBody.append('file',converted);
  const imported=await fetch(appUrl('/api/portable/import-file'),{method:'POST',body:importBody});
  if(imported.status===401)window.dispatchEvent(new Event('session-expired'));
  if(!imported.ok){const result=await imported.json().catch(()=>({}));throw Error(result.error??`HTTP ${imported.status}`);}
  const result=await imported.json();if(generation!==epoch.current||choice!==fileChoice.current)return;
  setMessage('已另存为 TMM V2 并打开。请重新识别和复核后再导出。');await onImported?.(result.id);
 }
 return <fieldset disabled={busy}><legend>TMM 工程与审查记录</legend><p className="muted">支持旧版 ZIP 与 V2／V3 密码传输副本。旧本机密钥保护文件请先在原应用导出传输副本。工程文件包含原文和映射。</p>
 <label>导出或转换格式<select value={format} onChange={e=>{setFormat(e.target.value);setDownloadPath(null);}}><option value="legacy-zip">TMM V1（未加密）</option><option value="secure-v2">TMM V2 密码传输副本</option><option value="secure-v3">TMM V3 密码传输副本</option></select></label>{format==='legacy-zip'&&<p role="note">V1 文件未加密，请保存到受控位置。</p>}
 <label>新文件密码<input type="password" value={password} onChange={e=>changePassword(e.target.value)} autoComplete="new-password"/></label><button className="secondary" onClick={()=>changePassword(Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''))}>生成传输密码</button><button className="secondary" disabled={!password} onClick={()=>void copyPassword()}>复制传输密码</button>
 <button className="secondary" disabled={!projectId||!canExport||password.length<4} onClick={()=>void run(exportProject)}>下载当前项目 TMM</button>{downloadPath&&canExport&&<p><a href={appUrl(downloadPath)} target="_blank" rel="noopener noreferrer">下载已保存的审查传输副本</a></p>}
 <label>读取或转换 TMM<input type="file" accept=".tmm" onChange={e=>void selectFile(e.target.files?.[0]??null)}/></label><label>现有文件密码<input type="password" value={oldPassword} onChange={e=>setOldPassword(e.target.value)} autoComplete="off"/></label>
 <button className="secondary" disabled={!file||password.length<4} onClick={()=>void run(saveConverted)}>转换并下载</button>
 {offerV1Migration&&<><p role="note">旧版 TMM V1 工程超出普通打开范围。另存为 TMM V2 后会导入为新项目，原文件会保留。</p><button className="secondary" disabled={!file||password.length<4} onClick={()=>void run(migrateV1AndOpen)}>另存为 TMM V2 并打开</button></>}
 <button className="secondary" disabled={!file} onClick={()=>void run(async generation=>{const selected=file!,choice=fileChoice.current,response=await requestFile('/portable/review-profile-file',fileBody(selected,{password:oldPassword||undefined,fileName:selected.name})),result=await response.json();if(generation===epoch.current&&choice===fileChoice.current){setProfile(result);setChoices({});}})}>读取可沿用的审查记录</button>
 {profile&&<><p>{profile.sourceName} · {profile.corrections.length} 条规则 · {profile.pseudonyms.entries.length} 条假名 · {profile.conflicts.length} 项冲突</p>{profile.conflicts.map((c:any)=><label key={c.key}>{c.key}<select aria-label={c.key} value={choices[c.key]??''} onChange={e=>setChoices({...choices,[c.key]:e.target.value})}><option value="">请选择替换值</option>{c.choices.map((v:string)=><option key={v}>{v}</option>)}</select></label>)}<button className="secondary" disabled={!projectId||!canApply||profile.conflicts.some((c:any)=>!choices[c.key])} onClick={()=>void run(async generation=>{const selected=file,choice=fileChoice.current;if(!selected)throw Error('请先选择工程文件');const response=await fetch(appUrl(`/api/projects/${projectId}/presets`));if(!response.ok)throw Error('PERMISSION_DENIED');const state=await response.json();if(generation!==epoch.current||choice!==fileChoice.current)return;const applied=await requestFile(`/projects/${projectId}/portable/review-profile-file`,fileBody(selected,{password:oldPassword||undefined,revision:String(state.revision),choices:JSON.stringify(choices)}));if(generation!==epoch.current||choice!==fileChoice.current)return;await applied.json();setDownloadPath(null);await onApplied?.();setMessage('已沿用，请重新识别并复核材料。');})}>沿用规则与假名</button><table className="data-table"><thead><tr><th>内容</th><th>类型</th><th>处理</th></tr></thead><tbody>{profile.corrections.map((c:any)=><tr key={c.id}><td>{c.pattern}</td><td>{c.entityType}</td><td>{c.kind==='forceDetect'?'强制脱敏':'强制跳过'}</td></tr>)}</tbody></table></>}{busy&&<p role="status">正在处理工程文件…</p>}{message&&<p role="status">{message}</p>}
 </fieldset>;
}
