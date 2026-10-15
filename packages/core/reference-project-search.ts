/** Renderer Xf/Yf/ev/nv, public 0.5.9 source. Coordinates remain original
 * UTF-16 offsets; normalization is for discovery, never a source mutation. */
export const normalizeProjectEntity=(value:string)=>value.replace(/[\s\u3000\u00a0\u202f\u200b-\u200d\u2060\ufeff\u00ad]/gu,'').replace(/（/gu,'(').replace(/）/gu,')');
export function findProjectEntity(text:string,query:string,options:{literalOnly?:boolean;maxMatches?:number}={}){
 const found:{start:number;end:number;normalized:boolean}[]=[],seen=new Set<string>();
 const add=(start:number,end:number,normalized:boolean)=>{const key=start+':'+end;if(!seen.has(key)){if(found.length>=(options.maxMatches??Infinity))throw new Error("MARK_LIMIT");seen.add(key);found.push({start,end,normalized});}};
 if(!text||!query)return found;
 for(let from=0;;){const start=text.indexOf(query,from);if(start<0)break;add(start,start+query.length,false);from=start+1;}
 if(options.literalOnly)return found.sort((a,b)=>a.start-b.start||a.end-b.end);
 const gaps:{at:number;total:number}[]=[];let removed=0;
 const compact=text.replace(/[\s\u3000\u00a0\u202f\u200b-\u200d\u2060\ufeff\u00ad]+/gu,(value,index)=>{gaps.push({at:index-removed,total:removed+value.length});removed+=value.length;return '';}).replace(/（/gu,'(').replace(/）/gu,')'),needle=normalizeProjectEntity(query);
 const originalOffset=(index:number,start:boolean)=>{let lo=0,hi=gaps.length;while(lo<hi){const mid=(lo+hi)>>>1;if(start?gaps[mid].at<=index:gaps[mid].at<index)lo=mid+1;else hi=mid;}return index+(lo?gaps[lo-1].total:0);};
 if(compact&&needle)for(let from=0;;){const start=compact.indexOf(needle,from);if(start<0)break;add(originalOffset(start,true),originalOffset(start+needle.length,false),true);from=start+1;}
 return found.sort((a,b)=>a.start-b.start||a.end-b.end);
}
