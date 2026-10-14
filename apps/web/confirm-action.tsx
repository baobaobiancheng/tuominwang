import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Request = { message: string; resolve: (accepted: boolean) => void; trigger: HTMLElement | null; signal?: AbortSignal; abort: () => void };
let pending: Request | null = null;
let present: ((request: Request | null) => void) | null = null;
let closeDialog: (() => void) | null = null;

function finish(accepted: boolean, restoreFocus = true) {
  const request = pending;
  if (!request) return;
  pending = null;
  request.signal?.removeEventListener("abort", request.abort);
  closeDialog?.();
  present?.(null);
  if (restoreFocus && request.trigger?.isConnected) request.trigger.focus({ preventScroll: true });
  request.resolve(accepted);
}

export function confirmAction(message: string, signal?: AbortSignal): Promise<boolean> {
  // A second caller must never receive the first caller's approval or queue a duplicate write.
  if (pending || !present || signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const request: Request = { message, resolve, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null, signal, abort: () => { if (pending === request) finish(false); } };
    pending = request;
    signal?.addEventListener("abort", request.abort, { once: true });
    present!(request);
  });
}

export function useConfirmAction() {
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  return useCallback((message: string) => lifetime.current ? confirmAction(message, lifetime.current.signal) : Promise.resolve(false), []);
}

export function ConfirmationDialog() {
  const [request, setRequest] = useState<Request | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    present = setRequest;
    closeDialog = () => dialog.current?.close();
    // App survives session expiry; its pending actions must not cover the login
    // screen or resume against the expired account after approval.
    const expire = () => finish(false, false);
    window.addEventListener("session-expired", expire);
    return () => { window.removeEventListener("session-expired", expire); finish(false, false); present = null; closeDialog = null; };
  }, []);
  useLayoutEffect(() => {
    if (!request || pending !== request) return;
    try { dialog.current?.showModal(); cancel.current?.focus(); }
    catch { finish(false); }
  }, [request]);
  return createPortal(<dialog ref={dialog} className="action-confirm-dialog" role="alertdialog" aria-label="操作确认" aria-describedby="action-confirm-message" onCancel={event => { event.preventDefault(); event.stopPropagation(); finish(false); }} onClose={() => { if (pending === request && !dialog.current?.open) finish(false); }}>
    <h2>操作确认</h2>
    <p id="action-confirm-message">{request?.message}</p>
    <div className="actions"><button ref={cancel} type="button" className="secondary" onClick={() => finish(false)}>取消</button><button type="button" onClick={() => finish(true)}>确认执行</button></div>
  </dialog>, document.body);
}

if (import.meta.hot) import.meta.hot.dispose(() => { finish(false, false); present = null; closeDialog = null; });
