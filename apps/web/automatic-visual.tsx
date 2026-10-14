import React,{useState,useEffect} from 'react';
import type {DocumentView,PageReview} from '../../packages/contracts/index.ts';
export function AutomaticVisual({doc,value,change,disabled}:{doc:DocumentView;value:PageReview;change:(next:PageReview)=>void;disabled:boolean}){
  const [chosen,setChosen]=useState<number[]>([]),[dismissed,setDismissed]=useState(false);
  useEffect(()=>{setChosen([]);setDismissed(false);},[doc.id,doc.revision]);
  if(!doc.visualCandidates?.length||dismissed)return null;
  return <details><summary>识别到 {doc.visualCandidates.length} 个图像候选</summary><p className="muted">候选未执行遮盖，请核对所在页面后选择。误识别项可以跳过。</p>{doc.visualCandidates.map((c,i)=><label key={i}><input type="checkbox" disabled={disabled} checked={chosen.includes(i)} onChange={e=>setChosen(v=>e.target.checked?[...v,i]:v.filter(n=>n!==i))}/>第 {c.page+1} {doc.format==='docx'?'张图片':'页'} · {c.reason} · 位置 {Math.round(c.x)},{Math.round(c.y)} · {Math.round(c.score*100)}%</label>)}<button className="secondary" disabled={disabled||!chosen.length||value.regions.length+chosen.length>3000} onClick={()=>{change({...value,regions:[...value.regions,...chosen.map(i=>{const c=doc.visualCandidates![i];return {id:crypto.randomUUID(),page:c.page,x:c.x,y:c.y,width:c.width,height:c.height,reason:c.reason};})]});setChosen([]);setDismissed(true);}}>确认候选并加入复核草稿</button><button className="quiet" disabled={disabled} onClick={()=>setDismissed(true)}>跳过这些候选</button></details>;
}
