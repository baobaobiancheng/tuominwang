import {afterEach,expect,test,vi} from 'vitest';
import {createApiRequest,readSessionWithOneRateRetry} from '../apps/web/http-client.ts';

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
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

test('only the read-only session check retries once after a real rate window, then returns the server identity',async()=>{
 browser();vi.useFakeTimers();
 const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:'RATE_LIMITED'}),{status:429,headers:{'Retry-After':'1'}}))
  .mockResolvedValueOnce(new Response(JSON.stringify({username:'new-account'}),{status:200}));
 vi.stubGlobal('fetch',fetch);
 const pending=readSessionWithOneRateRetry(request(),new AbortController().signal);
 await vi.advanceTimersByTimeAsync(1999);
 expect(fetch).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);
 expect(await pending).toEqual({username:'new-account'});
 expect(fetch).toHaveBeenCalledTimes(2);
 for(const call of fetch.mock.calls){expect(call[0]).toBe('/api/session');expect(call[1].method).toBe('GET');expect(call[1].body).toBeUndefined();}
});
test('a second session 429 is returned and no third request or write is sent',async()=>{
 browser();vi.useFakeTimers();
 const fetch=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({error:'RATE_LIMITED'}),{status:429,headers:{'Retry-After':'0'}}));
 vi.stubGlobal('fetch',fetch);
 const pending=readSessionWithOneRateRetry(request(),new AbortController().signal);
 const rejection=expect(pending).rejects.toMatchObject({code:'RATE_LIMITED',status:429,retryAfterMs:1000});
 await vi.advanceTimersByTimeAsync(1000);await rejection;
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(fetch.mock.calls.every(call=>call[0]==='/api/session'&&call[1]?.method==='GET')).toBe(true);
});
test('session 401, network failure and malformed 429 do not retry',async()=>{
 const expired=browser();
 for(const response of [new Response(JSON.stringify({error:'SESSION_REQUIRED'}),{status:401}),new Response(JSON.stringify({error:'RATE_LIMITED'}),{status:429})]){
  const fetch=vi.fn(async()=>response);vi.stubGlobal('fetch',fetch);
  await expect(readSessionWithOneRateRetry(request(),new AbortController().signal)).rejects.toMatchObject({status:response.status});
  expect(fetch).toHaveBeenCalledTimes(1);
 }
 expect(expired).toHaveBeenCalledTimes(1);
 const fetch=vi.fn(async()=>{throw new TypeError('network')});vi.stubGlobal('fetch',fetch);
 await expect(readSessionWithOneRateRetry(request(),new AbortController().signal)).rejects.toThrow('无法连接服务');
 expect(fetch).toHaveBeenCalledTimes(1);
});
test('aborting during Retry-After prevents the second session read',async()=>{
 browser();vi.useFakeTimers();
 const fetch=vi.fn(async()=>new Response(JSON.stringify({error:'RATE_LIMITED'}),{status:429,headers:{'Retry-After':'1'}}));
 vi.stubGlobal('fetch',fetch);const abort=new AbortController(),reason=new Error('unmounted');
 const pending=readSessionWithOneRateRetry(request(),abort.signal);
 await vi.advanceTimersByTimeAsync(0);
 const rejection=expect(pending).rejects.toBe(reason);
 abort.abort(reason);await rejection;
 await vi.advanceTimersByTimeAsync(2000);
 expect(fetch).toHaveBeenCalledTimes(1);
});
