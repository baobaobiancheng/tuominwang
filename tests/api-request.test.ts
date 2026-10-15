import {afterEach,expect,test,vi} from 'vitest';
import {createApiRequest} from '../apps/web/http-client.ts';

afterEach(()=>vi.unstubAllGlobals());
const request=()=>createApiRequest({FORBIDDEN:'没有操作权限'});
function browser(){const events=new EventTarget(),expired=vi.fn();events.addEventListener('session-expired',expired);vi.stubGlobal('window',events);return expired;}

test('an already fulfilled old 401 cannot expire a session after its request was aborted',async()=>{
 const expired=browser(),abort=new AbortController(),reason=new Error('identity changed');
 let resolve!:(response:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r})));
 const pending=request()<unknown>('/projects','GET',undefined,abort.signal);
 resolve(new Response('<html>old session expired</html>',{status:401}));
 abort.abort(reason);
 await expect(pending).rejects.toBe(reason);
 expect(expired).not.toHaveBeenCalled();
});
test('a current 401 expires the session even when its response body is HTML',async()=>{
 const expired=browser();vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>expired</html>',{status:401})));
 await expect(request()('/session')).rejects.toMatchObject({message:'服务响应无效，请刷新后重试。',code:'INVALID_RESPONSE',status:401});
 expect(expired).toHaveBeenCalledOnce();
});
test.each(['<html>wait</html>','null'])('429 %s retains status and server retry delay',async body=>{
 browser();vi.stubGlobal('fetch',vi.fn(async()=>new Response(body,{status:429,headers:{'Retry-After':'2'}})));
 await expect(request()('/projects')).rejects.toMatchObject({code:'INVALID_RESPONSE',status:429,retryAfterMs:3000});
});
test('network failure has a readable message while explicit abort preserves its reason',async()=>{
 browser();vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('Failed to fetch')}));
 await expect(request()('/projects')).rejects.toThrow('无法连接服务，请检查网络后重试。');
 const abort=new AbortController(),reason=new Error('user cancelled');abort.abort(reason);
 await expect(request()('/projects','GET',undefined,abort.signal)).rejects.toBe(reason);
});
test('request keeps the signed body, signal and existing business error translation',async()=>{
 browser();const abort=new AbortController(),fetch=vi.fn(async()=>new Response(JSON.stringify({error:'FORBIDDEN'}),{status:403}));vi.stubGlobal('fetch',fetch);
 await expect(request()('/review','PUT',{revision:4},abort.signal)).rejects.toMatchObject({message:'没有操作权限',code:'FORBIDDEN',status:403});
 expect(fetch).toHaveBeenCalledWith('/api/review',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{"revision":4}',signal:abort.signal});
});
