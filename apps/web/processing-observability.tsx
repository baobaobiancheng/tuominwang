import React,{useState,useEffect,useRef}from'react';
import{appUrl}from'./urls.ts';
import{entityTypeIds}from'../../packages/contracts/presets.ts';
import{entityLabels}from'./entity-labels.ts';
type DocumentRef={id:string;revision:number;name?:string};
export function ProcessingObservability({project,documents,loadDocuments,api,run,onChanged}:{project:string;documents:DocumentRef[];loadDocuments?:()=>Promise<DocumentRef[]>;api:(path:string,method?:string,payload?:unknown)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<void>;onChanged?:()=>Promise<void>}){
 const epoch=useRef(0),loader=useRef(loadDocuments);loader.current=loadDocuments;
 const [open,setOpen]=useState(false),[loaded,setLoaded]=useState(documents),[report,setReport]=useState<any>(null),[stats,setStats]=useState<any>(null),[resources,setResources]=useState<any>(null),[entityType,setEntityType]=useState('name_cn'),[rawType,setRawType]=useState(''),[pattern,setPattern]=useState(''),[scope,setScope]=useState<'project'|'file'>('file'),[document,setDocument]=useState(''),[status,setStatus]=useState('');
 useEffect(()=>{epoch.current++;setReport(null);setStats(null);setResources(null);setDocument('');setStatus('');setLoaded(documents);return()=>{epoch.current++;};},[project]);
 async function currentDocuments(){const generation=epoch.current,all=await(loader.current?.()??Promise.resolve(documents));if(generation!==epoch.current)throw new Error('材料范围已变化，请重新操作');setLoaded(all);return all;}
 useEffect(()=>{if(open)void run(async()=>{await currentDocuments();});},[project,open]);
 const types=[...entityTypeIds.filter(id=>!['face','seal','signature'].includes(id)).map(id=>[id,entityLabels[id]??id]),['other','自定义'],['__raw__','其他实体类型…']],effectiveType=entityType==='__raw__'?rawType.trim():entityType;
 return <section><button className="secondary" onClick={()=>setOpen(!open)}>处理报告与运行规则</button>{open&&<div className="panel">
  <h2>处理报告</h2><p>报告包含材料版本、原件和已核验副本的指纹及待审状态。当前载入 {loaded.length} 份材料。</p>
  <button disabled={!loaded.length} onClick={()=>void run(async()=>{const generation=epoch.current,all=await currentDocuments(),result=await api(`/projects/${project}/processing-reports`,'POST',{documents:all.map(({id,revision})=>({id,revision})),includeEntityText:false});if(generation===epoch.current)setReport({...result,project});})}>生成当前材料处理报告</button>
  {report?.project===project&&<><p role="status">{report.report.summary.total_files} 份材料，{report.report.summary.total_matches} 项候选，副本校验 {report.report.meta.copy_export_test}。</p>{['zip','json','html','md','csv'].map(format=><a key={format} href={appUrl(`/api/projects/${project}/processing-reports/${report.id}/download?format=${format}`)} target="_blank" rel="noreferrer">下载 {format.toUpperCase()} </a>)}</>}
  <h2>Markdown 导出统计</h2><button className="secondary" onClick={()=>void run(async()=>{const generation=epoch.current,result=await api(`/projects/${project}/markdown-export-stats`);if(generation===epoch.current)setStats(result);})}>刷新实际导出统计</button>
  {stats&&<table><tbody>{Object.entries(stats.counts).map(([k,v])=><tr key={k}><th>{({success:'成功',simplified:'简化',failed:'失败',cancelled:'取消',drafts:'待人工处理稿'} as Record<string,string>)[k]}</th><td>{String(v)}</td></tr>)}</tbody></table>}
  <h2>资源诊断</h2><button className="secondary" onClick={()=>void run(async()=>{const generation=epoch.current,result=await api(`/projects/${project}/resource-diagnostics`);if(generation===epoch.current)setResources(result);})}>读取项目资源情况</button>{resources&&<p>材料 {resources.documents} 份，原件 {resources.sourceBytes} bytes，页图 {resources.canonicalPages} 页。</p>}
  <h2>强制识别</h2><p className="muted">添加后将重新识别选定材料并重置复核，请在处理完成后复核结果。</p>
  <label>范围<select value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="file">当前文件</option><option value="project">项目全部材料</option></select></label>
  {scope==='file'&&<label>材料<select value={document} onChange={e=>setDocument(e.target.value)}><option value="">请选择材料</option>{loaded.map(d=><option value={d.id} key={d.id}>{d.name??d.id}</option>)}</select></label>}
  <label>信息类型<select value={entityType} onChange={e=>setEntityType(e.target.value)}>{types.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
  {entityType==='__raw__'&&<label>实体类型名称<input value={rawType} onChange={e=>setRawType(e.target.value)}/></label>}
  <label>内容<input value={pattern} onChange={e=>setPattern(e.target.value)}/></label>
  <button disabled={!pattern.trim()||!effectiveType||scope==='file'&&!document} onClick={()=>void run(async()=>{const generation=epoch.current,all=await currentDocuments(),selected=scope==='project'?all:all.filter(d=>d.id===document);if(!selected.length)throw new Error('材料已变化，请重新选择');const result=await api(`/projects/${project}/runtime-rules`,'POST',{entityType:effectiveType,pattern,scope,ruleType:'whitelist',documents:selected.map(({id,revision})=>({id,revision}))});if(generation!==epoch.current)return;setStatus(result.added?`已排队 ${result.queuedDocuments.length} 份材料重新识别，请复核结果。`:'规则已存在，未重复排队。');await onChanged?.();})}>添加并重新识别</button>
  {status&&<p role="status">{status}</p>}
 </div>}</section>;
}
