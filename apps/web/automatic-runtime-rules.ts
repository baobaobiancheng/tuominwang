import type {ReviewFeedbackCause} from '../../packages/core/reference-review-feedback.ts';
const identity=(m:ReviewFeedbackCause['before'][number])=>JSON.stringify([m.kind,m.rawEntityType,m.start,m.end]);
export function createAutomaticRuntimeRuleDispatcher(api:(path:string,method?:string,payload?:unknown)=>Promise<any>){
 const pending=new Set<Promise<any>>();
 return{dispatch(documentId:string,revision:number,cause:ReviewFeedbackCause,scope:'file'|'project'|'spot'='file',selection?:{start:number;end:number;entityType:string;pattern:string}){
  if(cause.producer==='audit-add')scope='file';
  const occupied=new Set(cause.before.filter(m=>!m.hiddenByType&&m.decision!=='ignore').map(identity)),added=cause.after.some(m=>!m.hiddenByType&&m.decision!=='ignore'&&!occupied.has(identity(m)));
  if(!['manual-add','audit-add','one-click-add'].includes(cause.producer)||scope==='spot'||(!added&&!selection))return Promise.resolve({success:true,appliedToTasks:0});
  const task=(async()=>{try{return await api(`/documents/${documentId}/runtime-rules/automatic`,'POST',{revision,producer:cause.producer,before:cause.before,after:cause.after,scope,...selection?{selection}:{}});}catch{return{success:false,appliedToTasks:0};}})();
  pending.add(task);void task.finally(()=>pending.delete(task));return task;
 },async flush(){while(pending.size)await Promise.allSettled([...pending]);}};
}
