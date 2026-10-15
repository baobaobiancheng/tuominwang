import{isMainThread,parentPort,workerData}from'node:worker_threads';
/** Private worker control; no document bytes, tenant secrets, passwords or paths. */
export async function beginLegacyOfficeJob(jobId:string):Promise<()=>void>{
 if(isMainThread||!parentPort||workerData?.legacyOfficeControl!==true)return()=>{};
 const port=parentPort;
 await new Promise<void>((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);port.off('message',message);port.off('close',close);};
  const message=(value:any)=>{if(value?.type==='legacy-office-job-ack'&&value.jobId===jobId){cleanup();resolve();}};
  const close=()=>{cleanup();reject(new Error('PROCESSING_CANCELLED'));};
  const timer=setTimeout(()=>{cleanup();reject(new Error('LEGACY_OFFICE_CONTROL_UNAVAILABLE'));},5000);
  port.on('message',message);port.once('close',close);port.postMessage({type:'legacy-office-job',action:'start',jobId});
 });
 return()=>{port.postMessage({type:'legacy-office-job',action:'end',jobId});};
}
