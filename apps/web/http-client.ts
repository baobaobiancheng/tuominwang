import {appUrl} from './urls.ts';

export function createApiRequest(messages:Record<string,string>){
 return async function apiRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const endpoint = appUrl("/api" + path);
  let r: Response;
  try {
    r = await fetch(endpoint, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof TypeError) throw new Error("无法连接服务，请检查网络后重试。");
    throw error;
  }
  signal?.throwIfAborted();
  if (r.status === 401) window.dispatchEvent(new Event("session-expired"));
  const retryAfter = r.headers.get("Retry-After");
  const seconds = retryAfter !== null && /^(?:0|[1-9]\d?)$/u.test(retryAfter) ? Number(retryAfter) : NaN;
  const retryAfterMs = r.status === 429 && Number.isInteger(seconds) && seconds <= 60 ? (seconds + 1) * 1000 : undefined;
  let data: any;
  try { data = await r.json(); }
  catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error;
    throw Object.assign(new Error("服务响应无效，请刷新后重试。"), { code: "INVALID_RESPONSE", status: r.status, retryAfterMs });
  }
  signal?.throwIfAborted();
  if (!r.ok) {
    const code = data && typeof data === "object" && typeof data.error === "string" ? data.error : "INVALID_RESPONSE";
    throw Object.assign(new Error(code === "INVALID_RESPONSE" ? "服务响应无效，请刷新后重试。" : messages[code] ?? code), { code, status: r.status, retryAfterMs });
  }
  return data;
}
}
