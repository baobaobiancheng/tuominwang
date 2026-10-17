import {afterEach,expect,it,vi} from 'vitest';
import {rememberedWorkspaceSave,rememberWorkspaceSave,forgetWorkspaceSave,resumeWorkspaceSave} from '../apps/web/workspace-save-cache.ts';
const first='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002';
afterEach(()=>vi.unstubAllGlobals());
it('persists only an opaque request by project and format, without stale cleanup deleting a newer request',()=>{
 const data=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)});
 rememberWorkspaceSave('project-a','native',first);expect(rememberedWorkspaceSave('project-a','native')).toBe(first);
 expect(rememberedWorkspaceSave('project-b','native')).toBeNull();expect(rememberedWorkspaceSave('project-a','secure-v3')).toBeNull();
 rememberWorkspaceSave('project-a','native',second);forgetWorkspaceSave('project-a','native',first);expect(rememberedWorkspaceSave('project-a','native')).toBe(second);
 expect([...data.values()]).toEqual([second]);forgetWorkspaceSave('project-a','native',second);expect(rememberedWorkspaceSave('project-a','native')).toBeNull();
});
it('does not turn malformed or unavailable browser storage into a save failure',()=>{
 const remove=vi.fn();vi.stubGlobal('sessionStorage',{getItem:()=>'{"password":"never-store-this"}',setItem:()=>{throw Error('storage denied');},removeItem:remove});
 expect(rememberedWorkspaceSave('project','native')).toBeNull();expect(remove).toHaveBeenCalledOnce();expect(()=>rememberWorkspaceSave('project','native',first)).not.toThrow();
 vi.stubGlobal('sessionStorage',{getItem:()=>{throw Error('storage denied');}});expect(rememberedWorkspaceSave('project','native')).toBeNull();expect(()=>forgetWorkspaceSave('project','native',first)).not.toThrow();
});

it('restores a completed receipt through the existing authenticated endpoint and preserves its opaque request',async()=>{
 const data=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)});
 const fetcher=vi.fn(async(_url:string,_options:RequestInit)=>new Response(JSON.stringify({state:'completed',receiptId:second})));vi.stubGlobal('fetch',fetcher);
 rememberWorkspaceSave('project','native',first);expect(await resumeWorkspaceSave('project','native',first,()=>true)).toEqual({state:'completed',receiptId:second});
 expect(rememberedWorkspaceSave('project','native')).toBe(first);expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual({requestId:first});
});
it('clears missing receipts but retains the request on network errors and ignores stale replies',async()=>{
 const data=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)});
 rememberWorkspaceSave('project','native',first);vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({state:'missing'})));expect((await resumeWorkspaceSave('project','native',first,()=>true))?.state).toBe('missing');expect(rememberedWorkspaceSave('project','native')).toBeNull();
 rememberWorkspaceSave('project','native',first);vi.stubGlobal('fetch',async()=>{throw Error('offline');});await expect(resumeWorkspaceSave('project','native',first,()=>true)).rejects.toThrow('offline');expect(rememberedWorkspaceSave('project','native')).toBe(first);
 let active=true;vi.stubGlobal('fetch',async()=>{active=false;return new Response(JSON.stringify({state:'missing'}));});expect(await resumeWorkspaceSave('project','native',first,()=>active)).toBeNull();expect(rememberedWorkspaceSave('project','native')).toBe(first);
});
