export type RestorationProgress={requestId:string;state:'processing'|'persisting'|'succeeded'|'failed';completed:boolean;persisted:boolean;success?:boolean;events:{sequence:number;percent:number;message:string;stage:string;at:number}[]};
/** Observe actual server events. A worker's100 is not a saved artifact until the
 * server commits and publishes persisted=true. Cancellation discards old UI data. */
export async function observeRestorationProgress(read:()=>Promise<RestorationProgress|null>,signal:AbortSignal,onUpdate:(value:RestorationProgress)=>void,waitMs=150){
 let sequence=0;
 while(!signal.aborted){const value=await read();if(signal.aborted)return;if(value){const last=value.events.at(-1)?.sequence??0;if(last>sequence){sequence=last;onUpdate(value);}if(value.completed)return;}
  await new Promise<void>(resolve=>{if(signal.aborted){resolve();return;}const abort=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},waitMs);signal.addEventListener('abort',abort,{once:true});});
 }
}
