import { test, expect } from "vitest";
import { detect, validCreditCode, validBankCard, mergeCandidates, reviewMarks, redact, verify } from "../packages/core/redaction.ts";
import { parseFile } from "../packages/core/files.ts";
import { validateAiResults } from "../packages/core/ai-candidates.ts";
import { validateCodexEvents } from "../scripts/codex-events.ts";
import { markSchema, type Anchor } from "../packages/contracts/index.ts";

test("bounded legal/finance identifiers, field hints and checksums return original UTF-16 spans", () => {
  const text = "😀电话+86 13800138000，座机010-12345678；卡号4111111111111111；开户账号：123456789012；信用代码91350100M000100Y43；(2026)粤0106民初123号；护照号：E12345678";
  expect(detect(text).map(m => [m.kind, text.slice(m.start, m.end)])).toEqual([
    ["手机号", "+86 13800138000"], ["固定电话", "010-12345678"], ["银行账号", "4111111111111111"], ["银行账号", "123456789012"], ["信用代码", "91350100M000100Y43"], ["案号", "(2026)粤0106民初123号"], ["护照号", "E12345678"],
  ]);
  expect(validCreditCode("91350100M000100Y43")).toBe(true);
  expect(validCreditCode("91350100M000100Y44")).toBe(false);
  expect(validBankCard("4111111111111111")).toBe(true);
  expect(validBankCard("4111111111111112")).toBe(false);
  expect(detect("普通编号123456789012 E12345678 4111111111111112")).toHaveLength(0);
  const parsed = parseFile(Buffer.from("姓名,开户账号,工资\n测试甲,123456789012,10000\n"), "csv");
  expect(detect(parsed.text, parsed.anchors).map(m => m.kind)).toEqual(["姓名", "银行账号", "金额"]);
});
test("contextual account/contact/license values and bounded Chinese identifiers remain pending UTF-16 candidates", () => {
  const text = "😀证券账户 A123456789；资金账号：1029384756；车牌粤B·A1234，新能源沪AD12345；微信号：wxid_example；网址https://example.invalid/path?q=1；专利CN202610123456.7，专利号：202610234567.8；备案粤ICP备2026123456号-1；不动产权证号：粤（2026）深圳市不动产权第123456号";
  const marks = detect(text);
  expect(marks.map(m => [m.kind, text.slice(m.start, m.end)])).toEqual([
    ["证券/资金账号", "A123456789"], ["证券/资金账号", "1029384756"], ["车牌号", "粤B·A1234"], ["车牌号", "沪AD12345"], ["微信号", "wxid_example"], ["网址", "https://example.invalid/path?q=1"], ["专利号", "CN202610123456.7"], ["专利号", "202610234567.8"], ["备案号", "粤ICP备2026123456号-1"], ["证照/许可证号", "粤（2026）深圳市不动产权第123456号"],
  ]);
  expect(marks[0].start).toBe(text.indexOf("A123456789"));
  expect(marks.every(m => m.decision === "pending" && m.sources?.[0].layer === "rules" && markSchema.safeParse(m).success)).toBe(true);
  expect(marks[0].sources?.[0].code).toBe("securities-account-field");
  expect(marks.find(m => m.kind === "证照/许可证号")?.sources?.[0].code).toBe("license-field");
  expect(detect("普通编号123456789012 202610123456.7 wxid_example A123456789 example.invalid 粤BI1234 粤BAA0003 比例1:100")).toHaveLength(0);
  expect(detect("微信号：a12345extraextraextraextra；证券账户：A1234567890123456789012345678901234；CN202610123456.789；粤ICP备202612345678901号")).toHaveLength(0);
  expect(detect("https://example.invalid/" + "a".repeat(2048))).toHaveLength(0);
});
test("license and securities context override only contained bank candidates; unrelated and literal dictionary cards survive", () => {
  const text = "许可证号：4111111111111111；证券账户号码：4111111111111111；银行账号：4111111111111111";
  const marks = detect(text);
  expect(marks.map(m => m.kind)).toEqual(["证照/许可证号", "证券/资金账号", "银行账号"]);
  expect(marks[2].sources?.map(s => s.code)).toEqual(["account-field", "card-luhn"]);
  const dictionary = detect("许可证号：4111111111111111", [], [{ value: "4111111111111111", kind: "银行账号" }]);
  expect(dictionary.map(m => m.kind)).toContain("银行账号");
  expect(dictionary.find(m => m.kind === "银行账号")?.sources?.[0].code).toBe("project-dictionary");
  const csv = parseFile(Buffer.from("许可证号,银行账号,微信号,备案号\n4111111111111111,4111111111111111,wxid_example,粤ICP备2026123456号-1\n"), "csv");
  expect(detect(csv.text, csv.anchors).map(m => m.kind)).toEqual(["证照/许可证号", "银行账号", "微信号", "备案号"]);
});
test("URLs containing phone/email keep each candidate; an explicit enclosing selection exports without overlap or residue", () => {
  const text = "访问 https://example.invalid/profile?phone=13800138000&mail=demo@example.com", marks = detect(text);
  expect(marks.map(m => [m.kind, text.slice(m.start, m.end)])).toEqual([
    ["网址", "https://example.invalid/profile?phone=13800138000&mail=demo@example.com"], ["手机号", "13800138000"], ["邮箱", "demo@example.com"],
  ]);
  expect(marks.every(m => m.decision === "pending")).toBe(true);
  expect(() => redact(text, marks.map(m => ({ ...m, decision: "redact" as const })))).toThrow("OVERLAPPING_MARKS");
  const reviewed = marks.map(m => ({ ...m, decision: m.kind === "网址" ? "redact" as const : "ignore" as const }));
  const output = redact(text, reviewed);
  expect(output).toBe("访问 【网址】");
  expect(() => verify(text, reviewed, output)).not.toThrow();
});
test("only the exact Word image protocol URI attribute is excluded from automatic URLs, with manual/dictionary evidence preserved", () => {
  const pictureUri = "http://schemas.openxmlformats.org/drawingml/2006/picture", values = [pictureUri, pictureUri, pictureUri, pictureUri, "https://example.invalid/business"];
  const objects = ["attribute:1:uri", "paragraph:1", "text:8", "attribute:9:descr", "attribute:10:uri"];
  let offset = 0;
  const anchors: Anchor[] = values.map((value, i) => { const start = offset; offset += value.length + 1; return { kind: "object", part: "word/document.xml", object: objects[i], start, end: start + value.length }; });
  const text = values.join("\n"), marks = detect(text, anchors);
  expect(marks.map(m => m.start)).toEqual(anchors.slice(1).map(a => a.start));
  expect(marks.every(m => m.kind === "网址" && m.decision === "pending")).toBe(true);
  expect(detect(text)).toHaveLength(5);
  const dictionary = detect(text, anchors, [{ value: pictureUri, kind: "网址" }]);
  expect(dictionary.find(m => m.start === 0)?.sources).toEqual([{ layer: "rules", code: "project-dictionary" }]);
  expect(reviewMarks([], [{ start: 0, end: pictureUri.length, kind: "网址", decision: "redact" }])[0].sources).toEqual([{ layer: "manual", code: "human-mark" }]);
});
test("only the exact CLI informational skill warning is accepted; tool use and real errors remain blocked", () => {
  const warning = { type: "item.completed", item: { type: "error", message: "Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest." } };
  expect(validateCodexEvents(JSON.stringify(warning))).toEqual({ informationalWarnings: 1 });
  expect(() => validateCodexEvents(JSON.stringify({ item: { type: "error", message: "real failure" } }))).toThrow("MODEL_CALL_REPORTED");
  expect(() => validateCodexEvents(JSON.stringify({ item: { type: "command_execution" } }))).toThrow("MODEL_UNEXPECTED_ITEM");
  expect(() => validateCodexEvents(JSON.stringify({ type: "turn.failed" }))).toThrow("MODEL_TURN_FAILED");
});
test("AI quotes must match the immutable source uniquely; unknown samples, fabricated and ambiguous quotes are rejected", () => {
  const candidate = { quote: "张三", kind: "姓名", reasonCode: "identity", uncertain: false };
  const input = { results: [{ id: "synthetic", candidates: [candidate] }] };
  expect(validateAiResults([{ id: "synthetic", text: "😀张三" }], input)[0].marks[0]).toMatchObject({ start: 2, end: 4 });
  expect(() => validateAiResults([{ id: "synthetic", text: "李四" }], input)).toThrow("AI_QUOTE_MISMATCH");
  expect(() => validateAiResults([{ id: "synthetic", text: "张三和张三" }], input)).toThrow("AI_AMBIGUOUS_QUOTE");
  expect(() => validateAiResults([{ id: "other", text: "张三" }], input)).toThrow("AI_SAMPLE_MISMATCH");
});
test("candidate merger keeps overlaps/types, deduplicates evidence, and clients cannot forge provenance", () => {
  const phone = detect("13800138000")[0];
  expect(mergeCandidates("13800138000", [phone], [phone])).toHaveLength(1);
  const overlap = { ...phone, end: 5, kind: "自定义" as const, sources: [{ layer: "ner" as const, code: "test-model" }] };
  expect(mergeCandidates("13800138000", [phone], [overlap])).toHaveLength(2);
  const forged = { ...phone, sources: [{ layer: "ai" as const, code: "forged" }], decision: "ignore" as const };
  expect(reviewMarks([phone], [forged])[0].sources).toEqual(phone.sources);
  expect(reviewMarks([], [forged])[0].sources).toEqual([{ layer: "manual", code: "human-mark" }]);
  expect(() => mergeCandidates("abc", [{ ...phone, end: 4 }])).toThrow("INVALID_MARKS");
});
