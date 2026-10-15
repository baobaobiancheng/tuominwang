import {parentPort,workerData} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import type {RuntimeWhitelist} from '../core/runtime-rule-update.ts';
/** The current detect thread asks its authenticated parent for this task's
 * final rule window. Neither application database credentials nor jobs from
 * another task enter this worker. Parent closes the accepting window first. */
export async function readLiveRuntimeRules():Promise<RuntimeWhitelist[]>{
 if(!parentPort||!workerData?.liveRuntimeRules)return[];
 const port=parentPort,requestId=randomUUID();
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);port.off('message',receive);};
  const receive=(message:any)=>{
   if(message?.type!=='runtime-rules-reply'||message.requestId!==requestId)return;
   cleanup();
   if(!Array.isArray(message.rules)||message.rules.some((r:any)=>!r||typeof r.entityType!=='string'||typeof r.pattern!=='string')){reject(Error('RUNTIME_RULE_DELIVERY_FAILED'));return;}
   resolve(message.rules);
  };
  const timer=setTimeout(()=>{cleanup();reject(Error('RUNTIME_RULE_DELIVERY_FAILED'));},10000);
  port.on('message',receive);port.postMessage({type:'runtime-rules-request',requestId});
 });
}
