import {randomUUID} from 'node:crypto';
import {parentPort,workerData} from 'node:worker_threads';

// The detect thread asks its authenticated job owner whether the original
// seal-only stage was paused. It never receives application DB credentials.
export async function pdfSealPauseRequested():Promise<boolean>{
 if(!parentPort||!workerData?.livePdfSealPause)return false;
 const port=parentPort,requestId=randomUUID();
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);port.off('message',receive);};
  const receive=(message:any)=>{
   if(message?.type!=='pdf-seal-pause-reply'||message.requestId!==requestId)return;
   cleanup();
   if(typeof message.paused!=='boolean'){reject(Error('PDF_SEAL_CONTROL_FAILED'));return;}
   resolve(message.paused);
  };
  const timer=setTimeout(()=>{cleanup();reject(Error('PDF_SEAL_CONTROL_FAILED'));},10000);
  port.on('message',receive);port.postMessage({type:'pdf-seal-pause-request',requestId});
 });
}
