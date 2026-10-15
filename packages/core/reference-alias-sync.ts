export type AliasSyncRequest={fullRebuild?:boolean;dirtyKeys?:Iterable<string>;dirtyFileIds?:Iterable<string>};
export type AliasSyncBatch={fullRebuild:boolean;dirtyKeys:Set<string>;dirtyFileIds:Set<string>};
const empty=():AliasSyncBatch=>({fullRebuild:false,dirtyKeys:new Set(),dirtyFileIds:new Set()});
const pending=(b:AliasSyncBatch)=>b.fullRebuild||b.dirtyKeys.size>0||b.dirtyFileIds.size>0;
/** Source jm2/Hm2 dirty-key coordinator. A failed run is requeued in full; the
 * caller must make its durable run atomic (source mutable drafts were not). */
export class ReferenceAliasSync{
 private dirty=empty();private timer:ReturnType<typeof setTimeout>|null=null;private active:Promise<void>|null=null;private lastError:unknown=null;private disposed=false;
 run:(batch:AliasSyncBatch)=>Promise<void>;private onBackgroundError?:(error:unknown)=>void;private debounceMs:number;
 constructor(options:{run:(batch:AliasSyncBatch)=>Promise<void>;debounceMs?:number;onBackgroundError?:(error:unknown)=>void}){this.run=options.run;this.debounceMs=options.debounceMs??300;this.onBackgroundError=options.onBackgroundError;}
 private merge(request?:AliasSyncRequest){if(!request||request.fullRebuild){this.dirty.fullRebuild=true;this.dirty.dirtyKeys.clear();this.dirty.dirtyFileIds.clear();return;}if(this.dirty.fullRebuild)return;for(const key of request.dirtyKeys??[]){const value=String(key||'').trim();if(value)this.dirty.dirtyKeys.add(value);}for(const file of request.dirtyFileIds??[]){const value=String(file||'').trim();if(value)this.dirty.dirtyFileIds.add(value);}}
 private clearTimer(){if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}}
 private schedule(){if(this.disposed||this.active||!pending(this.dirty))return;this.clearTimer();this.timer=setTimeout(()=>{this.timer=null;void this.execute().catch(e=>this.onBackgroundError?.(e));},this.debounceMs);}
 private execute():Promise<void>{if(this.active)return this.active;if(!pending(this.dirty))return Promise.resolve();const batch=this.dirty;this.dirty=empty();this.lastError=null;
  // Deferring invocation guarantees active is established even for a synchronous
  // throw; a finally callback cannot race assignment and leave a stuck promise.
  const task=Promise.resolve().then(()=>this.run(batch)).catch(error=>{this.merge(batch);this.lastError=error;throw error;});this.active=task.finally(()=>{this.active=null;if(pending(this.dirty)&&this.lastError===null)this.schedule();});return this.active;
 }
 request(request?:AliasSyncRequest){if(this.disposed)return;this.merge(request);this.lastError=null;if(!this.active)this.schedule();}
 async flush(request?:AliasSyncRequest){if(this.disposed)throw new Error('ALIAS_SYNC_DISPOSED');if(request)this.merge(request);this.clearTimer();this.lastError=null;while(this.active||pending(this.dirty)){await(this.active??this.execute());this.clearTimer();}}
 dispose(){this.disposed=true;this.clearTimer();this.dirty=empty();}
 isBusy(){return this.active!==null;}
 hasPending(){return!!pending(this.dirty);}
}
