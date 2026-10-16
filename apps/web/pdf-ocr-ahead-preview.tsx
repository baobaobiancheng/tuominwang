import React,{useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy,PDFDocumentLoadingTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {appUrl} from './urls.ts';

/** PDF preview is independent of the recognition checkpoint, as in the original viewer. */
export function PdfOcrAheadPreview({documentId,revision,page,totalPages,additionalRotation,visible,onPageCount,api}:{documentId:string;revision:number;page:number;totalPages:number;additionalRotation:number;visible:boolean;onPageCount:(count:number)=>void;api:(path:string,method?:string,payload?:unknown)=>Promise<any>}){
 const canvas=useRef<HTMLCanvasElement>(null),[document,setDocument]=useState<PDFDocumentProxy|null>(null),[error,setError]=useState(''),[rendered,setRendered]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let live=true,lease:{project:string;id:string}|null=null,released=false,loading:PDFDocumentLoadingTask|null=null,opened:PDFDocumentProxy|null=null;
  const release=async()=>{if(!lease||released)return;released=true;await api(`/projects/${lease.project}/release-sources`,'POST',{resourceIds:[lease.id]});};
  async function load(){
   const details=await api(`/documents/${documentId}?revision=${revision}`),project=String(details.project_id);
   const issued=await api(`/documents/${documentId}/source-leases`,'POST',{revision});lease={project,id:issued.sourceRef.id};if(!live){await release();return;}
   const response=await fetch(appUrl(`/api/projects/${project}/processing-resources/${lease.id}`),{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error(`SOURCE_${response.status}`);
   const bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
   if(digest!==issued.sourceRef.hash)throw Error('SOURCE_MISMATCH');
   const pdfjs=await import('pdfjs-dist');
   pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
   loading=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true,wasmUrl:appUrl('/pdfjs-wasm/')});
   const timer=setTimeout(()=>void loading?.destroy(),45000);
   try{opened=await loading.promise;}finally{clearTimeout(timer);}
   if(!Number.isSafeInteger(opened.numPages)||opened.numPages<1)throw Error('PAGE_LIMIT');
   if(live){onPageCount(opened.numPages);setDocument(opened);}else await opened.destroy();
  }
  void load().catch(e=>{void release().catch(()=>{});if(live)setError(String(e));});
  return()=>{live=false;void loading?.destroy();void opened?.destroy();void release().catch(()=>{});};
 },[documentId,revision,retry]);
 useEffect(()=>{if(document&&totalPages>0&&document.numPages!==totalPages)setError('PAGE_COUNT_MISMATCH');},[document,totalPages]);
 useEffect(()=>{if(!document||!canvas||!visible)return;let live=true,renderTask:any,pageRef:any;setRendered(false);setError('');
  void (async()=>{const p=await document.getPage(page+1);pageRef=p;if(!live)return;const angle=(p.rotate+additionalRotation)%360,viewport=p.getViewport({scale:1.5,rotation:angle}),target=canvas.current;if(!target)return;target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);const context=target.getContext('2d');if(!context)throw Error('CANVAS_UNAVAILABLE');renderTask=p.render({canvasContext:context,canvas:target,viewport});await renderTask.promise;if(live)setRendered(true);})().catch(e=>{if(live)setError(String(e));});
  return()=>{live=false;void renderTask?.cancel();pageRef?.cleanup();};
 },[document,page,additionalRotation,visible]);
 return <section aria-label="识别前 PDF 原页预览" className="page-preview" style={{display:visible?'block':'none'}}><h4>第 {page+1} 页原件</h4><canvas ref={canvas} style={{width:'100%',height:'auto',display:rendered?'block':'none'}}/>{!rendered&&!error&&<p role="status">正在渲染原页预览…</p>}{error&&<p role="alert">原页预览失败：{error} <button type="button" onClick={()=>{setError('');setRetry(value=>value+1);}}>重试预览</button></p>}<p className="muted">此页识别结果尚未就绪；完成后可选取文字及保存人工草稿。</p></section>;
}
