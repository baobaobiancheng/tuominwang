import React from "react";
import type { Mark } from "../../packages/contracts/index.ts";

// Keep category colors shared across pending and confirmed marks. This is a
// presentation grouping only; it does not change recognition or review decisions.
const groups: Record<Mark["kind"], string> = {
  姓名: "person", 机构: "organization", 地址: "location",
  手机号: "contact", 固定电话: "contact", 邮箱: "contact", 微信号: "contact", 网址: "contact",
  身份证号: "identity", 护照号: "identity", 信用代码: "identity", 车牌号: "identity",
  银行账号: "finance", "证券/资金账号": "finance", 金额: "finance",
  案号: "record", 专利号: "record", 备案号: "record", "证照/许可证号": "record",
  商业秘密: "other", 自定义: "other",
};
const kindOrder = new Map(Object.keys(groups).map((kind, index) => [kind, index]));
const colors: Record<Mark["kind"], string> = {
  姓名: "#d97706", 机构: "#2563eb", 地址: "#9333ea", 手机号: "#16a34a", 固定电话: "#16a34a",
  邮箱: "#db2777", 微信号: "#059669", 网址: "#475569", 身份证号: "#ea580c", 护照号: "#ea580c",
  信用代码: "#4f46e5", 车牌号: "#0d9488", 银行账号: "#0891b2", "证券/资金账号": "#7c3aed",
  金额: "#dc2626", 案号: "#a16207", 专利号: "#00c853", 备案号: "#795548", "证照/许可证号": "#caa00c",
  商业秘密: "#64748b", 自定义: "#64748b",
};
export function typeColor(kind: Mark["kind"]) { return colors[kind]; }
type Range = { start: number; end: number; mark: Mark; className: string; color: string };
type Segment = { start: number; end: number; className?: string; color?: string };

function higher(a: Range, b: Range) {
  return Number(b.mark.decision === "redact") - Number(a.mark.decision === "redact")
    || (a.mark.end - a.mark.start) - (b.mark.end - b.mark.start)
    || kindOrder.get(a.mark.kind)! - kindOrder.get(b.mark.kind)!
    || a.mark.start - b.mark.start || a.mark.end - b.mark.end;
}

function splitsPair(text: string, at: number) {
  return at > 0 && at < text.length && text.charCodeAt(at - 1) >= 0xd800 && text.charCodeAt(at - 1) <= 0xdbff
    && text.charCodeAt(at) >= 0xdc00 && text.charCodeAt(at) <= 0xdfff;
}

function segments(text: string, offset: number, marks: readonly Mark[]): Segment[] {
  const ranges: Range[] = [];
  for (const mark of marks) {
    if (mark.decision === "ignore" || !Number.isSafeInteger(mark.start) || !Number.isSafeInteger(mark.end) || mark.end <= mark.start) continue;
    let start = Math.max(0, mark.start - offset), end = Math.min(text.length, mark.end - offset);
    if (start >= end) continue;
    // Rendering must not put half an emoji into a separate DOM text node.
    // Only the visual range expands; the source and stored UTF-16 offsets stay intact.
    if (splitsPair(text, start)) start--;
    if (splitsPair(text, end)) end++;
    ranges.push({ start, end, mark, color: typeColor(mark.kind), className: `text-highlight text-highlight--${groups[mark.kind]} text-highlight--${mark.decision}` });
  }
  ranges.sort((a, b) => a.start - b.start || higher(a, b));
  const heap: Range[] = [];
  function push(range: Range) {
    heap.push(range);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (higher(heap[parent], range) <= 0) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = range;
  }
  function pop() {
    const last = heap.pop()!;
    if (!heap.length) return;
    let i = 0;
    while (i * 2 + 1 < heap.length) {
      let child = i * 2 + 1;
      if (child + 1 < heap.length && higher(heap[child + 1], heap[child]) < 0) child++;
      if (higher(last, heap[child]) <= 0) break;
      heap[i] = heap[child]; i = child;
    }
    heap[i] = last;
  }
  const result: Segment[] = [];
  let cursor = 0, index = 0;
  // Sweep start/end boundaries with a priority heap: O(m log m + text.length),
  // including fully overlapping marks, without scanning all marks per character.
  while (cursor < text.length) {
    while (index < ranges.length && ranges[index].start <= cursor) push(ranges[index++]);
    while (heap.length && heap[0].end <= cursor) pop();
    const next = Math.min(text.length, ranges[index]?.start ?? text.length, heap[0]?.end ?? text.length);
    const className = heap[0]?.className, color = heap[0]?.color, previous = result.at(-1);
    if (previous && previous.className === className && previous.color === color) previous.end = next;
    else result.push({ start: cursor, end: next, className, color });
    cursor = next;
  }
  return result;
}

/** A noninteractive background mirror for a readonly textarea, never a second editor. */
export function TextHighlights({ text, offset, marks }: { text: string; offset: number; marks: readonly Mark[] }) {
  return <pre className="text-highlights" aria-hidden="true">{segments(text, offset, marks).map(segment =>
    segment.className
      ? <span key={segment.start} className={segment.className} style={{ "--highlight-color": segment.color } as React.CSSProperties}>{text.slice(segment.start, segment.end)}</span>
      : text.slice(segment.start, segment.end)
  )}</pre>;
}
