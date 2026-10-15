import React,{useState,useEffect,useRef}from'react';
import type{PageRotationRequest,PageRotationState}from'../../packages/contracts/page-rotation.ts';
export type PageRotationActions={state:PageRotationState;apply:(request:Omit<PageRotationRequest,'revision'>,signal?:AbortSignal)=>Promise<{revision:number}>;onApplied:(revision:number)=>Promise<void>;disabled?:boolean};
export function PageRotationControls({documentId,revision,page,pageCount,disabled,actions,onBusy}:{documentId:string;revision:number;page:number;pageCount:number;disabled:boolean;actions:PageRotationActions;onBusy:(busy:boolean)=>void}){
 const[pending,setPending]=useState<Record<string,0|90|180|270>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');const epoch=useRef(0),controller=useRef<AbortController|null>(null),latest=useRef({documentId,revision,disabled});latest.current={documentId,revision,disabled};
 useEffect(()=>{epoch.current++;controller.current?.abort();setPending({});setBusy(false);setError('');onBusy(false);return()=>{epoch.current++;controller.current?.abort();};},[documentId,revision]);
 useEffect(()=>{if(disabled){epoch.current++;controller.current?.abort();setBusy(false);onBusy(false);}},[disabled]);
 const pages=Object.keys(pending).map(Number).sort((a,b)=>a-b),angle=pending[String(page)]??actions.state.rotations[String(page)]??0;
 async function apply(mode:'recognize'|'manual'){
  if(disabled||actions.disabled||busy||!pages.length)return;const generation=++epoch.current,captured={documentId,revision},abort=new AbortController();controller.current=abort;setBusy(true);onBusy(true);setError('');
  const current=()=>!abort.signal.aborted&&generation===epoch.current&&latest.current.documentId===captured.documentId&&latest.current.revision===captured.revision&&!latest.current.disabled;
  try{const result=await actions.apply({mode,pages,rotations:pending},abort.signal);if(current()){setPending({});await actions.onApplied(result.revision);}}catch(e){if(current())setError((e as Error).message);}finally{if(generation===epoch.current){setBusy(false);onBusy(false);controller.current=null;}}
 }
 if(disabled)return null;
 return <section aria-label="PDF页面旋转"><div className="actions"><button className="secondary" disabled={busy||actions.disabled||page<0||page>=pageCount} onClick={()=>{setPending(p=>({...p,[String(page)]:((angle+90)%360)as 0|90|180|270}));setError('');}}>顺时针旋转本页90°</button><span>本页附加角度：{angle}°</span></div>
 {pages.length>0&&<div><p>待应用页面：{pages.map(p=>`${p+1}（${pending[String(p)]}°）`).join('、')}。应用后更新原件预览与识别坐标，原始PDF不变；需要重新保存复核。</p><div className="actions"><button disabled={busy||actions.disabled} onClick={()=>void apply('recognize')}>应用旋转并重新识别</button><button className="secondary" disabled={busy||actions.disabled} onClick={()=>void apply('manual')}>仅旋转，手动复核</button><button className="quiet" disabled={busy} onClick={()=>{setPending({});setError('');}}>放弃待应用旋转</button></div></div>}
 {busy&&<p role="status">正在应用页面旋转，请等待处理完成。<button className="quiet" onClick={()=>{epoch.current++;controller.current?.abort();setBusy(false);onBusy(false);setError('已取消本次请求；请重新读取材料核对当前版本。');}}>取消旋转请求</button></p>}
 {!!actions.state.manualOnlyPages.length&&<p className="muted">第 {actions.state.manualOnlyPages.map(n=>n+1).join('、')} 页采用手动复核；如需重新识别，可再次选择该页并应用。</p>}
 {actions.disabled&&<p className="muted">请先保存当前复核修改，再应用页面旋转。</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
