import React,{useEffect,useRef,useState} from 'react';
import type {DocumentView,Mark,PageReview} from '../../packages/contracts/index.ts';
type Receipt={id:string;revision:number;documentRevision:number;savedAt:string};
export function RecoveryDraft({doc,marks,pageReview,dirty,disabled,api,onRestore}:{doc:DocumentView;marks:Mark[];pageReview:PageReview;dirty:boolean;disabled:boolean;api:<T>(path:string,method?:string,payload?:unknown)=>Promise<T>;onRestore:(marks:Mark[],pages?:PageReview)=>void}){
 const [receipt,setReceipt]=useState<Receipt|null>(null),[loaded,setLoaded]=useState(false),[write,setWrite]=useState(false),[notice,setNotice]=useState(''),epoch=useRef(0),savedVersion=useRef(0),busy=useRef(false),saveSequence=useRef(0),pending=useRef<{draft:{revision:number;marks:Mark[];pageReview?:PageReview};sequence:number}|null>(null);
 useEffect(()=>{const n=++epoch.current;setLoaded(false);setWrite(false);setReceipt(null);setNotice('');savedVersion.current=0;busy.current=false;pending.current=null;
  void api<Receipt|null>(`/documents/${doc.id}/recovery`).then(r=>{if(n!==epoch.current)return;savedVersion.current=r?.revision??0;setReceipt(r);setLoaded(true);setWrite(!r);}).catch(e=>{if(n===epoch.current)setNotice(e.message);});return()=>{epoch.current++;};
 },[doc.id,doc.revision]);
 useEffect(()=>{
  if(!loaded||!write||!dirty||disabled)return;
  const n=epoch.current,sequence=++saveSequence.current;
  const flush=async()=>{
   if(busy.current||n!==epoch.current)return;busy.current=true;
   try{
    while(pending.current&&n===epoch.current){
     const snapshot=pending.current;pending.current=null;
     try{const r=await api<Receipt>(`/documents/${doc.id}/recovery`,'PUT',{recoveryRevision:savedVersion.current,draft:snapshot.draft});if(n!==epoch.current)return;savedVersion.current=r.revision;setReceipt(r);if(snapshot.sequence===saveSequence.current)setNotice('草稿已自动保存；保存复核后才能导出。');}
     catch(e){if(n===epoch.current){pending.current=null;setWrite(false);setNotice(`草稿未保存：${(e as Error).message}`);}break;}
    }
   }finally{if(n===epoch.current)busy.current=false;}
  };
  const timer=window.setTimeout(()=>{if(n!==epoch.current)return;pending.current={draft:{revision:doc.revision,marks,...doc.pages?.length?{pageReview}:{}},sequence};void flush();},1500);
  return()=>window.clearTimeout(timer);
 },[loaded,write,dirty,disabled,marks,pageReview,doc.id,doc.revision]);
 async function restore(){if(!receipt)return;const n=epoch.current;try{const r=await api<Receipt&{draft:{marks:Mark[];pageReview?:PageReview}}>(`/documents/${doc.id}/recovery/open`,'POST',{recoveryRevision:receipt.revision});if(n!==epoch.current)return;onRestore(r.draft.marks,r.draft.pageReview);setWrite(true);setNotice('已恢复草稿，请复核并保存。');}catch(e){if(n===epoch.current)setNotice((e as Error).message);}}
 async function discard(){if(!receipt)return;const n=epoch.current;try{await api(`/documents/${doc.id}/recovery`,'DELETE',{recoveryRevision:receipt.revision});if(n!==epoch.current)return;savedVersion.current=0;setReceipt(null);setWrite(true);setNotice('自动恢复记录已移除；材料和已保存复核保留。');}catch(e){if(n===epoch.current)setNotice((e as Error).message);}}
 return <section aria-label="自动保存草稿" className="muted">{receipt&&!write&&<><p>有自动保存的复核草稿（材料版本 {receipt.documentRevision}）。</p><button className="secondary" disabled={disabled||dirty||receipt.documentRevision!==doc.revision} onClick={()=>void restore()}>恢复复核草稿</button><button className="secondary" disabled={disabled} onClick={()=>void discard()}>丢弃自动恢复记录</button></>}{notice&&<p role="status">{notice}</p>}</section>;
}
export function RecentWorkspaces({api,onOpen,disabled}:{api:<T>(path:string,method?:string,payload?:unknown)=>Promise<T>;onOpen:(project:string,doc?:string)=>Promise<void>;disabled:boolean}){
 const [recent,setRecent]=useState<{projectId:string;documentId?:string;name:string}[]>([]),[recoveries,setRecoveries]=useState<{projectId:string;documentId:string;id:string;name?:string;projectName?:string}[]>([]),[open,setOpen]=useState(false),[error,setError]=useState(''),epoch=useRef(0);
 useEffect(()=>{const n=++epoch.current;if(open)void Promise.all([api<typeof recent>('/workspace/recent'),api<typeof recoveries>('/workspace/recoveries')]).then(([r,d])=>{if(n!==epoch.current)return;setRecent(r);setRecoveries(d);}).catch(e=>{if(n===epoch.current)setError(e.message);});return()=>{epoch.current++;};},[open]);
 return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>最近打开与待恢复草稿</summary>{recent.map(r=><div className="actions" key={r.projectId}><button disabled={disabled} onClick={()=>void onOpen(r.projectId,r.documentId)}>{r.name}</button><button className="quiet" disabled={disabled} onClick={()=>void api(`/projects/${r.projectId}/workspace/recent`,'DELETE').then(()=>setRecent(v=>v.filter(x=>x.projectId!==r.projectId))).catch(e=>setError(e.message))}>从最近记录移除</button></div>)}{!recent.length&&<p>暂无最近记录。</p>}{recoveries.map(r=><button key={r.id} className="secondary" disabled={disabled} onClick={()=>void onOpen(r.projectId,r.documentId)}>打开待恢复草稿 · {r.projectName??"项目"} / {r.name??"材料"}</button>)}{error&&<p role="alert">{error}</p>}</details>;
}
