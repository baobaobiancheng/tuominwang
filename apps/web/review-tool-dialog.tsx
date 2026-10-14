import React, { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** Optional review tools leave the document and sensitive list in place. */
export function ReviewToolDialog({ open, title, close, children, error }: {
  open: boolean; title: string; close: () => void; children: React.ReactNode; error?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    else if (!open && element?.open) element.close();
  }, [open]);
  return createPortal(<dialog ref={dialog} className="review-tool-dialog" aria-label={title}
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="review-tool-heading"><h2>{title}</h2><button type="button" className="quiet" onClick={close}>返回敏感标记</button></div>
    {error && <p role="alert" className="error">{error}</p>}
    {children}
  </dialog>, document.body);
}
