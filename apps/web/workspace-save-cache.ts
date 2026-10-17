import {appUrl} from './urls.ts';
const validRequest=(value:string|null):value is string=>!!value&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const key=(project:string,format:string)=>`tuominwang:workspace-save:${appUrl('/')}:${project}:${format}`;
// Only an opaque request ID survives a component remount. The API still checks
// the current cookie, project permissions, expiry and snapshot before download.
export function rememberedWorkspaceSave(project:string,format:string){
 try{const value=sessionStorage.getItem(key(project,format));if(validRequest(value))return value;sessionStorage.removeItem(key(project,format));}catch{}
 return null;
}
export function rememberWorkspaceSave(project:string,format:string,request:string){
 try{if(validRequest(request))sessionStorage.setItem(key(project,format),request);}catch{}
}
export function forgetWorkspaceSave(project:string,format:string,request:string){
 try{if(sessionStorage.getItem(key(project,format))===request)sessionStorage.removeItem(key(project,format));}catch{}
}
export async function resumeWorkspaceSave(project:string,format:string,request:string,active:()=>boolean){
 while(active()){
  const response=await fetch(appUrl(`/api/projects/${project}/portable/save-result`),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:request})});
  if(!active())return null;
  if([401,403,404].includes(response.status))forgetWorkspaceSave(project,format,request);
  if(response.status===401)window.dispatchEvent(new Event('session-expired'));
  const result=await response.json();
  if(!response.ok)throw Error(result.error??`HTTP ${response.status}`);
  if(result.state!=='running'){
   if(result.state!=='completed')forgetWorkspaceSave(project,format,request);
   return result;
  }
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 return null;
}
