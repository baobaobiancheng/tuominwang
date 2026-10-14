import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DOMParser } from "@xmldom/xmldom";
import { expect, test } from "vitest";
import type { Mark } from "../packages/contracts/index.ts";
import { TextHighlights, typeColor } from "../apps/web/text-highlights.tsx";

function render(text: string, marks: Mark[], offset = 0) {
  const html = renderToStaticMarkup(React.createElement(TextHighlights, { text, offset, marks }));
  const pre = new DOMParser().parseFromString(html, "text/html").documentElement;
  if (!pre) throw new Error("Expected highlight pre element");
  return { html, pre, spans: Array.from(pre.getElementsByTagName("span")) };
}
function mark(start: number, end: number, kind: Mark["kind"] = "姓名", decision: Mark["decision"] = "pending"): Mark {
  return { start, end, kind, decision };
}

test("mirrors literal content safely and keeps UTF-16 offsets after emoji, line breaks and tabs", () => {
  const text = "😀张三\n\t<script>&姓名\n", { pre, spans, html } = render(text, [mark(2, 4)]);
  expect(pre.getAttribute("aria-hidden")).toBe("true");
  expect(pre.textContent).toBe(text);
  expect(spans.map(span => span.textContent)).toEqual(["张三"]);
  expect(html).toContain("&lt;script&gt;");
  expect(pre.getElementsByTagName("script")).toHaveLength(0);
});

test("clips marks across both sides of a 32K window and excludes adjacent or ignored ranges", () => {
  const offset = 32768, text = "a".repeat(32768);
  const { pre, spans } = render(text, [mark(offset - 5, offset + 2), mark(offset + text.length - 3, offset + text.length + 20, "邮箱"), mark(0, offset), mark(offset + text.length, offset + text.length + 8), mark(offset + 4, offset + 20, "机构", "ignore")], offset);
  expect(pre.textContent).toBe(text);
  expect(spans.map(span => span.textContent?.length)).toEqual([2, 3]);
});

test("overlapping decisions prioritize confirmed redaction, then specificity, independent of input order", () => {
  const marks = [mark(0, 10, "网址"), mark(1, 9, "机构", "redact"), mark(3, 6, "姓名", "redact"), mark(4, 5, "邮箱")];
  const { spans, html } = render("0123456789", marks);
  expect(spans.map(span => [span.textContent, span.getAttribute("class")?.split(" ").slice(1)])).toEqual([
    ["0", ["text-highlight--contact", "text-highlight--pending"]],
    ["12", ["text-highlight--organization", "text-highlight--redact"]],
    ["345", ["text-highlight--person", "text-highlight--redact"]],
    ["678", ["text-highlight--organization", "text-highlight--redact"]],
    ["9", ["text-highlight--contact", "text-highlight--pending"]],
  ]);
  expect(render("0123456789", marks.toReversed()).html).toBe(html);
});

test("visual boundaries never split a surrogate pair and do not mutate source marks", () => {
  const marks = [mark(2, 3)], before = structuredClone(marks), text = "A😀B";
  const { pre, spans } = render(text, marks);
  expect(spans[0].textContent).toBe("😀");
  expect(pre.textContent).toBe(text);
  expect(marks).toEqual(before);
});

test("adjacent contact types preserve their own colors and exclusive end boundaries", () => {
  const { pre, spans } = render("电话邮箱未标", [mark(0, 2, "手机号"), mark(2, 4, "邮箱")]);
  expect(pre.textContent).toBe("电话邮箱未标");
  expect(spans.map(span => [span.textContent, span.getAttribute("style")])).toEqual([
    ["电话", `--highlight-color:${typeColor("手机号")}`],
    ["邮箱", `--highlight-color:${typeColor("邮箱")}`],
  ]);
  expect(typeColor("手机号")).not.toBe(typeColor("邮箱"));
});

test("large fully overlapping candidate sets stay one visual range without repeating text", () => {
  const text = "a".repeat(32768), marks = Array.from({ length: 32768 }, (_, index) => mark(0, text.length, index % 2 ? "姓名" : "机构"));
  const { pre, spans } = render(text, marks);
  expect(pre.textContent).toBe(text);
  expect(spans).toHaveLength(1);
  expect(spans[0].getAttribute("class")).toContain("text-highlight--person");
  expect(render("", marks).pre.textContent).toBe("");
});
