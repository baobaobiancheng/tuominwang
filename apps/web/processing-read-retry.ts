/** Retry only a transient occupied processing slot, preserving the exact read. */
export async function processingRead<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
  const delays = [100, 200, 400, 800, 1000];
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { const value = await read(); signal.throwIfAborted(); return value; }
    catch (error) {
      signal.throwIfAborted();
      if ((error as { code?: string })?.code !== "PROCESSING_BUSY" || attempt >= delays.length) throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, delays[attempt]);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) { signal.removeEventListener("abort", abort); abort(); }
      });
    }
  }
}
