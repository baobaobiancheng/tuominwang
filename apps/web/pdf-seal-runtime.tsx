import React,{useEffect,useState} from 'react';

// Presentational adapter for the original PDF seal controls. The server owns
// progress, pause acknowledgement, completed pages, and export review state.
export type PdfSealStatus = {
  jobId: string;
  revision: number;
  jobStatus: string;
  enabled: boolean;
  paused: boolean;
  sealProgress: {
    status: 'deferred' | 'complete';
    completedPageNumbers: number[];
    sealWarning?: string;
  };
};

export function PdfSealRuntime({jobId,revision,api,active,ready,busy,onPause,onSupplement}: {
  jobId: string;
  revision: number;
  api: (path:string,method?:string,payload?:unknown)=>Promise<any>;
  active: boolean;
  ready: boolean;
  busy: boolean;
  onPause: () => void;
  onSupplement: () => void;
}) {
  const [status,setStatus]=useState<PdfSealStatus|null>(null);
  const [loadError,setLoadError]=useState('');
  useEffect(()=>{
    let current=true;
    setStatus(null);setLoadError('');
    async function load(){try{
      const next=await api(`/jobs/${jobId}/pdf-seals/progress`) as PdfSealStatus;
      if(current&&next.jobId===jobId&&next.revision===revision){setStatus(next);setLoadError('');}
    }catch(e){if(current)setLoadError((e as Error).message);}}
    void load();
    const timer=window.setInterval(()=>{void load();},5000);
    return()=>{current=false;window.clearInterval(timer);};
  },[jobId,revision]);
  if ((!active && !ready) || status?.enabled === false) return null;
  if (!status) return loadError ? <p role="alert">印章进度暂不可读取，正在重试：{loadError}</p> : null;
  const deferred = status?.sealProgress.status === 'deferred';
  return <>
    <span role="status">{ready && deferred ? '印章自动检查未完成；' : ''}已保留 {status.sealProgress.completedPageNumbers.length} 页印章检查结果</span>
    {active && <button className="secondary" disabled={busy || status.paused} title="完成当前印章批次后暂停；其他检测继续，结果保留" onClick={onPause}>{status.paused ? '印章已暂停' : '暂停印章'}</button>}
    {ready && deferred && <button className="secondary" disabled={busy} onClick={onSupplement}>补检印章</button>}
    {ready && status.sealProgress.status === 'complete' && <span role="status">仍须逐项人工复核</span>}
    {status.sealProgress.sealWarning && <p role="alert" title={status.sealProgress.sealWarning}>印章补检未完成，已完成页面和结果已保留；请核对未完成页面。</p>}
    {loadError && <p role="alert">印章进度暂不可读取，正在重试：{loadError}</p>}
  </>;
}
